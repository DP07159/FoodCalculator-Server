const { get, all } = require("../../database/database");
const ingredients = require("../../shared/ingredients");
const inventoryService = require("../inventory/service");

const {
    parseFraction,
    normalizeIngredientUnit,
    unitForInventory,
    normalizeIngredientText,
    findAmountUnitInIngredient,
    parseIngredientsText,
    buildFoodIdentity
} = ingredients;

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

function normalizeFoodItemRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        display_name: row.display_name,
        canonical_key: row.canonical_key,
        calories_per_100g: row.calories_per_100g === null || row.calories_per_100g === undefined
            ? null
            : Number(row.calories_per_100g)
    };
}

function scaleIngredientLineForPortions(rawLine, factor) {
    if (factor === 1) return rawLine;
    const text = String(rawLine || "");
    const amountUnit = findAmountUnitInIngredient(text);
    if (!amountUnit) return text;

    const amount = parseFraction(amountUnit.amountText);
    if (amount === null || amount === undefined) return text;

    const scaled = Math.round(amount * factor * 100) / 100;
    const scaledText = String(scaled).replace(".", ",");
    return `${text.slice(0, amountUnit.start)}${scaledText}${text.slice(amountUnit.start + amountUnit.amountText.length)}`;
}

function getInventoryStockBreakdown(item) {
    const batches = Array.isArray(item?.batches) ? item.batches : [];
    return batches.reduce((result, batch) => {
        const batchUnit = unitForInventory(batch.measure_unit || item.unit || "g");
        const remainingQuantity = Math.max(0, Number(batch.remaining_quantity || 0));
        const remainingWeight = Math.max(0, Number(batch.remaining_weight || 0));

        if (batch.batch_type === "package") result.packageCount += remainingQuantity;
        if (batchUnit === "g") result.g += remainingWeight;
        else if (batchUnit === "ml") result.ml += remainingWeight;
        else if (batchUnit === "Stk.") {
            if (batch.batch_type === "package") result.stk += remainingQuantity;
            else result.stk += remainingWeight;
        }
        return result;
    }, { g: 0, ml: 0, stk: 0, packageCount: 0 });
}

function isContainerUnit(unit) {
    const normalized = normalizeIngredientUnit(unit);
    return ["Dose", "Glas", "Packung", "Stk."].includes(normalized);
}

function getInventoryAvailableAmountForUnit(item, requestedUnit) {
    if (!item) return 0;
    const inventoryUnit = unitForInventory(requestedUnit || item.unit || "g");
    const stock = getInventoryStockBreakdown(item);
    if (inventoryUnit === "g") return stock.g;
    if (inventoryUnit === "ml") return stock.ml;
    if (inventoryUnit === "Stk.") return stock.stk || stock.packageCount;
    return 0;
}

function compareRecipeIngredientWithStock(item, ingredient, required) {
    if (!item) return { available: 0, status: "missing", note: "Kein passendes Lebensmittel im Inventar" };

    const requestedUnit = ingredient?.unit || item.unit || "g";
    const inventoryUnit = unitForInventory(requestedUnit);
    const originalUnit = normalizeIngredientUnit(ingredient?.original_unit || requestedUnit);
    const stock = getInventoryStockBreakdown(item);
    const available = getInventoryAvailableAmountForUnit(item, requestedUnit);
    const hasAnyStock = stock.g > 0 || stock.ml > 0 || stock.stk > 0 || stock.packageCount > 0;

    if (!hasAnyStock) return { available: 0, status: "missing", note: "Bestand ist 0" };
    if (required === null || required === undefined || !Number.isFinite(Number(required)) || Number(required) <= 0) {
        return { available, status: "available", note: "Lebensmittel ist im Bestand" };
    }

    if (inventoryUnit === "Stk." && isContainerUnit(originalUnit)) {
        const countAvailable = stock.stk || stock.packageCount;
        if (countAvailable >= Number(required)) return { available: countAvailable, status: "available", note: "Benötigte Einheit ist vorhanden" };
        if (countAvailable > 0) return { available: countAvailable, status: "partial", note: "Nur ein Teil der benötigten Einheiten ist vorhanden" };
        return { available: 0, status: "partial", note: "Lebensmittel vorhanden, Einheit/Menge aber nicht exakt vergleichbar" };
    }

    if (available >= Number(required)) return { available, status: "available", note: "Benötigte Menge ist vorhanden" };
    if (available > 0) return { available, status: "partial", note: "Nur ein Teil der benötigten Menge ist vorhanden" };
    return { available, status: "partial", note: "Lebensmittel vorhanden, aber nicht in der benötigten Einheit" };
}

