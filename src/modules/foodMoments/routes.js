const express = require("express");
const crypto = require("crypto");
const { run, get, all } = require("../../database/database");
const { requireAuthentication } = require("../../core/identity/middleware");
const { requireWorkspaceContext } = require("../../core/workspaces/middleware");
const { requireModuleEnabled } = require("../../core/platformAdmin/moduleAccessMiddleware");
const workspaceRepository = require("../../core/workspaces/repository");

const router = express.Router();
router.use(requireAuthentication);
router.use(requireWorkspaceContext);
router.use(requireModuleEnabled("food_moments"));

function clean(value) { return String(value ?? "").trim(); }
function publicId() { return `fm_${crypto.randomBytes(12).toString("hex")}`; }
function intOrNull(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }

async function hydrate(row) {
    if (!row) return null;
    const [recipes, inspirations, workspace] = await Promise.all([
        all(`SELECT r.id, r.name, r.calories, r.portions
             FROM food_moment_recipe_links l
             JOIN recipes r ON r.id = l.recipe_id
             WHERE l.food_moment_id = ?
               AND (r.workspace_id = ? OR EXISTS (
                    SELECT 1 FROM recipe_workspace_assignments a
                    WHERE a.recipe_id = r.id AND a.workspace_id = ?
               ))
             ORDER BY l.id`, [row.id, row.workspace_id, row.workspace_id]),
        all(`SELECT w.public_id, w.title, w.category, w.source_url, w.source_image_url
             FROM food_moment_wallet_links l
             JOIN wallet_items w ON w.id = l.wallet_item_id
             JOIN wallet_workspace_assignments a ON a.wallet_item_id = w.id AND a.workspace_id = ?
             WHERE l.food_moment_id = ? ORDER BY l.id`, [row.workspace_id, row.id]),
        get(`SELECT public_id, name FROM workspaces WHERE id = ?`, [row.workspace_id])
    ]);
    return { ...row, recipes, inspirations, workspace };
}

router.get("/", async (req, res, next) => {
    try {
        const rows = await all(`SELECT * FROM food_moments WHERE workspace_id = ? ORDER BY COALESCE(moment_date, '9999-12-31'), created_at DESC`, [req.workspaceId]);
        res.json(await Promise.all(rows.map(hydrate)));
    } catch (error) { next(error); }
});

