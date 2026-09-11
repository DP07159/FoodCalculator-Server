const { run, get, all } = require("../../database/database");
const recipeRepository = require("../recipes/repository");
const workspaceRepository = require("../../core/workspaces/repository");
const { parseIngredientsText } = require("../../shared/ingredients/parser");
const { canonicalizeIngredientName, displayIngredientNameFromCanonical } = require("../../shared/ingredients/canonicalizer");
const { normalizeIngredientUnit } = require("../../shared/ingredients/units");

function clean(value) { return String(value ?? "").trim(); }
function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function normalizeUnit(value) { return normalizeIngredientUnit(clean(value)) || clean(value); }
function canonical(value) { return canonicalizeIngredientName(clean(value)) || clean(value).toLocaleLowerCase("de"); }
function sourceKey(parts) { return parts.filter(v => v !== null && v !== undefined && v !== "").join(":"); }

async function insertEntry({ workspaceId, name, amount = null, unit = "", sourceType = "manual", sourceReference = null, sourceLabel = null, recipeId = null, foodMomentId = null, userId = null }) {
    const displayName = clean(name);
    if (!displayName) return { error: "Bitte eine Bezeichnung eingeben." };
    const canonicalKey = canonical(displayName);
    const normalizedUnit = normalizeUnit(unit);
    const params = [workspaceId, canonicalKey, displayIngredientNameFromCanonical(canonicalKey, displayName) || displayName, numberOrNull(amount), normalizedUnit, sourceType, sourceReference, sourceLabel, recipeId, foodMomentId, userId];
    if (sourceReference) {
        await run(`INSERT INTO shopping_list_entries
            (workspace_id,canonical_key,display_name,amount,unit,completed,source_type,source_reference,source_label,recipe_id,food_moment_id,created_by_user_id)
            VALUES(?,?,?,?,?,0,?,?,?,?,?,?)
            ON CONFLICT(workspace_id,source_type,source_reference,canonical_key,unit)
            WHERE source_reference IS NOT NULL
            DO UPDATE SET display_name=excluded.display_name,amount=excluded.amount,source_label=excluded.source_label,recipe_id=excluded.recipe_id,food_moment_id=excluded.food_moment_id,completed=0,updated_at=CURRENT_TIMESTAMP`, params);
    } else {
        await run(`INSERT INTO shopping_list_entries
            (workspace_id,canonical_key,display_name,amount,unit,completed,source_type,source_reference,source_label,recipe_id,food_moment_id,created_by_user_id)
            VALUES(?,?,?,?,?,0,?,?,?,?,?,?)`, params);
    }
    return { value: true };
}