function findInventoryItemForIngredient(parsedIngredient, inventoryItems) {
    if (!parsedIngredient) return null;
    if (parsedIngredient.food_item_id) {
        const byFoodItemId = inventoryItems.find(item => Number(item.food_item_id) === Number(parsedIngredient.food_item_id));
        if (byFoodItemId) return byFoodItemId;
    }
    if (parsedIngredient.matched_item_id) {
        const byId = inventoryItems.find(item => Number(item.id) === Number(parsedIngredient.matched_item_id));
        if (byId) return byId;
    }

    const ingredientKey = buildFoodIdentity(parsedIngredient.food_name).canonical_key;
    if (!ingredientKey) return null;
    return inventoryItems.find(item => {
        const itemKey = item.canonical_name || buildFoodIdentity(item.name).canonical_key;
        return itemKey && itemKey === ingredientKey;
    }) || null;
}

function buildRecipeStockEntry(parsedIngredient, inventoryItems, factor) {
    const item = findInventoryItemForIngredient(parsedIngredient, inventoryItems);
    const requiredBase = parsedIngredient?.amount;
    const required = requiredBase !== null && requiredBase !== undefined && Number.isFinite(Number(requiredBase))
        ? Number(requiredBase) * factor
        : null;
    const requestedUnit = parsedIngredient?.unit || item?.unit || "g";
    const comparison = compareRecipeIngredientWithStock(item, parsedIngredient, required);

    return {
        line_index: parsedIngredient?.line_index ?? null,
        raw_text: parsedIngredient?.raw_text || "",
        display_text: scaleIngredientLineForPortions(parsedIngredient?.raw_text || "", factor),
        food_name: parsedIngredient?.food_name || "",
        item_id: item?.id || null,
        required_amount: required,
        required_unit: requestedUnit,
        available_amount: comparison.available,
        status: comparison.status,
        label: comparison.status === "available" ? "Vorhanden" : comparison.status === "partial" ? "Teilweise vorhanden" : "Nicht vorhanden",
        note: comparison.note
    };
}

async function getRecipesByFoodItem(foodItemId, workspaceId) {
    const id = Number.parseInt(foodItemId, 10);
    if (!Number.isInteger(id) || id <= 0) return { error: "Gültige food_item_id ist erforderlich.", status: 400 };

    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
    if (!foodItem) return { error: "Lebensmittel-Stammsatz nicht gefunden.", status: 404 };

    const rows = await all(`
        SELECT
            r.*,
            ri.id AS ingredient_link_id,
            ri.raw_text AS ingredient_raw_text,
            ri.food_name AS ingredient_food_name,
            ri.amount AS ingredient_amount,
            ri.unit AS ingredient_unit,
            ri.sort_order AS ingredient_sort_order
        FROM recipe_ingredients ri
        INNER JOIN recipes r ON r.id = ri.recipe_id
        WHERE ri.food_item_id = ?
          AND r.workspace_id = ?
          AND r.visibility <> 'archived'
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC, ri.id ASC
    `, [id, workspaceId]);

    const recipeMap = new Map();
    for (const row of rows) {
        if (!recipeMap.has(row.id)) {
            recipeMap.set(row.id, { ...normalizeRecipeRow(row), matched_ingredients: [] });
        }
        recipeMap.get(row.id).matched_ingredients.push({
            id: row.ingredient_link_id,
            raw_text: row.ingredient_raw_text || row.ingredient_food_name || "",
            food_name: row.ingredient_food_name || foodItem.display_name || "",
            amount: row.ingredient_amount,
            unit: row.ingredient_unit || ""
        });
    }

    return {
        value: {
            food_item_id: id,
            food_item: normalizeFoodItemRow(foodItem),
            recipes: Array.from(recipeMap.values())
        }
    };
}