router.get("/:publicId", async (req, res, next) => {
    try {
        const row = await get(`SELECT * FROM food_moments WHERE public_id = ? AND workspace_id = ?`, [req.params.publicId, req.workspaceId]);
        if (!row) return res.status(404).json({ error: "Food Moment nicht gefunden." });
        res.json(await hydrate(row));
    } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
    try {
        const body = req.body || {};
        const title = clean(body.title);
        if (!title) return res.status(400).json({ error: "Bitte gib deinem Food Moment einen Namen." });
        const id = publicId();
        const result = await run(`INSERT INTO food_moments
            (public_id, workspace_id, owner_user_id, title, timing_code, moment_date, moment_time, audience_code, people_count, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id, req.workspaceId, req.auth.user.id, title, clean(body.timing_code) || "open",
            clean(body.moment_date) || null, clean(body.moment_time) || null,
            clean(body.audience_code) || "open", intOrNull(body.people_count), clean(body.notes)
        ]);
        const recipeId = intOrNull(body.recipe_id);
        if (recipeId) {
            const recipe = await get(`SELECT r.id FROM recipes r WHERE r.id = ? AND (r.workspace_id = ? OR EXISTS (SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id = r.id AND a.workspace_id = ?)) LIMIT 1`, [recipeId, req.workspaceId, req.workspaceId]);
            if (recipe) await run(`INSERT OR IGNORE INTO food_moment_recipe_links (food_moment_id, recipe_id) VALUES (?, ?)`, [result.lastID, recipe.id]);
        }
        const walletPublicId = clean(body.wallet_public_id);
        if (walletPublicId) {
            const wallet = await get(`SELECT w.id FROM wallet_items w
                JOIN wallet_workspace_assignments a ON a.wallet_item_id = w.id
                WHERE w.public_id = ? AND a.workspace_id = ? LIMIT 1`, [walletPublicId, req.workspaceId]);
            if (wallet) {
                await run(`INSERT OR IGNORE INTO food_moment_wallet_links (food_moment_id, wallet_item_id) VALUES (?, ?)`, [result.lastID, wallet.id]);
                await run(`INSERT OR IGNORE INTO wallet_item_relations (wallet_item_id, target_type, target_reference, created_by_user_id) VALUES (?, 'food_moment', ?, ?)`, [wallet.id, id, req.auth.user.id]);
            }
        }
        const row = await get(`SELECT * FROM food_moments WHERE id = ?`, [result.lastID]);
        res.status(201).json(await hydrate(row));
    } catch (error) { next(error); }
});

router.patch("/:publicId", async (req, res, next) => {
    try {
        const existing = await get(`SELECT * FROM food_moments WHERE public_id = ? AND workspace_id = ?`, [req.params.publicId, req.workspaceId]);
        if (!existing) return res.status(404).json({ error: "Food Moment nicht gefunden." });
        const body = req.body || {};
        let targetWorkspaceId = existing.workspace_id;
        const targetWorkspacePublicId = clean(body.workspace_public_id);
        if (targetWorkspacePublicId) {
            const eligible = await workspaceRepository.listActiveWorkspacesForUser(req.auth.user.id);
            const target = eligible.find(item => item.public_id === targetWorkspacePublicId);
            if (!target) return res.status(403).json({ error: "Dieser Workspace steht dir nicht zur Verfügung." });
            targetWorkspaceId = Number(target.id);
        }
        await run(`UPDATE food_moments SET workspace_id=?, title=?, timing_code=?, moment_date=?, moment_time=?, audience_code=?, people_count=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
            targetWorkspaceId,
            clean(body.title ?? existing.title) || existing.title,
            clean(body.timing_code ?? existing.timing_code) || "open",
            clean(body.moment_date ?? existing.moment_date) || null,
            clean(body.moment_time ?? existing.moment_time) || null,
            clean(body.audience_code ?? existing.audience_code) || "open",
            intOrNull(body.people_count ?? existing.people_count), clean(body.notes ?? existing.notes), existing.id
        ]);
        if (targetWorkspaceId !== existing.workspace_id) {
            await run(`DELETE FROM food_moment_recipe_links
                       WHERE food_moment_id = ? AND recipe_id NOT IN (
                           SELECT r.id FROM recipes r
                           WHERE r.workspace_id = ? OR EXISTS (
                               SELECT 1 FROM recipe_workspace_assignments a
                               WHERE a.recipe_id = r.id AND a.workspace_id = ?
                           )
                       )`, [existing.id, targetWorkspaceId, targetWorkspaceId]);
            await run(`DELETE FROM food_moment_wallet_links
                       WHERE food_moment_id = ? AND wallet_item_id NOT IN (
                           SELECT wallet_item_id FROM wallet_workspace_assignments WHERE workspace_id = ?
                       )`, [existing.id, targetWorkspaceId]);
        }
        res.json(await hydrate(await get(`SELECT * FROM food_moments WHERE id = ?`, [existing.id])));
    } catch (error) { next(error); }
});

router.delete("/:publicId", async (req, res, next) => {
    try {
        const existing = await get(`SELECT id FROM food_moments WHERE public_id = ? AND workspace_id = ?`, [req.params.publicId, req.workspaceId]);
        if (!existing) return res.status(404).json({ error: "Food Moment nicht gefunden." });
        await run(`DELETE FROM food_moments WHERE id = ?`, [existing.id]);
        res.json({ success: true });
    } catch (error) { next(error); }
});

module.exports = router;
