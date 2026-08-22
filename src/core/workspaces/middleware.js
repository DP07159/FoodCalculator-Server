const service = require("./service");

function getRequestedWorkspacePublicId(req) {
    return String(
        req.headers["x-workspace-id"] ||
        req.query.workspace_id ||
        ""
    ).trim();
}

async function requireWorkspaceContext(req, res, next) {
    try {
        if (!req.auth?.user?.id) {
            return res.status(401).json({ error: "Anmeldung erforderlich." });
        }

        const requestedPublicId = getRequestedWorkspacePublicId(req);
        const context = await service.resolveWorkspaceContextForUser(
            req.auth.user.id,
            requestedPublicId
        );

        if (!context) {
            return res.status(requestedPublicId ? 403 : 409).json({
                error: requestedPublicId
                    ? "Workspace ist nicht verfügbar oder keine aktive Mitgliedschaft vorhanden."
                    : "Aktiver Workspace konnte nicht eindeutig bestimmt werden."
            });
        }

        req.workspaceId = context.workspaceId;
        req.workspace = context.workspace;
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getRequestedWorkspacePublicId,
    requireWorkspaceContext
};
