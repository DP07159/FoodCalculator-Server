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

const SOURCE_CODES = new Set(["manual", "home", "recipe", "wallet", "planning_slot", "repeat", "import"]);
const TIMING_CODES = new Set(["open", "dated", "scheduled"]);

function clean(value) { return String(value ?? "").trim(); }
function publicId() { return `fm_${crypto.randomBytes(12).toString("hex")}`; }
function intOrNull(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
function uniqueInts(value) { return [...new Set((Array.isArray(value) ? value : []).map(intOrNull).filter(Boolean))]; }
function uniqueStrings(value) { return [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))]; }
function boolInt(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
    return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}
function normalizeSource(value, fallback = "manual") {
    const source = clean(value) || fallback;
    return SOURCE_CODES.has(source) ? source : fallback;
}
function normalizeIso(value) {
    const raw = clean(value);
    if (!raw) return null;
    const normalized = raw.replace(" ", "T");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(normalized)) return null;
    return normalized.length === 16 ? `${normalized}:00` : normalized;
}
function legacyDateTimeToStart(dateValue, timeValue) {
    const date = clean(dateValue);
    if (!date) return null;
    const time = clean(timeValue);
    return `${date}T${time || "00:00"}${time && time.length > 5 ? "" : ":00"}`;
}
function legacyPartsFromStart(startsAt, isAllDay) {
    if (!startsAt) return { momentDate: null, momentTime: null };
    const date = startsAt.slice(0, 10);
    const time = isAllDay ? null : startsAt.slice(11, 16);
    return { momentDate: date, momentTime: time || null };
}
function deriveTimingCode({ timingCode, startsAt, isAllDay }) {
    const requested = clean(timingCode);
    if (requested && TIMING_CODES.has(requested)) return requested;
    if (!startsAt) return "open";
    return isAllDay ? "dated" : "scheduled";
}
function resolveTiming(body, existing = null) {
    const has = key => Object.prototype.hasOwnProperty.call(body, key);
    let startsAt;
    if (has("starts_at")) startsAt = clean(body.starts_at) ? normalizeIso(body.starts_at) : null;
    else if (has("moment_date") || has("moment_time")) {
        const date = has("moment_date") ? clean(body.moment_date) : clean(existing?.moment_date);
        const time = has("moment_time") ? clean(body.moment_time) : clean(existing?.moment_time);
        startsAt = legacyDateTimeToStart(date, time);
    } else startsAt = existing?.starts_at || legacyDateTimeToStart(existing?.moment_date, existing?.moment_time);

    if (has("starts_at") && clean(body.starts_at) && !startsAt) return { error: "Ungültiger Startzeitpunkt." };

    let endsAt = has("ends_at") ? (clean(body.ends_at) ? normalizeIso(body.ends_at) : null) : (existing?.ends_at || null);
    if (has("ends_at") && clean(body.ends_at) && !endsAt) return { error: "Ungültiger Endzeitpunkt." };
    if (startsAt && endsAt && endsAt < startsAt) return { error: "Der Endzeitpunkt darf nicht vor dem Start liegen." };

    let isAllDay;
    if (has("is_all_day")) isAllDay = boolInt(body.is_all_day);
    else if (has("moment_date") && !clean(body.moment_time)) isAllDay = clean(body.moment_date) ? 1 : 0;
    else if (existing) isAllDay = Number(existing.is_all_day) === 1 ? 1 : 0;
    else isAllDay = startsAt && !clean(body.moment_time) && !has("starts_at") ? 1 : 0;

    if (!startsAt) { endsAt = null; isAllDay = 0; }
    const legacy = legacyPartsFromStart(startsAt, isAllDay);
    const timingCode = deriveTimingCode({ timingCode: has("timing_code") ? body.timing_code : existing?.timing_code, startsAt, isAllDay });
    return { startsAt, endsAt, isAllDay, timingCode, ...legacy };
}

