const { run, get, all } = require("../../database/database");

async function findAll() {
    return all(`
        SELECT *
        FROM recipes
        ORDER BY name COLLATE NOCASE ASC
    `);
}

async function findById(recipeId) {
    return get(
        `SELECT * FROM recipes WHERE id = ?`,
        [recipeId]
    );
}

async function create(recipe) {
    const result = await run(
        `INSERT INTO recipes (
            name,
            calories,
            portions,
            mealTypes,
            ingredients,
            instructions,
            is_favorite
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite
        ]
    );

    return findById(result.lastID);
}

async function update(recipeId, recipe) {
    await run(
        `UPDATE recipes
         SET
            name = ?,
            calories = ?,
            portions = ?,
            mealTypes = ?,
            ingredients = ?,
            instructions = ?,
            is_favorite = ?
         WHERE id = ?`,
        [
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite,
            recipeId
        ]
    );

    return findById(recipeId);
}

async function updateFavorite(recipeId, isFavorite) {
    return run(
        `UPDATE recipes
         SET is_favorite = ?
         WHERE id = ?`,
        [isFavorite, recipeId]
    );
}

async function deleteIngredients(recipeId) {
    return run(
        `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
        [recipeId]
    );
}

async function deleteById(recipeId) {
    return run(
        `DELETE FROM recipes WHERE id = ?`,
        [recipeId]
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
