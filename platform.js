const PLATFORM_API_URL = "https://foodcalculator-server.onrender.com";

const PlatformShell = (() => {
    const TOKEN_KEY = "fc_platform_token";
    const WORKSPACE_KEY = "fc_workspace_public_id";

    const state = {
        token: localStorage.getItem(TOKEN_KEY) || "",
        user: null,
        workspaces: [],
        workspace: null,
        roles: [],
        capabilities: [],
        privileges: [],
        ready: false
    };

    let initPromise = null;

    function isLoginPage() {
        return window.location.pathname.endsWith("/login.html") ||
            window.location.pathname === "/login.html";
    }

    function isApiUrl(url) {
        try {
            const absolute = new URL(url, window.location.origin);
            return absolute.origin === new URL(PLATFORM_API_URL).origin;
        } catch {
            return false;
        }
    }

    function getPrivilegeCodes() {
        return new Set((state.privileges || []).map(item => item.code));
    }

    function hasPermission(code) {
        if (!code) return true;
        return getPrivilegeCodes().has(code);
    }

    function getToken() {
        return state.token || "";
    }

    function getWorkspacePublicId() {
        return state.workspace?.public_id ||
            localStorage.getItem(WORKSPACE_KEY) ||
            "";
    }

    function setToken(token) {
        state.token = String(token || "");
        if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
        else localStorage.removeItem(TOKEN_KEY);
    }

    function setWorkspace(workspace) {
        state.workspace = workspace || null;
        if (workspace?.public_id) {
            localStorage.setItem(WORKSPACE_KEY, workspace.public_id);
        } else {
            localStorage.removeItem(WORKSPACE_KEY);
        }
    }

    function clearSession() {
        state.token = "";
        state.user = null;
        state.workspaces = [];
        state.workspace = null;
        state.roles = [];
        state.capabilities = [];
        state.privileges = [];
        state.ready = false;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(WORKSPACE_KEY);
    }

    async function apiFetch(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = getToken();
        const workspaceId = getWorkspacePublicId();

        if (token && !headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        if (workspaceId && !headers.has("X-Workspace-Id")) {
            headers.set("X-Workspace-Id", workspaceId);
        }

        const response = await window.__fcNativeFetch(
            path.startsWith("http") ? path : `${PLATFORM_API_URL}${path}`,
            { ...options, headers }
        );

        if (response.status === 401 && !isLoginPage()) {
            clearSession();
            window.location.replace("/login.html?reason=session");
        }

        return response;
    }

    async function apiJson(path, options = {}) {
        const response = await apiFetch(path, options);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(payload?.error || "Serverfehler");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    async function login(email, password) {
        const response = await window.__fcNativeFetch(`${PLATFORM_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.error || "Anmeldung fehlgeschlagen.");
        }

        if (!payload?.token) {
            throw new Error("Anmeldung lieferte kein Session-Token.");
        }

        setToken(payload.token);
        state.user = payload.user || null;
        await initializeContext();

        return payload;
    }

    async function logout() {
        try {
            if (getToken()) {
                await apiFetch("/auth/logout", { method: "POST" });
            }
        } finally {
            clearSession();
            window.location.replace("/login.html");
        }
    }

    async function loadUser() {
        const payload = await apiJson("/auth/me");
        state.user = payload?.user || payload || null;
    }

    async function loadWorkspaces() {
        const payload = await apiJson("/workspaces");
        state.workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];

        const storedId = localStorage.getItem(WORKSPACE_KEY);
        let selected = storedId
            ? state.workspaces.find(item => item.public_id === storedId)
            : null;

        if (!selected) {
            selected = state.workspaces.find(item => item.workspace_type === "personal") ||
                state.workspaces[0] ||
                null;
        }

        setWorkspace(selected);
    }

    async function loadPermissions() {
        if (!state.workspace) {
            state.roles = [];
            state.capabilities = [];
            state.privileges = [];
            return;
        }

        const payload = await apiJson("/authorization/effective-permissions", {
            headers: {
                "X-Workspace-Id": state.workspace.public_id
            }
        });

        state.roles = Array.isArray(payload?.roles) ? payload.roles : [];
        state.capabilities = Array.isArray(payload?.capabilities) ? payload.capabilities : [];
        state.privileges = Array.isArray(payload?.privileges) ? payload.privileges : [];
    }

    async function initializeContext() {
        if (state.ready) {
            renderPlatformContext();
            applyPermissionState();
            return getContext();
        }

        if (initPromise) {
            return initPromise;
        }

        initPromise = (async () => {
            if (!getToken()) {
                if (!isLoginPage()) {
                    window.location.replace("/login.html");
                }
                return null;
            }

            try {
                await loadUser();
                await loadWorkspaces();
                await loadPermissions();

                state.ready = true;
                document.body?.classList.remove("permission-pending");

                applyPermissionState();
                renderPlatformContext();

                const context = getContext();
                document.dispatchEvent(new CustomEvent("platform:ready", {
                    detail: context
                }));

                return context;
            } catch (error) {
                console.error("Platform Shell konnte nicht initialisiert werden:", error);

                document.body?.classList.remove("permission-pending");

                if (error?.status === 401) {
                    clearSession();
                    if (!isLoginPage()) {
                        window.location.replace("/login.html?reason=session");
                    }
                    return null;
                }

                document.dispatchEvent(new CustomEvent("platform:error", {
                    detail: {
                        message: error?.message || "Platform-Kontext konnte nicht geladen werden."
                    }
                }));

                throw error;
            } finally {
                initPromise = null;
            }
        })();

        return initPromise;
    }

    async function switchWorkspace(publicId) {
        const workspace = state.workspaces.find(item => item.public_id === publicId);
        if (!workspace) {
            throw new Error("Workspace wurde nicht gefunden.");
        }

        setWorkspace(workspace);
        await loadPermissions();
        applyPermissionState();
        renderPlatformContext();

        document.dispatchEvent(new CustomEvent("platform:workspace-changed", {
            detail: getContext()
        }));
    }

    function applyPermissionState(root = document) {
        root.querySelectorAll("[data-privilege]").forEach(element => {
            const required = String(element.dataset.privilege || "").trim();
            const allowed = hasPermission(required);

            element.classList.toggle("permission-denied", !allowed);
            element.toggleAttribute("disabled", !allowed);
            element.setAttribute("aria-disabled", allowed ? "false" : "true");

            if (!allowed) {
                element.setAttribute(
                    "title",
                    element.getAttribute("title") || "Für diese Funktion fehlt die Berechtigung."
                );
            }
        });
    }

    function renderPlatformContext() {
        const target = document.getElementById("platform-context");
        if (!target) return;

        const workspaceOptions = state.workspaces.map(workspace => `
            <option value="${escapeHtml(workspace.public_id)}" ${workspace.public_id === state.workspace?.public_id ? "selected" : ""}>
                ${escapeHtml(workspace.name)}
            </option>
        `).join("");

        target.innerHTML = `
            <div class="platform-context-user">
                <strong>${escapeHtml(state.user?.display_name || state.user?.email || "Benutzer")}</strong>
                <span>${escapeHtml(state.user?.email || "")}</span>
            </div>
            <select id="platform-workspace-select" class="platform-workspace-select" aria-label="Workspace auswählen" ${state.workspaces.length <= 1 ? "disabled" : ""}>
                ${workspaceOptions}
            </select>
            <button type="button" id="platform-logout-button" class="platform-logout-button">Abmelden</button>
        `;

        document.getElementById("platform-workspace-select")?.addEventListener("change", async event => {
            try {
                await switchWorkspace(event.target.value);
                window.location.reload();
            } catch (error) {
                console.error(error);
            }
        });

        document.getElementById("platform-logout-button")?.addEventListener("click", logout);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getContext() {
        return {
            user: state.user,
            workspaces: [...state.workspaces],
            workspace: state.workspace,
            roles: [...state.roles],
            capabilities: [...state.capabilities],
            privileges: [...state.privileges],
            ready: state.ready
        };
    }

    return {
        state,
        login,
        logout,
        apiFetch,
        apiJson,
        hasPermission,
        applyPermissionState,
        initializeContext,
        switchWorkspace,
        getContext,
        getToken,
        getWorkspacePublicId,
        renderPlatformContext
    };
})();

if (!window.__fcNativeFetch) {
    window.__fcNativeFetch = window.fetch.bind(window);
}

window.fetch = function platformAwareFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;

    if (!url) {
        return window.__fcNativeFetch(input, init);
    }

    let absolute;
    try {
        absolute = new URL(url, window.location.origin);
    } catch {
        return window.__fcNativeFetch(input, init);
    }

    const apiOrigin = new URL(PLATFORM_API_URL).origin;
    if (absolute.origin !== apiOrigin) {
        return window.__fcNativeFetch(input, init);
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const token = PlatformShell.getToken();
    const workspaceId = PlatformShell.getWorkspacePublicId();

    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    if (workspaceId && !headers.has("X-Workspace-Id")) {
        headers.set("X-Workspace-Id", workspaceId);
    }

    const nextInit = { ...init, headers };
    return window.__fcNativeFetch(input, nextInit).then(response => {
        if (response.status === 401 && !window.location.pathname.endsWith("/login.html")) {
            localStorage.removeItem("fc_platform_token");
            localStorage.removeItem("fc_workspace_public_id");
            window.location.replace("/login.html?reason=session");
        }
        return response;
    });
};

document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.endsWith("/login.html")) {
        document.body.classList.add("permission-pending");
        PlatformShell.initializeContext();
    }
});
