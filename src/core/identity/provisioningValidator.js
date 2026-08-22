const {
    normalizeEmail,
    validateEmail,
    validatePassword
} = require("./validator");

const MANAGEABLE_USER_STATUSES = new Set(["active", "suspended"]);

function validateProvisionUserPayload(payload = {}) {
    const email = normalizeEmail(payload.email);
    const displayName = String(payload.display_name || payload.displayName || "")
        .replace(/\s+/g, " ")
        .trim();
    const password = typeof payload.password === "string" ? payload.password : "";
    const locale = String(payload.locale || "de-DE").trim() || "de-DE";
    const workspaceName = String(payload.workspace_name || payload.workspaceName || "")
        .replace(/\s+/g, " ")
        .trim();

    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
    if (!displayName) return { error: "Anzeigename ist erforderlich." };
    if (displayName.length > 120) return { error: "Anzeigename ist zu lang." };

    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };

    if (locale.length > 32) return { error: "Locale ist zu lang." };
    if (workspaceName.length > 120) return { error: "Workspace-Name ist zu lang." };

    return {
        value: {
            email,
            displayName,
            password,
            locale,
            workspaceName: workspaceName || "Persönlicher Workspace"
        }
    };
}

function validateUserStatusPayload(payload = {}) {
    const email = normalizeEmail(payload.email);
    const status = String(payload.status || "").trim().toLowerCase();

    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
    if (!MANAGEABLE_USER_STATUSES.has(status)) {
        return { error: "Status muss active oder suspended sein." };
    }

    return { value: { email, status } };
}

module.exports = {
    MANAGEABLE_USER_STATUSES,
    validateProvisionUserPayload,
    validateUserStatusPayload
};
