const service = require("./service");

async function list(req, res, next) {
    try {
        const items = await service.listItems(req.workspaceId, String(req.query.status || "saved"));
        res.json(items);
    } catch (error) { next(error); }
}

async function preview(req, res, next) {
    try {
        const result = await service.previewSource(req.body || {});
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) { next(error); }
}

async function create(req, res, next) {
    try {
        const result = await service.createItem({
            workspaceId: req.workspaceId,
            userId: req.auth.user.id,
            payload: req.body || {}
        });
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) { next(error); }
}

async function update(req, res, next) {
    try {
        const result = await service.updateItem({
            workspaceId: req.workspaceId,
            publicId: req.params.publicId,
            payload: req.body || {}
        });
        if (result.notFound) return res.status(404).json({ error: "Wallet-Eintrag nicht gefunden." });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) { next(error); }
}

async function remove(req, res, next) {
    try {
        const deleted = await service.deleteItem(req.workspaceId, req.params.publicId);
        if (!deleted) return res.status(404).json({ error: "Wallet-Eintrag nicht gefunden." });
        res.json({ success: true });
    } catch (error) { next(error); }
}

module.exports = { list, preview, create, update, remove };
