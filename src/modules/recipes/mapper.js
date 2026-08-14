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

function normalizeIngredientLinks(rows = []) {
    return rows.map(row => ({
        line_index: Number(row.line_index) || 0,
        raw_text: row.raw_text || "",
        food_name: row.food_display_name || row.food_name || "",
        stored_food_name: row.food_name || "",
        amount:
            row.amount === null || row.amount === undefined
                ? null
                : Number(row.amount),
        unit: row.unit || "",
        food_item_id: row.food_item_id || null,
        link_source: row.link_source || ""
    }));
}

module.exports = {
    parseMealTypes,
    normalizeRecipeRow,
    normalizeIngredientLinks
};
