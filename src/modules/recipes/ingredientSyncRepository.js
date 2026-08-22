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

async function findFoodItemByCanonicalKey(canonicalKey) {
    return get(
        `SELECT *
         FROM food_items
         WHERE canonical_key = ?
         LIMIT 1`,
        [canonicalKey]
    );
}

async function findFoodItemByAliasKey(aliasKey) {
    return get(
        `SELECT fi.*
         FROM food_aliases fa
         INNER JOIN food_items fi
            ON fi.id = fa.food_item_id
         WHERE fa.alias_key = ?
         LIMIT 1`,
        [aliasKey]
    );
}

async function createFoodItem({
    displayName,
    canonicalKey,
    caloriesPer100g = null
}) {
    const result = await run(
        `INSERT INTO food_items (
            display_name,
            canonical_key,
            calories_per_100g
         )
         VALUES (?, ?, ?)`,
        [
            displayName,
            canonicalKey,
            caloriesPer100g
        ]
    );

    return findFoodItemById(result.lastID);
}

async function createFoodAlias({
    foodItemId,
    aliasName,
    aliasKey
}) {
    return run(
        `INSERT OR IGNORE INTO food_aliases (
            food_item_id,
            alias_name,
            alias_key
         )
         VALUES (?, ?, ?)`,
        [
            foodItemId,
            aliasName,
            aliasKey
        ]
    );
}

async function createInventoryItemForFoodItem({
    foodItemId,
    name,
    unit,
    source,
    recipeMatchName,
    caloriesPer100g,
    canonicalName
}) {
    return run(
        `INSERT INTO inventory_items (
            name,
            quantity,
            unit,
            weight,
            expiry_date,
            storage_location,
            notes,
            source,
            recipe_match_name,
            calories_per_100g,
            food_item_id,
            canonical_name
         )
         VALUES (?, 0, ?, 0, '', '', '', ?, ?, ?, ?, ?)`,
        [
            name,
            unit,
            source,
            recipeMatchName,
            caloriesPer100g,
            foodItemId,
            canonicalName
        ]
    );
}

async function updateInventoryItemLinkMetadata({
    inventoryItemId,
    recipeMatchName,
    canonicalName
}) {
    return run(
        `UPDATE inventory_items
         SET
            recipe_match_name =
                COALESCE(NULLIF(recipe_match_name, ''), ?),
            canonical_name =
                COALESCE(NULLIF(canonical_name, ''), ?),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            recipeMatchName,
            canonicalName,
            inventoryItemId
        ]
    );
}

module.exports = {
    findRecipeIngredientLinks,
    deleteRecipeIngredientLinks,
    createRecipeIngredientLink,
    findFoodItemById,
    findFoodItemByCanonicalKey,
    findFoodItemByAliasKey,
    createFoodItem,
    createFoodAlias,
    findInventoryItemByFoodItemId,
    createInventoryItemForFoodItem,
    updateInventoryItemLinkMetadata
};
