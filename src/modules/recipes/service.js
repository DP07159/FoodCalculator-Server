const recipeRepository = require("./repository");
const {
    parseMealTypes,
    normalizeRecipeRow
} = require("./mapper");
const {
    validateRecipePayload
} = require("./validator");

function normalizeIngredientsTextForChangeCheck(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim();
}

function hasExplicitIngredientLinksPayload(payload) {
    return (
        Object.prototype.hasOwnProperty.call(
            payload || {},
            "ingredientLinks"
        ) &&
        Array.isArray(payload.ingredientLinks)
    );
}

async function getAllRecipes() {
    const rows = await recipeRepository.findAll();
    return rows.map(normalizeRecipeRow);
}

async function getRecipeById(recipeId) {
    const recipe = await recipeRepository.findById(recipeId);

    if (!recipe) {
        return null;
    }

    return normalizeRecipeRow(recipe);
}

async function createRecipe(payload) {
    const validation = validateRecipePayload(payload);

    if (validation.error) {
        return {
            error: validation.error
        };
    }

    const recipe = await recipeRepository.create(validation.value);

    return {
        value: normalizeRecipeRow(recipe),
        ingredientLinks: validation.value.ingredientLinks
    };
}

async function updateRecipe(recipeId, payload) {
    const current = await recipeRepository.findById(recipeId);

    if (!current) {
        return {
            notFound: true
        };
    }

    const validation = validateRecipePayload(
        {
            ...payload,
            mealTypes:
                payload.mealTypes ??
                parseMealTypes(current.mealTypes)
        },
        {
            allowEmptyPortions: true
        }
    );

    if (validation.error) {
        return {
            error: validation.error
        };
    }

    const favoriteValue =
        payload.is_favorite === undefined
            ? Number(current.is_favorite) || 0
            : validation.value.is_favorite;

    const updated = await recipeRepository.update(
        recipeId,
        {
            ...validation.value,
            is_favorite: favoriteValue
        }
    );

    const ingredientsChanged =
        normalizeIngredientsTextForChangeCheck(
            current.ingredients
        ) !==
        normalizeIngredientsTextForChangeCheck(
            updated.ingredients
        );

    return {
        value: normalizeRecipeRow(updated),
        ingredientLinks: validation.value.ingredientLinks,
        shouldSyncIngredients:
            ingredientsChanged ||
            hasExplicitIngredientLinksPayload(payload)
    };
}

async function updateRecipeFavorite(recipeId, isFavorite) {
    const favoriteValue =
        Number(isFavorite) === 1 ? 1 : 0;

    const result = await recipeRepository.updateFavorite(
        recipeId,
        favoriteValue
    );

    if (result.changes === 0) {
        return null;
    }

    return {
        id: Number(recipeId),
        is_favorite: favoriteValue
    };
}

async function deleteRecipe(recipeId) {
    await recipeRepository.deleteIngredients(recipeId);

    const result = await recipeRepository.deleteById(recipeId);

    return result.changes > 0;
}

module.exports = {
    getAllRecipes,
    getRecipeById,
    createRecipe,
    updateRecipe,
    updateRecipeFavorite,
    deleteRecipe
};
