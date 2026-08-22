const service = require("./moduleAccessService");

function requireModuleEnabled(moduleCode) {
    return async function moduleAccessMiddleware(req, res, next) {
        try {
            if (!req.auth?.user?.id) {
                return res.status(401).json({
                    error: "Anmeldung erforderlich."
                });
            }

            if (!req.workspace?.public_id) {
                return res.status(409).json({
                    error: "Workspace-Kontext ist erforderlich."
                });
            }

            const access = await service.getEffectiveModuleAccess({
                userId: req.auth.user.id,
                workspacePublicId: req.workspace.public_id,
                moduleCode
            });

            if (!access.enabled) {
                return res.status(403).json({
                    error: "Dieses Modul ist für diese Workspace-Mitgliedschaft nicht freigeschaltet.",
                    code: "MODULE_DISABLED",
                    module: moduleCode
                });
            }

            req.moduleAccess = access;
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { requireModuleEnabled };
