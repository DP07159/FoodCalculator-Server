function toPositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIngredientLinks(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map(link => ({
            line_index: Number.parseInt(link.line_index ?? link.index, 10),
            food_item_id: Number.parseInt(
                link.food_item_id ?? link.foodItemId,
                10
            ),
            raw_text: typeof link.raw_text === "string"
                ? link.raw_text
                : ""
        }))
        .filter(link =>
            Number.isInteger(link.line_index) &&
            link.line_index >= 0 &&
            Number.isInteger(link.food_item_id) &&
            link.food_item_id > 0
        );
}

function validateRecipePayload(payload, { allowEmptyPortions = false } = {}) {
    const name = typeof payload.name === "string"
        ? payload.name.trim()
        : "";

    const calories = toPositiveInteger(payload.calories);

    const portions =
        payload.portions === "" ||
        payload.portions === null ||
        payload.portions === undefined
            ? null
            : toPositiveInteger(payload.portions);

    const mealTypes = Array.isArray(payload.mealTypes)
        ? payload.mealTypes
        : [];

    if (!name) {
        return { error: "Name ist erforderlich." };
    }

    if (!calories) {
        return {
            error: "Kalorien müssen als ganze Zahl größer 0 angegeben werden."
        };
    }

    if (!allowEmptyPortions && !portions) {
        return {
            error: "Portionen müssen als ganze Zahl größer 0 angegeben werden."
        };
    }

    if (mealTypes.length === 0 && payload.mealTypes !== undefined) {
        return {
            error: "Mindestens eine Mahlzeit muss ausgewählt werden."
        };
    }

    return {
        value: {
            name,
            calories,
            portions,
            mealTypes,
            ingredients:
                typeof payload.ingredients === "string"
                    ? payload.ingredients
                    : "",
            instructions:
                typeof payload.instructions === "string"
                    ? payload.instructions
                    : "",
            is_favorite:
                Number(payload.is_favorite) === 1 ? 1 : 0,
            ingredientLinks:
                normalizeIngredientLinks(payload.ingredientLinks)
        }
    };
}

module.exports = {
    validateRecipePayload,
    normalizeIngredientLinks,
    toPositiveInteger
};
