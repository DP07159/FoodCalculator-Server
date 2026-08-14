const { run, get, all } = require("../../database/database");
const recipeSyncService = require("./syncService");

function parseMealTypes(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeRecipeRow(recipe) {
    return {
        id: recipe.id,
        name: recipe.name,
        calories: Number(recipe.calories) || 0,
        portions: recipe.portions ?? null,
        mealTypes: parseMealTypes(recipe.mealTypes),
        ingredients: recipe.ingredients || "",
        instructions: recipe.instructions || "",
        is_favorite: Number(recipe.is_favorite) === 1 ? 1 : 0
    };
}

function toPositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIngredientLinks(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(link => ({
            line_index: Number.parseInt(link.line_index ?? link.index, 10),
            food_item_id: Number.parseInt(link.food_item_id ?? link.foodItemId, 10),
            raw_text: typeof link.raw_text === "string" ? link.raw_text : ""
        }))
        .filter(link => Number.isInteger(link.line_index) && link.line_index >= 0 && Number.isInteger(link.food_item_id) && link.food_item_id > 0);
}

function validateRecipePayload(payload, { allowEmptyPortions = false } = {}) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const calories = toPositiveInteger(payload.calories);
    const portions = payload.portions === "" || payload.portions === null || payload.portions === undefined
        ? null
        : toPositiveInteger(payload.portions);
    const mealTypes = Array.isArray(payload.mealTypes) ? payload.mealTypes : [];

    if (!name) return { error: "Name ist erforderlich." };
    if (!calories) return { error: "Kalorien müssen als ganze Zahl größer 0 angegeben werden." };
    if (!allowEmptyPortions && !portions) return { error: "Portionen müssen als ganze Zahl größer 0 angegeben werden." };
    if (mealTypes.length === 0 && payload.mealTypes !== undefined) return { error: "Mindestens eine Mahlzeit muss ausgewählt werden." };

    return {
        value: {
            name,
            calories,
            portions,
            mealTypes,
            ingredients: typeof payload.ingredients === "string" ? payload.ingredients : "",
            instructions: typeof payload.instructions === "string" ? payload.instructions : "",
            is_favorite: Number(payload.is_favorite) === 1 ? 1 : 0,
            ingredientLinks: normalizeIngredientLinks(payload.ingredientLinks)
        }
    };
}

async function getRecipeIngredientLinks(recipeId) {
    const rows = await all(
        `SELECT
            ri.sort_order AS line_index,
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.food_item_id,
            ri.link_source,
            fi.display_name AS food_display_name
         FROM recipe_ingredients ri
         LEFT JOIN food_items fi ON fi.id = ri.food_item_id
         WHERE ri.recipe_id = ?
         ORDER BY ri.sort_order ASC`,
        [recipeId]
    );
    return rows.map(row => ({
        line_index: Number(row.line_index) || 0,
        raw_text: row.raw_text || "",
        food_name: row.food_display_name || row.food_name || "",
        stored_food_name: row.food_name || "",
        amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
        unit: row.unit || "",
        food_item_id: row.food_item_id || null,
        link_source: row.link_source || ""
    }));
}

async function normalizeRecipeRowWithIngredientLinks(recipe) {
    return {
        ...normalizeRecipeRow(recipe),
        ingredientLinks: await getRecipeIngredientLinks(recipe.id)
    };
}

function normalizeIngredientsTextForChangeCheck(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim();
}

function hasExplicitIngredientLinksPayload(payload) {
    return Object.prototype.hasOwnProperty.call(payload || {}, "ingredientLinks") && Array.isArray(payload.ingredientLinks);
}

async function createRecipe(payload, workspaceId, ownerUserId) {
    const validation = validateRecipePayload(payload);
    if (validation.error) return { error: validation.error };
    const recipe = validation.value;

    const result = await run(
        `INSERT INTO recipes (
            workspace_id, owner_user_id, name, calories, portions, mealTypes,
            ingredients, instructions, is_favorite, visibility, version, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'workspace', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [workspaceId, ownerUserId, recipe.name, recipe.calories, recipe.portions, JSON.stringify(recipe.mealTypes), recipe.ingredients, recipe.instructions, recipe.is_favorite]
    );

    const created = await get(`SELECT * FROM recipes WHERE id = ? AND workspace_id = ?`, [result.lastID, workspaceId]);
    await recipeSyncService.syncRecipeIngredients(created.id, created.ingredients || "", recipe.ingredientLinks);
    return { value: await normalizeRecipeRowWithIngredientLinks(created) };
}

async function updateRecipe(recipeId, payload, workspaceId) {
    const current = await get(`SELECT * FROM recipes WHERE id = ? AND workspace_id = ?`, [recipeId, workspaceId]);
    if (!current) return { notFound: true };

    const validation = validateRecipePayload({
        ...payload,
        mealTypes: payload.mealTypes ?? parseMealTypes(current.mealTypes)
    }, { allowEmptyPortions: true });
    if (validation.error) return { error: validation.error };
    const recipe = validation.value;

    const favoriteValue = payload.is_favorite === undefined
        ? Number(current.is_favorite) || 0
        : recipe.is_favorite;

    await run(
        `UPDATE recipes
         SET name = ?, calories = ?, portions = ?, mealTypes = ?, ingredients = ?, instructions = ?, is_favorite = ?,
             version = COALESCE(version, 1) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND workspace_id = ?`,
        [recipe.name, recipe.calories, recipe.portions, JSON.stringify(recipe.mealTypes), recipe.ingredients, recipe.instructions, favoriteValue, recipeId, workspaceId]
    );

    const updated = await get(`SELECT * FROM recipes WHERE id = ? AND workspace_id = ?`, [recipeId, workspaceId]);
    const ingredientsChanged = normalizeIngredientsTextForChangeCheck(current.ingredients) !== normalizeIngredientsTextForChangeCheck(updated.ingredients);
    const explicitLinksProvided = hasExplicitIngredientLinksPayload(payload);

    if (ingredientsChanged || explicitLinksProvided) {
        await recipeSyncService.syncRecipeIngredients(updated.id, updated.ingredients || "", recipe.ingredientLinks);
    }

    return { value: await normalizeRecipeRowWithIngredientLinks(updated) };
}

module.exports = {
    parseMealTypes,
    normalizeRecipeRow,
    validateRecipePayload,
    getRecipeIngredientLinks,
    createRecipe,
    updateRecipe
};