function aggregateRows(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = `${row.canonical_key}||${row.unit || ""}||${Number(row.completed) ? 1 : 0}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                canonical_key: row.canonical_key,
                name: row.display_name,
                unit: row.unit || "",
                completed: Number(row.completed) === 1,
                amount: 0,
                has_amount: false,
                unspecified_count: 0,
                sources: []
            };
            groups.set(key, group);
        }
        if (row.amount !== null && row.amount !== undefined) {
            group.amount += Number(row.amount) || 0;
            group.has_amount = true;
        } else group.unspecified_count += 1;
        group.sources.push({
            id: row.id,
            type: row.source_type,
            reference: row.source_reference,
            label: row.source_label || (row.source_type === "manual" ? "Manuell" : "Quelle"),
            recipe_id: row.recipe_id || null,
            food_moment_id: row.food_moment_id || null,
            food_moment_public_id: row.food_moment_public_id || null
        });
    }
    return [...groups.values()].map(group => ({
        ...group,
        amount: group.has_amount ? Math.round(group.amount * 1000) / 1000 : null,
        source_count: group.sources.length
    })).sort((a,b) => a.name.localeCompare(b.name, "de"));
}

async function getList(workspaceId) {
    const rows = await all(`SELECT sle.*, fm.public_id AS food_moment_public_id FROM shopping_list_entries sle LEFT JOIN food_moments fm ON fm.id=sle.food_moment_id WHERE sle.workspace_id=? ORDER BY sle.completed ASC, sle.updated_at DESC, sle.id DESC`, [workspaceId]);
    const aggregated = aggregateRows(rows);
    return {
        active: aggregated.filter(item => !item.completed),
        completed: aggregated.filter(item => item.completed),
        entry_count: rows.length
    };
}

async function addManual(body, workspaceId, userId) {
    return insertEntry({ workspaceId, userId, name: body?.name, amount: body?.amount, unit: body?.unit, sourceType: "manual" });
}

async function addRecipeIngredients(recipe, { workspaceId, userId, sourceType = "recipe", sourceReferencePrefix, sourceLabel, foodMomentId = null, portions = null }) {
    const parsed = parseIngredientsText(recipe.ingredients || "");
    const basePortions = Number(recipe.portions) > 0 ? Number(recipe.portions) : 1;
    const requestedPortions = Number(portions) > 0 ? Number(portions) : basePortions;
    const factor = requestedPortions / basePortions;
    let count = 0;
    for (const ingredient of parsed) {
        const ref = sourceKey([sourceReferencePrefix, ingredient.line_index]);
        const result = await insertEntry({
            workspaceId,
            userId,
            name: ingredient.food_name || ingredient.raw_text,
            amount: ingredient.amount === null || ingredient.amount === undefined ? null : Number(ingredient.amount) * factor,
            unit: ingredient.unit || "",
            sourceType,
            sourceReference: ref,
            sourceLabel,
            recipeId: recipe.id,
            foodMomentId
        });
        if (!result.error) count += 1;
    }
    return count;
}

async function importRecipe(recipeId, body, workspaceId, userId) {
    const recipe = await recipeRepository.findById(recipeId, workspaceId);
    if (!recipe) return { notFound: true };
    const count = await addRecipeIngredients(recipe, {
        workspaceId, userId, portions: body?.portions,
        sourceType: "recipe",
        sourceReferencePrefix: sourceKey(["recipe", recipe.id]),
        sourceLabel: recipe.name
    });
    return { value: { added: count, list: await getList(workspaceId) } };
}

async function visibleMoment(publicId, workspaceId) {
    return get(`SELECT fm.* FROM food_moments fm WHERE fm.public_id=? AND (fm.workspace_id=? OR EXISTS(SELECT 1 FROM food_moment_workspace_assignments a WHERE a.food_moment_id=fm.id AND a.workspace_id=?))`, [publicId, workspaceId, workspaceId]);
}

async function importFoodMoment(publicId, workspaceId, userId) {
    const moment = await visibleMoment(publicId, workspaceId);
    if (!moment) return { notFound: true };
    const recipes = await all(`SELECT r.* FROM food_moment_recipe_links l JOIN recipes r ON r.id=l.recipe_id WHERE l.food_moment_id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?)) ORDER BY l.id`, [moment.id, workspaceId, workspaceId]);
    if (!recipes.length) return { error: "Dieser Food Moment enthält noch kein Rezept." };
    let count = 0;
    for (const recipe of recipes) {
        count += await addRecipeIngredients(recipe, {
            workspaceId, userId,
            sourceType: "food_moment",
            sourceReferencePrefix: sourceKey(["moment", moment.public_id, "recipe", recipe.id]),
            sourceLabel: `${moment.title} · ${recipe.name}`,
            foodMomentId: moment.id
        });
    }
    return { value: { added: count, list: await getList(workspaceId) } };
}

async function importWeek(startDate, workspaceId, userId) {
    const start = clean(startDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Ungültiger Wochenstart." };
    const startObj = new Date(`${start}T12:00:00`);
    const endObj = new Date(startObj); endObj.setDate(endObj.getDate()+7);
    const end = `${endObj.getFullYear()}-${String(endObj.getMonth()+1).padStart(2,'0')}-${String(endObj.getDate()).padStart(2,'0')}`;
    const prefix = `week:${start}:`;
    await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND source_type='week_plan' AND source_reference LIKE ?`, [workspaceId, `${prefix}%`]);
    const rows = await all(`SELECT DISTINCT fm.id AS food_moment_id,fm.public_id,r.* FROM food_moments fm JOIN food_moment_recipe_links l ON l.food_moment_id=fm.id JOIN recipes r ON r.id=l.recipe_id LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE (fm.workspace_id=? OR a.workspace_id=?) AND fm.starts_at>=? AND fm.starts_at<? ORDER BY fm.starts_at,l.id`, [workspaceId,workspaceId,`${start}T00:00:00`,`${end}T00:00:00`]);
    let count=0;
    for (const recipe of rows) count += await addRecipeIngredients(recipe,{workspaceId,userId,sourceType:'week_plan',sourceReferencePrefix:sourceKey([prefix,recipe.food_moment_id,'recipe',recipe.id]),sourceLabel:recipe.name,foodMomentId:recipe.food_moment_id});
    return { value:{added:count,list:await getList(workspaceId)} };
}

