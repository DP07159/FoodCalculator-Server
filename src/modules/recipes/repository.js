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

module.exports = {
    findAll,
    findById,
    create,
    update,
    updateFavorite,
    deleteIngredients,
    deleteById
};
