const service = require("./service");

async function list(req, res) {
    try {
        res.json({
            workspaces: await service.listWorkspacesForUser(req.auth.user.id)
        });
    } catch (error) {
        console.error("Fehler bei GET /workspaces:", error.message);
        res.status(500).json({ error: "Workspaces konnten nicht geladen werden." });
    }
}

async function current(req, res) {
    res.json({
        workspace: req.workspace
    });
}

module.exports = { list, current };