function sourceWorkspaceIdsFromSharedRows(rows) {
    const ids = new Set();
    for (const row of rows || []) {
        const match = String(row.source_reference || '').match(/^workspace-share:(\d+):/);
        if (match) ids.add(Number(match[1]));
    }
    return [...ids].filter(Number.isFinite);
}

async function setGroupCompleted(body, workspaceId, userId = null) {
    const canonicalKey = clean(body?.canonical_key);
    const unit = normalizeUnit(body?.unit || "");
    if (!canonicalKey) return { error: "Eintrag fehlt." };
    const sharedRows = await all(`SELECT source_reference FROM shopping_list_entries WHERE workspace_id=? AND canonical_key=? AND unit=? AND source_type='workspace_share'`, [workspaceId, canonicalKey, unit]);
    const sourceWorkspaceIds = sourceWorkspaceIdsFromSharedRows(sharedRows);
    const completed = body?.completed ? 1 : 0;
    await run(`UPDATE shopping_list_entries SET completed=?,updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND canonical_key=? AND unit=?`, [completed, workspaceId, canonicalKey, unit]);
    for (const sourceWorkspaceId of sourceWorkspaceIds) {
        await run(`UPDATE shopping_list_entries SET completed=?,updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND canonical_key=? AND unit=? AND source_type<>'workspace_share'`, [completed, sourceWorkspaceId, canonicalKey, unit]);
        await syncAllShoppingShares(sourceWorkspaceId, userId);
    }
    return { value: await getList(workspaceId) };
}

async function deleteGroup(body, workspaceId, userId = null) {
    const canonicalKey = clean(body?.canonical_key);
    const unit = normalizeUnit(body?.unit || "");
    if (!canonicalKey) return { error: "Eintrag fehlt." };
    const sharedRows = await all(`SELECT source_reference FROM shopping_list_entries WHERE workspace_id=? AND canonical_key=? AND unit=? AND source_type='workspace_share'`, [workspaceId, canonicalKey, unit]);
    const sourceWorkspaceIds = sourceWorkspaceIdsFromSharedRows(sharedRows);
    await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND canonical_key=? AND unit=?`, [workspaceId, canonicalKey, unit]);
    for (const sourceWorkspaceId of sourceWorkspaceIds) {
        await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND canonical_key=? AND unit=? AND source_type<>'workspace_share'`, [sourceWorkspaceId, canonicalKey, unit]);
        await syncAllShoppingShares(sourceWorkspaceId, userId);
    }
    return { value: await getList(workspaceId) };
}

async function clearCompleted(workspaceId) {
    const result = await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND completed=1`, [workspaceId]);
    return { removed: Number(result.changes) || 0, list: await getList(workspaceId) };
}



function sharePrefix(sourceWorkspaceId) { return `workspace-share:${Number(sourceWorkspaceId)}:`; }

let shoppingShareSchemaReady = false;
async function ensureShoppingShareSchema() {
    if (shoppingShareSchemaReady) return;
    await run(`CREATE TABLE IF NOT EXISTS shopping_list_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_workspace_id INTEGER NOT NULL,
        target_workspace_id INTEGER NOT NULL,
        shared_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_workspace_id, target_workspace_id),
        FOREIGN KEY (source_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (target_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CHECK (source_workspace_id <> target_workspace_id)
    )`);
    await run(`CREATE INDEX IF NOT EXISTS idx_shopping_list_shares_source ON shopping_list_shares(source_workspace_id, target_workspace_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_shopping_list_shares_target ON shopping_list_shares(target_workspace_id, source_workspace_id)`);
    shoppingShareSchemaReady = true;
}

async function syncSharedListToTarget(sourceWorkspaceId, targetWorkspaceId, userId) {
    const prefix = sharePrefix(sourceWorkspaceId);
    const sourceWorkspace = await get(`SELECT name FROM workspaces WHERE id=?`, [sourceWorkspaceId]);
    const sharedLabel = sourceWorkspace?.name ? `Geteilt aus ${sourceWorkspace.name}` : 'Geteilte Einkaufsliste';
    await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND source_type='workspace_share' AND source_reference LIKE ?`, [targetWorkspaceId, `${prefix}%`]);
    const sourceRows = await all(`SELECT * FROM shopping_list_entries WHERE workspace_id=? AND completed=0 AND source_type<>'workspace_share' ORDER BY id`, [sourceWorkspaceId]);
    for (const row of sourceRows) {
        await insertEntry({
            workspaceId: targetWorkspaceId,
            userId,
            name: row.display_name,
            amount: row.amount,
            unit: row.unit,
            sourceType: 'workspace_share',
            sourceReference: `${prefix}${row.id}`,
            sourceLabel: sharedLabel,
            recipeId: null,
            foodMomentId: null
        });
    }
    return sourceRows.length;
}

