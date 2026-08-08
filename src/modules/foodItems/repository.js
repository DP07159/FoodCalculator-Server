const { run, get, all } = require("../../database/database");

async function findById(foodItemId) {
    return get(
        `SELECT *
         FROM food_items
         WHERE id = ?`,
        [foodItemId]
    );
}

async function findByCanonicalKey(canonicalKey) {
    return get(
        `SELECT *
         FROM food_items
         WHERE canonical_key = ?
         LIMIT 1`,
        [canonicalKey]
    );
}

async function findByAliasKey(aliasKey) {
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

async function create({
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

    return findById(result.lastID);
}

async function update({
    foodItemId,
    displayName,
    canonicalKey,
    caloriesPer100g
}) {
    await run(
        `UPDATE food_items
         SET
            display_name = ?,
            canonical_key = ?,
            calories_per_100g = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            displayName,
            canonicalKey,
            caloriesPer100g,
            foodItemId
        ]
    );

    return findById(foodItemId);
}

async function updateCalories(foodItemId, caloriesPer100g) {
    await run(
        `UPDATE food_items
         SET
            calories_per_100g = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            caloriesPer100g,
            foodItemId
        ]
    );

    return findById(foodItemId);
}

async function findAliases(foodItemId) {
    return all(
        `SELECT *
         FROM food_aliases
         WHERE food_item_id = ?
         ORDER BY alias_name COLLATE NOCASE ASC`,
        [foodItemId]
    );
}

async function createAlias({
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

async function findInventoryItem(foodItemId) {
    return get(
        `SELECT *
         FROM inventory_items
         WHERE food_item_id = ?
         ORDER BY id ASC
         LIMIT 1`,
        [foodItemId]
    );
}

async function updateLinkedInventoryItems({
    foodItemId,
    displayName,
    canonicalKey,
    caloriesPer100g
}) {
    return run(
        `UPDATE inventory_items
         SET
            name = ?,
            canonical_name = ?,
            calories_per_100g =
                COALESCE(?, calories_per_100g),
            updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [
            displayName,
            canonicalKey,
            caloriesPer100g,
            foodItemId
        ]
    );
}

async function updateLinkedRecipeIngredients({
    foodItemId,
    canonicalKey
}) {
    return run(
        `UPDATE recipe_ingredients
         SET
            canonical_key = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [
            canonicalKey,
            foodItemId
        ]
    );
}

async function existsByCanonicalKey(canonicalKey) {
    const row = await get(
        `SELECT id
         FROM food_items
         WHERE canonical_key = ?
         LIMIT 1`,
        [canonicalKey]
    );

    return Boolean(row);
}

module.exports = {
    findById,
    findByCanonicalKey,
    findByAliasKey,
    existsByCanonicalKey,
    create,
    update,
    updateCalories,
    findAliases,
    createAlias,
    findInventoryItem,
    updateLinkedInventoryItems,
    updateLinkedRecipeIngredients
};
