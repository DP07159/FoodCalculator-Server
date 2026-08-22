const service = require("./service");

function requirePrivilege(privilegeCode) {
    return async function privilegeMiddleware(req, res, next) {
        try {
            if (!req.auth?.user?.id) {
                return res.status(401).json({ error: "Anmeldung erforderlich." });
            }

            if (!req.workspace?.public_id) {
                return res.status(409).json({ error: "Workspace-Kontext ist erforderlich." });
            }

            const allowed = await service.hasPrivilege(
                req.auth.user.id,
                req.workspace.public_id,
                privilegeCode
            );

            if (!allowed) {
                return res.status(403).json({
                    error: "Keine Berechtigung für diese Aktion.",
                    required_privilege: privilegeCode
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { requirePrivilege };
