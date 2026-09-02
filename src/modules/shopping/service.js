const { run, get, all } = require("../../database/database");
const recipeRepository = require("../recipes/repository");
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
            food_moment_id: row.food_moment_id || null
        });
    }
    return [...groups.values()].map(group => ({
        ...group,
        amount: group.has_amount ? Math.round(group.amount * 1000) / 1000 : null,
        source_count: group.sources.length
    })).sort((a,b) => a.name.localeCompare(b.name, "de"));
}

async function getList(workspaceId) {
    const rows = await all(`SELECT * FROM shopping_list_entries WHERE workspace_id=? ORDER BY completed ASC, updated_at DESC, id DESC`, [workspaceId]);
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

async function setGroupCompleted(body, workspaceId) {
    const canonicalKey = clean(body?.canonical_key);
    const unit = normalizeUnit(body?.unit || "");
    if (!canonicalKey) return { error: "Eintrag fehlt." };
    await run(`UPDATE shopping_list_entries SET completed=?,updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND canonical_key=? AND unit=?`, [body?.completed ? 1 : 0, workspaceId, canonicalKey, unit]);
    return { value: await getList(workspaceId) };
}

async function deleteGroup(body, workspaceId) {
    const canonicalKey = clean(body?.canonical_key);
    const unit = normalizeUnit(body?.unit || "");
    if (!canonicalKey) return { error: "Eintrag fehlt." };
    await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND canonical_key=? AND unit=?`, [workspaceId, canonicalKey, unit]);
    return { value: await getList(workspaceId) };
}

async function clearCompleted(workspaceId) {
    const result = await run(`DELETE FROM shopping_list_entries WHERE workspace_id=? AND completed=1`, [workspaceId]);
    return { removed: Number(result.changes) || 0, list: await getList(workspaceId) };
}

module.exports = { getList, addManual, importRecipe, importFoodMoment, setGroupCompleted, deleteGroup, clearCompleted };
