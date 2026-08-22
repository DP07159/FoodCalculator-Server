const service = require("./service");

async function platformContext(req, res, next) {
    try {
        const context = await service.getPlatformContext(
            req.auth.user.id,
            req.workspace.public_id
        );

        if (!context) {
            return res.status(403).json({ error: "Kein aktiver Workspace-Kontext verfügbar." });
        }

        return res.json(context);
    } catch (error) {
        return next(error);
    }
}

module.exports = { platformContext };