async function syncAllShoppingShares(sourceWorkspaceId, userId) {
    await ensureShoppingShareSchema();
    const shares = await all(`SELECT target_workspace_id FROM shopping_list_shares WHERE source_workspace_id=? ORDER BY id`, [sourceWorkspaceId]);
    for (const share of shares) await syncSharedListToTarget(sourceWorkspaceId, Number(share.target_workspace_id), userId);
}

async function getShareOptions(sourceWorkspaceId, userId) {
    await ensureShoppingShareSchema();
    const [workspaces, sourceWorkspace, shares] = await Promise.all([
        workspaceRepository.listActiveWorkspacesForUser(userId),
        get(`SELECT id,public_id,name,workspace_type FROM workspaces WHERE id=?`, [sourceWorkspaceId]),
        all(`SELECT target_workspace_id FROM shopping_list_shares WHERE source_workspace_id=?`, [sourceWorkspaceId])
    ]);
    const assigned = new Set(shares.map(row => Number(row.target_workspace_id)));
    const options = workspaces
        .filter(workspace => Number(workspace.id) !== Number(sourceWorkspaceId))
        .map(workspace => ({
            public_id: workspace.public_id,
            name: workspace.name,
            workspace_type: workspace.workspace_type,
            is_owner: Number(workspace.is_owner) === 1,
            is_assigned: assigned.has(Number(workspace.id))
        }));
    return { source_workspace: sourceWorkspace, workspaces: options };
}

async function setShareOptions(sourceWorkspaceId, userId, workspacePublicIds) {
    await ensureShoppingShareSchema();
    const selected = [...new Set((Array.isArray(workspacePublicIds) ? workspacePublicIds : []).map(value => String(value || '').trim()).filter(Boolean))];
    const eligible = (await workspaceRepository.listActiveWorkspacesForUser(userId)).filter(workspace => Number(workspace.id) !== Number(sourceWorkspaceId));
    const byPublicId = new Map(eligible.map(workspace => [workspace.public_id, workspace]));
    const invalid = selected.filter(publicId => !byPublicId.has(publicId));
    if (invalid.length) return { forbidden: true, error: 'Ein oder mehrere ausgewählte Workspaces stehen dir nicht zur Verfügung.' };
    const selectedIds = new Set(selected.map(publicId => Number(byPublicId.get(publicId).id)));
    await run('BEGIN');
    try {
        const existing = await all(`SELECT target_workspace_id FROM shopping_list_shares WHERE source_workspace_id=?`, [sourceWorkspaceId]);
        const existingIds = new Set(existing.map(row => Number(row.target_workspace_id)));
        for (const workspace of eligible) {
            const targetId = Number(workspace.id);
            if (selectedIds.has(targetId)) {
                await run(`INSERT INTO shopping_list_shares(source_workspace_id,target_workspace_id,shared_by_user_id,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_workspace_id,target_workspace_id) DO UPDATE SET shared_by_user_id=excluded.shared_by_user_id,updated_at=CURRENT_TIMESTAMP`, [sourceWorkspaceId,targetId,userId]);
                await syncSharedListToTarget(sourceWorkspaceId,targetId,userId);
            } else if (existingIds.has(targetId)) {
                await run(`DELETE FROM shopping_list_shares WHERE source_workspace_id=? AND target_workspace_id=?`, [sourceWorkspaceId,targetId]);
                await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND source_type='workspace_share' AND source_reference LIKE ?`, [targetId, `${sharePrefix(sourceWorkspaceId)}%`]);
            }
        }
        await run('COMMIT');
    } catch (error) {
        await run('ROLLBACK').catch(()=>{});
        throw error;
    }
    return { value: await getShareOptions(sourceWorkspaceId, userId) };
}
module.exports = { getList, addManual, importRecipe, importFoodMoment, importWeek, setGroupCompleted, deleteGroup, clearCompleted, getShareOptions, setShareOptions, syncAllShoppingShares };
