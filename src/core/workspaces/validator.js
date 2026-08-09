const WORKSPACE_TYPES = new Set([
    "personal",
    "family",
    "practice",
    "restaurant",
    "organization"
]);

function normalizeWorkspaceName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function validateWorkspaceName(value) {
    const name = normalizeWorkspaceName(value);
    if (!name) return "Workspace-Name ist erforderlich.";
    if (name.length > 120) return "Workspace-Name darf höchstens 120 Zeichen lang sein.";
    return null;
}

function validateWorkspaceType(value) {
    const type = String(value || "").trim();
    if (!WORKSPACE_TYPES.has(type)) return "Workspace-Typ ist ungültig.";
    return null;
}

module.exports = {
    WORKSPACE_TYPES,
    normalizeWorkspaceName,
    validateWorkspaceName,
    validateWorkspaceType
};
