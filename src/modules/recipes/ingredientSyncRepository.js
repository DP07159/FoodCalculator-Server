const { run, get, all } = require("../../database/database");

async function findRecipeIngredientLinks(recipeId) {
    return all(
        `SELECT
            sort_order,
            raw_text,
            food_name,
            canonical_key,
            food_item_id,
            link_source
         FROM recipe_ingredients
         WHERE recipe_id = ?
         ORDER BY sort_order ASC`,
        [recipeId]
    );
}

async function deleteRecipeIngredientLinks(recipeId) {
    return run(
        `DELETE FROM recipe_ingredients
         WHERE recipe_id = ?`,
        [recipeId]
    );
}

async function createRecipeIngredientLink({
    recipeId,
    rawText,
    foodName,
    amount,
    unit,
    sortOrder,
    foodItemId,
    canonicalKey,
    linkSource
}) {
    return run(
        `INSERT INTO recipe_ingredients (
            recipe_id,
            raw_text,
            food_name,
            amount,
            unit,
            sort_order,
            updated_at,
            food_item_id,
            canonical_key,
            link_source
         )
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
        [
            recipeId,
            rawText,
            foodName,
            amount,
            unit,
            sortOrder,
            foodItemId,
            canonicalKey,
            linkSource
        ]
    );
}

async function findFoodItemById(foodItemId) {
    return get(
        `SELECT *
         FROM food_items
         WHERE id = ?`,
        [foodItemId]
    );
}

async function findInventoryItemByFoodItemId(foodItemId) {
    return get(
        `SELECT *
         FROM inventory_items
         WHERE food_item_id = ?
         LIMIT 1`,
        [foodItemId]
    );
}

module.exports = {
    findRecipeIngredientLinks,
    deleteRecipeIngredientLinks,
    createRecipeIngredientLink,
    findFoodItemById,
    findInventoryItemByFoodItemId
};
