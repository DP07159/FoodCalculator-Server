const { run, get, all } = require("../../database/database");

async function findAll(workspaceId) {
    return all(
        `SELECT *
         FROM recipes
         WHERE workspace_id = ?
           AND visibility <> 'archived'
         ORDER BY name COLLATE NOCASE ASC`,
        [workspaceId]
    );
}

async function findById(recipeId, workspaceId) {
    return get(
        `SELECT *
         FROM recipes
         WHERE id = ?
           AND workspace_id = ?
         LIMIT 1`,
        [recipeId, workspaceId]
    );
}

async function create(recipe, workspaceId, ownerUserId) {
    const result = await run(
        `INSERT INTO recipes (
            workspace_id,
            owner_user_id,
            name,
            calories,
            portions,
            mealTypes,
            ingredients,
            instructions,
            is_favorite,
            visibility,
            version,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'workspace', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
            workspaceId,
            ownerUserId,
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite
        ]
    );

    return findById(result.lastID, workspaceId);
}

async function update(recipeId, recipe, workspaceId) {
    await run(
        `UPDATE recipes
         SET
            name = ?,
            calories = ?,
            portions = ?,
            mealTypes = ?,
            ingredients = ?,
            instructions = ?,
            is_favorite = ?,
            version = COALESCE(version, 1) + 1,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND workspace_id = ?`,
        [
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite,
            recipeId,
            workspaceId
        ]
    );

    return findById(recipeId, workspaceId);
}

async function updateFavorite(recipeId, isFavorite, workspaceId) {
    return run(
        `UPDATE recipes
         SET is_favorite = ?,
             version = COALESCE(version, 1) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND workspace_id = ?`,
        [isFavorite, recipeId, workspaceId]
    );
}

async function deleteIngredients(recipeId) {
    return run(
        `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
        [recipeId]
    );
}

async function deleteById(recipeId, workspaceId) {
    return run(
        `DELETE FROM recipes
         WHERE id = ?
           AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
}

async function findIngredientLinks(recipeId) {
    return all(
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
         LEFT JOIN food_items fi
            ON fi.id = ri.food_item_id
         WHERE ri.recipe_id = ?
         ORDER BY ri.sort_order ASC`,
        [recipeId]
    );
}

module.exports = {
    findAll,
    findById,
    findIngredientLinks,
    create,
    update,
    updateFavorite,
    deleteIngredients,
    deleteById
};
