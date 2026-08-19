const { requireAuthentication } = require("../identity/middleware");
const repository = require("./repository");

async function requirePlatformAdminAfterAuthentication(req, res, next) {
    try {
        const allowed = await repository.isPlatformAdmin(
            req.auth.user.id
        );

        if (!allowed) {
            return res.status(403).json({
                error: "Platform-Admin-Berechtigung erforderlich."
            });
        }

        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    requireAuthentication,
    requirePlatformAdminAfterAuthentication
};