async function visibleMoment(publicIdValue, workspaceId) {
    return get(`SELECT fm.* FROM food_moments fm WHERE fm.public_id=? AND (fm.workspace_id=? OR EXISTS(SELECT 1 FROM food_moment_workspace_assignments a WHERE a.food_moment_id=fm.id AND a.workspace_id=?))`, [publicIdValue, workspaceId, workspaceId]);
}
async function hydrate(row, workspaceId) {
    if (!row) return null;
    const [recipes, inspirations, workspace, assignments, repeatedFrom] = await Promise.all([
        all(`SELECT r.id,r.name,r.calories,r.portions FROM food_moment_recipe_links l JOIN recipes r ON r.id=l.recipe_id WHERE l.food_moment_id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?)) ORDER BY l.id`, [row.id, workspaceId, workspaceId]),
        all(`SELECT w.public_id,w.title,w.category,w.source_url,w.source_image_url FROM food_moment_wallet_links l JOIN wallet_items w ON w.id=l.wallet_item_id JOIN wallet_workspace_assignments a ON a.wallet_item_id=w.id AND a.workspace_id=? WHERE l.food_moment_id=? ORDER BY l.id`, [workspaceId, row.id]),
        get(`SELECT public_id,name FROM workspaces WHERE id=?`, [row.workspace_id]),
        all(`SELECT ws.public_id,ws.name FROM food_moment_workspace_assignments a JOIN workspaces ws ON ws.id=a.workspace_id WHERE a.food_moment_id=? ORDER BY ws.name`, [row.id]),
        row.repeated_from_food_moment_id ? get(`SELECT public_id,title FROM food_moments WHERE id=?`, [row.repeated_from_food_moment_id]) : null
    ]);
    return { ...row, is_all_day: Number(row.is_all_day) === 1, recipes, inspirations, workspace, workspace_assignments: assignments, repeated_from: repeatedFrom || null };
}
async function syncLinks(momentId, body, workspaceId, publicMomentId, userId) {
    const recipeIds = uniqueInts(body.recipe_ids ?? (body.recipe_id ? [body.recipe_id] : []));
    const walletIds = uniqueStrings(body.wallet_public_ids ?? (body.wallet_public_id ? [body.wallet_public_id] : []));
    await run(`DELETE FROM food_moment_recipe_links WHERE food_moment_id=?`, [momentId]);
    for (const rid of recipeIds) {
        const r = await get(`SELECT r.id FROM recipes r WHERE r.id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?)) LIMIT 1`, [rid, workspaceId, workspaceId]);
        if (r) await run(`INSERT OR IGNORE INTO food_moment_recipe_links(food_moment_id,recipe_id) VALUES(?,?)`, [momentId, r.id]);
    }
    await run(`DELETE FROM food_moment_wallet_links WHERE food_moment_id=?`, [momentId]);
    await run(`DELETE FROM wallet_item_relations WHERE target_type='food_moment' AND target_reference=?`, [publicMomentId]);
    for (const wid of walletIds) {
        const w = await get(`SELECT w.id FROM wallet_items w JOIN wallet_workspace_assignments a ON a.wallet_item_id=w.id WHERE w.public_id=? AND a.workspace_id=? LIMIT 1`, [wid, workspaceId]);
        if (w) {
            await run(`INSERT OR IGNORE INTO food_moment_wallet_links(food_moment_id,wallet_item_id) VALUES(?,?)`, [momentId, w.id]);
            await run(`INSERT OR IGNORE INTO wallet_item_relations(wallet_item_id,target_type,target_reference,created_by_user_id) VALUES(?,'food_moment',?,?)`, [w.id, publicMomentId, userId]);
        }
    }
}
async function createMoment(body, workspaceId, userId, options = {}) {
    const title = clean(body.title);
    if (!title) return { error: "Bitte gib deinem Food Moment einen Namen." };
    const timing = resolveTiming(body);
    if (timing.error) return timing;
    const id = publicId();
    const sourceCode = normalizeSource(options.sourceCode || body.source_code, "manual");
    const sourceReference = clean(options.sourceReference ?? body.source_reference) || null;
    const repeatedFromId = options.repeatedFromId || null;
    const result = await run(`INSERT INTO food_moments(public_id,workspace_id,owner_user_id,title,timing_code,moment_date,moment_time,starts_at,ends_at,is_all_day,audience_code,people_count,status,notes,source_code,source_reference,repeated_from_food_moment_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        id, workspaceId, userId, title, timing.timingCode, timing.momentDate, timing.momentTime, timing.startsAt, timing.endsAt, timing.isAllDay,
        clean(body.audience_code) || "open", intOrNull(body.people_count), clean(body.status) || "planned", clean(body.notes), sourceCode, sourceReference, repeatedFromId
    ]);
    await run(`INSERT OR IGNORE INTO food_moment_workspace_assignments(food_moment_id,workspace_id,assigned_by_user_id) VALUES(?,?,?)`, [result.lastID, workspaceId, userId]);
    await syncLinks(result.lastID, body, workspaceId, id, userId);
    return { value: await hydrate(await get(`SELECT * FROM food_moments WHERE id=?`, [result.lastID]), workspaceId) };
}

router.get("/", async (req, res, next) => {
    try {
        const clauses = [`(fm.workspace_id=? OR a.workspace_id=?)`];
        const params = [req.workspaceId, req.workspaceId];
        const view = clean(req.query.view);
        const from = normalizeIso(req.query.from);
        const to = normalizeIso(req.query.to);
        if (view === "open") clauses.push(`fm.starts_at IS NULL`);
        if (view === "upcoming") clauses.push(`fm.starts_at IS NOT NULL AND datetime(fm.starts_at) >= datetime('now')`);
        if (view === "past") clauses.push(`fm.starts_at IS NOT NULL AND datetime(fm.starts_at) < datetime('now')`);
        if (from) { clauses.push(`datetime(fm.starts_at) >= datetime(?)`); params.push(from); }
        if (to) { clauses.push(`datetime(fm.starts_at) < datetime(?)`); params.push(to); }
        const rows = await all(`SELECT DISTINCT fm.* FROM food_moments fm LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE ${clauses.join(" AND ")} ORDER BY CASE WHEN fm.starts_at IS NULL THEN 1 ELSE 0 END, fm.starts_at ASC, fm.created_at DESC`, params);
        res.json(await Promise.all(rows.map(r => hydrate(r, req.workspaceId))));
    } catch (e) { next(e); }
});
router.get("/recipe/:recipeId", async (req, res, next) => {
    try {
        const recipeId = intOrNull(req.params.recipeId);
        if (!recipeId) return res.status(400).json({ error: "Ungültige Rezept-ID." });
        const recipe = await get(`SELECT r.id FROM recipes r WHERE r.id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?)) LIMIT 1`, [recipeId, req.workspaceId, req.workspaceId]);
        if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });
        const rows = await all(`SELECT DISTINCT fm.* FROM food_moments fm JOIN food_moment_recipe_links l ON l.food_moment_id=fm.id LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE l.recipe_id=? AND (fm.workspace_id=? OR a.workspace_id=?) ORDER BY CASE WHEN fm.starts_at IS NULL THEN 1 ELSE 0 END, fm.starts_at ASC, fm.created_at DESC`, [recipeId, req.workspaceId, req.workspaceId]);
        res.json(await Promise.all(rows.map(r => hydrate(r, req.workspaceId))));
    } catch (e) { next(e); }
});
router.get("/:publicId", async (req, res, next) => { try { const row = await visibleMoment(req.params.publicId, req.workspaceId); if (!row) return res.status(404).json({ error: "Food Moment nicht gefunden." }); res.json(await hydrate(row, req.workspaceId)); } catch (e) { next(e); } });
router.post("/", async (req, res, next) => { try { const result = await createMoment(req.body || {}, req.workspaceId, req.auth.user.id); if (result.error) return res.status(400).json({ error: result.error }); res.status(201).json(result.value); } catch (e) { next(e); } });
router.post("/:publicId/repeat", async (req, res, next) => {
    try {
        const existing = await visibleMoment(req.params.publicId, req.workspaceId);
        if (!existing) return res.status(404).json({ error: "Food Moment nicht gefunden." });
        const [recipeRows, walletRows] = await Promise.all([
            all(`SELECT recipe_id FROM food_moment_recipe_links WHERE food_moment_id=?`, [existing.id]),
            all(`SELECT w.public_id FROM food_moment_wallet_links l JOIN wallet_items w ON w.id=l.wallet_item_id WHERE l.food_moment_id=?`, [existing.id])
        ]);
        const body = req.body || {};
        const copy = {
            title: clean(body.title) || existing.title,
            starts_at: Object.prototype.hasOwnProperty.call(body, "starts_at") ? body.starts_at : null,
            ends_at: Object.prototype.hasOwnProperty.call(body, "ends_at") ? body.ends_at : null,
            is_all_day: Object.prototype.hasOwnProperty.call(body, "is_all_day") ? body.is_all_day : 0,
            timing_code: Object.prototype.hasOwnProperty.call(body, "starts_at") && clean(body.starts_at) ? undefined : "open",
            audience_code: Object.prototype.hasOwnProperty.call(body, "audience_code") ? body.audience_code : existing.audience_code,
            people_count: Object.prototype.hasOwnProperty.call(body, "people_count") ? body.people_count : existing.people_count,
            notes: Object.prototype.hasOwnProperty.call(body, "notes") ? body.notes : existing.notes,
            recipe_ids: recipeRows.map(r => r.recipe_id),
            wallet_public_ids: walletRows.map(r => r.public_id)
        };
        const result = await createMoment(copy, req.workspaceId, req.auth.user.id, { sourceCode: "repeat", sourceReference: existing.public_id, repeatedFromId: existing.id });
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (e) { next(e); }
});
router.patch("/:publicId", async (req, res, next) => {
    try {
        const existing = await visibleMoment(req.params.publicId, req.workspaceId);
        if (!existing) return res.status(404).json({ error: "Food Moment nicht gefunden." });
        if (Number(existing.owner_user_id) !== Number(req.auth.user.id)) return res.status(403).json({ error: "Nur der Eigentümer kann diesen Food Moment bearbeiten." });
        const body = req.body || {};
        const has = key => Object.prototype.hasOwnProperty.call(body, key);
        const timing = resolveTiming(body, existing);
        if (timing.error) return res.status(400).json({ error: timing.error });
        const nextTitle = has("title") ? (clean(body.title) || existing.title) : existing.title;
        const nextAudience = has("audience_code") ? (clean(body.audience_code) || "open") : existing.audience_code;
        const nextPeople = has("people_count") ? intOrNull(body.people_count) : existing.people_count;
        const nextNotes = has("notes") ? clean(body.notes) : existing.notes;
        const nextStatus = has("status") ? (clean(body.status) || existing.status) : existing.status;
        const nextSource = has("source_code") ? normalizeSource(body.source_code, existing.source_code || "manual") : (existing.source_code || "manual");
        const nextSourceReference = has("source_reference") ? (clean(body.source_reference) || null) : existing.source_reference;
        await run(`UPDATE food_moments SET title=?,timing_code=?,moment_date=?,moment_time=?,starts_at=?,ends_at=?,is_all_day=?,audience_code=?,people_count=?,status=?,notes=?,source_code=?,source_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
            nextTitle, timing.timingCode, timing.momentDate, timing.momentTime, timing.startsAt, timing.endsAt, timing.isAllDay, nextAudience, nextPeople, nextStatus, nextNotes, nextSource, nextSourceReference, existing.id
        ]);
        if ("recipe_ids" in body || "recipe_id" in body || "wallet_public_ids" in body || "wallet_public_id" in body) await syncLinks(existing.id, body, req.workspaceId, existing.public_id, req.auth.user.id);
        res.json(await hydrate(await get(`SELECT * FROM food_moments WHERE id=?`, [existing.id]), req.workspaceId));
    } catch (e) { next(e); }
});
router.get('/:publicId/workspace-assignments', async (req, res, next) => { try { const existing = await visibleMoment(req.params.publicId, req.workspaceId); if (!existing) return res.status(404).json({ error: 'Food Moment nicht gefunden.' }); if (Number(existing.owner_user_id) !== Number(req.auth.user.id)) return res.status(403).json({ error: 'Nur der Eigentümer kann Workspace-Zuordnungen verwalten.' }); const eligible = await workspaceRepository.listActiveWorkspacesForUser(req.auth.user.id); const rows = await all(`SELECT workspace_id FROM food_moment_workspace_assignments WHERE food_moment_id=?`, [existing.id]); const assigned = new Set(rows.map(r => Number(r.workspace_id))); res.json({ food_moment: { public_id: existing.public_id, title: existing.title }, workspaces: eligible.map(w => ({ public_id: w.public_id, name: w.name, workspace_type: w.workspace_type, is_owner: Number(w.is_owner) === 1, is_assigned: assigned.has(Number(w.id)) })) }); } catch (e) { next(e); } });
router.put('/:publicId/workspace-assignments', async (req, res, next) => { try { const existing = await visibleMoment(req.params.publicId, req.workspaceId); if (!existing) return res.status(404).json({ error: 'Food Moment nicht gefunden.' }); if (Number(existing.owner_user_id) !== Number(req.auth.user.id)) return res.status(403).json({ error: 'Nur der Eigentümer kann Workspace-Zuordnungen verwalten.' }); const selected = uniqueStrings(req.body?.workspace_public_ids); if (!selected.length) return res.status(400).json({ error: 'Der Food Moment muss mindestens einem Workspace zugeordnet bleiben.' }); const eligible = await workspaceRepository.listActiveWorkspacesForUser(req.auth.user.id); const byPublic = new Map(eligible.map(w => [w.public_id, w])); if (selected.some(id => !byPublic.has(id))) return res.status(403).json({ error: 'Ein oder mehrere ausgewählte Workspaces stehen dir nicht zur Verfügung.' }); const ids = new Set(selected.map(id => Number(byPublic.get(id).id))); await run('BEGIN'); try { for (const w of eligible) { if (ids.has(Number(w.id))) await run(`INSERT OR IGNORE INTO food_moment_workspace_assignments(food_moment_id,workspace_id,assigned_by_user_id) VALUES(?,?,?)`, [existing.id, w.id, req.auth.user.id]); else await run(`DELETE FROM food_moment_workspace_assignments WHERE food_moment_id=? AND workspace_id=?`, [existing.id, w.id]); } const preferred = ids.has(Number(existing.workspace_id)) ? existing.workspace_id : Number(byPublic.get(selected[0]).id); await run(`UPDATE food_moments SET workspace_id=? WHERE id=?`, [preferred, existing.id]); await run('COMMIT'); } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; } const rows = await all(`SELECT workspace_id FROM food_moment_workspace_assignments WHERE food_moment_id=?`, [existing.id]); const assigned = new Set(rows.map(r => Number(r.workspace_id))); res.json({ food_moment: { public_id: existing.public_id, title: existing.title }, workspaces: eligible.map(w => ({ public_id: w.public_id, name: w.name, workspace_type: w.workspace_type, is_owner: Number(w.is_owner) === 1, is_assigned: assigned.has(Number(w.id)) })), current_workspace_still_assigned: assigned.has(Number(req.workspaceId)) }); } catch (e) { next(e); } });
router.delete("/:publicId", async (req, res, next) => { try { const existing = await visibleMoment(req.params.publicId, req.workspaceId); if (!existing) return res.status(404).json({ error: "Food Moment nicht gefunden." }); if (Number(existing.owner_user_id) !== Number(req.auth.user.id)) return res.status(403).json({ error: 'Nur der Eigentümer kann diesen Food Moment löschen.' }); await run(`DELETE FROM food_moments WHERE id=?`, [existing.id]); res.json({ success: true }); } catch (e) { next(e); } });

module.exports = router;