async function getRecipesByIngredient(name, workspaceId) {
    const ingredientName = normalizeIngredientText(name || "");
    if (!ingredientName) return { error: "Lebensmittelname ist erforderlich.", status: 400 };

    const recipes = await all(`SELECT * FROM recipes WHERE workspace_id = ? AND visibility <> 'archived' ORDER BY name COLLATE NOCASE ASC`, [workspaceId]);
    const matches = [];
    for (const recipe of recipes) {
        const parsed = parseIngredientsText(recipe.ingredients || "");
        const matchedIngredients = parsed.filter(ingredient => ingredients.ingredientMatchesName(ingredient.food_name, ingredientName));
        if (matchedIngredients.length) {
            matches.push({
                ...normalizeRecipeRow(recipe),
                matched_ingredients: matchedIngredients.map(ingredient => ({
                    raw_text: ingredient.raw_text,
                    food_name: ingredient.food_name,
                    amount: ingredient.amount,
                    unit: ingredient.unit
                }))
            });
        }
    }
    return { value: { ingredient: ingredientName, recipes: matches } };
}

async function getRecipeStockCheck(recipeId, portions, workspaceId) {
    const recipe = await get(`SELECT * FROM recipes WHERE id = ? AND workspace_id = ?`, [recipeId, workspaceId]);
    if (!recipe) return { notFound: true };

    const requestedPortions = Number.parseInt(portions, 10);
    const basePortions = Number.parseInt(recipe.portions, 10) > 0 ? Number.parseInt(recipe.portions, 10) : 1;
    const displayedPortions = Number.isInteger(requestedPortions) && requestedPortions > 0 ? requestedPortions : basePortions;
    const factor = displayedPortions / basePortions;
    const inventoryItems = await inventoryService.getAllInventoryItemsWithBatches();

    const linkedIngredients = await all(`
        SELECT
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.sort_order,
            ri.food_item_id,
            fi.display_name AS food_display_name
        FROM recipe_ingredients ri
        LEFT JOIN food_items fi ON fi.id = ri.food_item_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order ASC
    `, [recipeId]);

    const parsedIngredients = linkedIngredients.length
        ? linkedIngredients.map(row => ({
            line_index: Number(row.sort_order),
            raw_text: row.raw_text || "",
            food_name: row.food_display_name || row.food_name || "",
            amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
            unit: row.unit || "",
            original_unit: row.unit || "",
            food_item_id: row.food_item_id || null
        }))
        : parseIngredientsText(recipe.ingredients || "");

    const entries = parsedIngredients.map(ingredient => buildRecipeStockEntry(ingredient, inventoryItems, factor));
    const summary = entries.reduce((result, entry) => {
        if (entry.status === "available") result.available += 1;
        if (entry.status === "partial") result.partial += 1;
        if (entry.status === "missing") result.missing += 1;
        return result;
    }, { available: 0, partial: 0, missing: 0 });

    return {
        value: {
            recipe_id: Number(recipe.id),
            base_portions: basePortions,
            displayed_portions: displayedPortions,
            ingredients: entries,
            summary
        }
    };
}

module.exports = {
    getRecipesByFoodItem,
    getRecipesByIngredient,
    getRecipeStockCheck
};
