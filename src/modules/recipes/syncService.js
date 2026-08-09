const { run, get, all } = require("../../database/database");
const ingredients = require("../../shared/ingredients");
const foodItemService = require("../foodItems/service");

async function getSelectedFoodItemForIngredient(explicitLinks, index, rawText) {
    const links = Array.isArray(explicitLinks) ? explicitLinks : [];
    const link = links.find(entry => {
        if (Number(entry.line_index) !== Number(index)) return false;
        if (entry.raw_text && rawText && entry.raw_text.trim() !== rawText.trim()) return false;
        return true;
    });
    if (!link || !link.food_item_id) return null;
    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [link.food_item_id]);
    return foodItem || null;
}

async function getPreservedFoodItemForIngredient(previousLinks, index, ingredient) {
    const links = Array.isArray(previousLinks) ? previousLinks : [];
    const raw = ingredients.normalizeIngredientRawLineForMatch(ingredient?.raw_text);
    const foodName = ingredient?.food_name || "";

    let link = links.find(entry =>
        Number(entry.sort_order) === Number(index) &&
        ingredients.normalizeIngredientRawLineForMatch(entry.raw_text) === raw &&
        entry.food_item_id
    );

    if (!link && raw) {
        link = links.find(entry =>
            ingredients.normalizeIngredientRawLineForMatch(entry.raw_text) === raw &&
            entry.food_item_id
        );
    }

    if (!link && foodName) {
        link = links.find(entry =>
            Number(entry.sort_order) === Number(index) &&
            ingredients.ingredientFoodNamesMatch(entry.food_name, foodName) &&
            entry.food_item_id
        );
    }

    if (!link && foodName) {
        link = links.find(entry =>
            ingredients.ingredientFoodNamesMatch(entry.food_name, foodName) &&
            entry.food_item_id
        );
    }

    if (!link) return null;
    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [link.food_item_id]);
    if (!foodItem) return null;

    return {
        foodItem,
        linkSource: link.link_source || "preserved"
    };
}

async function ensureInventoryItemForFoodItem(foodItem, ingredient, { source = "recipe" } = {}) {
    const existing = await get(`SELECT * FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [foodItem.id]);
    if (!existing) {
        await run(
            `INSERT INTO inventory_items (name, quantity, unit, weight, expiry_date, storage_location, notes, source, recipe_match_name, calories_per_100g, food_item_id, canonical_name)
             VALUES (?, 0, ?, 0, '', '', '', ?, ?, ?, ?, ?)`,
            [foodItem.display_name || ingredient.food_name, ingredient.unit || "g", source, foodItem.display_name || ingredient.food_name, foodItem.calories_per_100g ?? null, foodItem.id, foodItem.canonical_key]
        );
        return;
    }

    await run(
        `UPDATE inventory_items
         SET recipe_match_name = COALESCE(NULLIF(recipe_match_name, ''), ?),
             canonical_name = COALESCE(NULLIF(canonical_name, ''), ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [foodItem.display_name || ingredient.food_name, foodItem.canonical_key, existing.id]
    );
}

async function syncRecipeIngredients(recipeId, ingredientsText, explicitLinks = [], options = {}) {
    const { createMissing = true } = options;
    const previousLinks = await all(
        `SELECT sort_order, raw_text, food_name, canonical_key, food_item_id, link_source
         FROM recipe_ingredients
         WHERE recipe_id = ?`,
        [recipeId]
    );

    await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [recipeId]);
    const parsedIngredients = ingredients.parseIngredientsText(ingredientsText);

    for (const ingredient of parsedIngredients) {
        const index = ingredient.line_index;
        let linkSource = "new_from_recipe";
        let foodItem = await getSelectedFoodItemForIngredient(explicitLinks, index, ingredient.raw_text);

        if (foodItem) {
            linkSource = "user_selected";
            await foodItemService.addFoodAlias(foodItem.id, ingredient.raw_text);
            await foodItemService.addFoodAlias(foodItem.id, ingredient.food_name);
        } else {
            const preserved = await getPreservedFoodItemForIngredient(previousLinks, index, ingredient);
            if (preserved) {
                foodItem = preserved.foodItem;
                linkSource = preserved.linkSource === "new_from_recipe" ? "preserved_recipe" : preserved.linkSource;
            }
        }

        if (!foodItem) {
            foodItem = await foodItemService.findFoodItemByName(ingredient.food_name);
            if (foodItem) linkSource = "auto_exact";
        }

        if (!foodItem) {
            if (!createMissing) continue;
            foodItem = await foodItemService.createDistinctFoodItemFromIngredient(ingredient.food_name, { aliasName: ingredient.raw_text });
            linkSource = "new_from_recipe";
        }

        await run(
            `INSERT INTO recipe_ingredients (recipe_id, raw_text, food_name, amount, unit, sort_order, updated_at, food_item_id, canonical_key, link_source)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
            [recipeId, ingredient.raw_text, ingredient.food_name, ingredient.amount, ingredient.unit, index, foodItem.id, foodItem.canonical_key, linkSource]
        );

        await ensureInventoryItemForFoodItem(foodItem, ingredient, { source: linkSource === "user_selected" ? "manual" : "recipe" });
    }
}

async function backfillMissingRecipeIngredientLinks() {
    const recipes = await all(`SELECT id, ingredients FROM recipes`);
    for (const recipe of recipes) {
        const existing = await get(`SELECT COUNT(*) AS count FROM recipe_ingredients WHERE recipe_id = ?`, [recipe.id]);
        if (Number(existing?.count || 0) > 0) continue;
        await syncRecipeIngredients(recipe.id, recipe.ingredients || "", [], { createMissing: true });
    }
}

module.exports = {
    getSelectedFoodItemForIngredient,
    getPreservedFoodItemForIngredient,
    ensureInventoryItemForFoodItem,
    syncRecipeIngredients,
    backfillMissingRecipeIngredientLinks
};
