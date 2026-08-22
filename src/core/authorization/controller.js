const service = require("./service");

async function effectivePermissions(req, res) {
    try {
        const effective = await service.getEffectiveAuthorization(
            req.auth.user.id,
            req.workspace.public_id
        );

        if (!effective) {
            return res.status(403).json({
                error: "Keine aktive Workspace-Mitgliedschaft."
            });
        }

        res.json({
            workspace: {
                public_id: req.workspace.public_id,
                name: req.workspace.name
            },
            ...effective
        });
    } catch (error) {
        console.error("Fehler bei GET /authorization/effective-permissions:", error.message);
        res.status(500).json({ error: "Berechtigungen konnten nicht ermittelt werden." });
    }
}

module.exports = { effectivePermissions };
