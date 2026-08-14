const recipeRepository = require("./repository");
const {
    parseMealTypes,
    normalizeRecipeRow,
    normalizeIngredientLinks
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

async function mapRecipeWithIngredientLinks(recipe) {
    const rows = await recipeRepository.findIngredientLinks(recipe.id);

    return {
        ...normalizeRecipeRow(recipe),
        ingredientLinks: normalizeIngredientLinks(rows)
    };
}

async function getAllRecipes(workspaceId) {
    const rows = await recipeRepository.findAll(workspaceId);
    return rows.map(normalizeRecipeRow);
}

async function getRecipeById(recipeId, workspaceId) {
    const recipe = await recipeRepository.findById(recipeId, workspaceId);

    if (!recipe) {
        return null;
    }

    return mapRecipeWithIngredientLinks(recipe);
}

async function createRecipe(payload, workspaceId, ownerUserId) {
    const validation = validateRecipePayload(payload);

    if (validation.error) {
        return {
            error: validation.error
        };
    }

    const recipe = await recipeRepository.create(validation.value, workspaceId, ownerUserId);

    return {
        value: await mapRecipeWithIngredientLinks(recipe),
        ingredientLinks: validation.value.ingredientLinks
    };
}

async function updateRecipe(recipeId, payload, workspaceId) {
    const current = await recipeRepository.findById(recipeId, workspaceId);

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
        },
        workspaceId
    );

    const ingredientsChanged =
        normalizeIngredientsTextForChangeCheck(
            current.ingredients
        ) !==
        normalizeIngredientsTextForChangeCheck(
            updated.ingredients
        );

    return {
        value: await mapRecipeWithIngredientLinks(updated),
        ingredientLinks: validation.value.ingredientLinks,
        shouldSyncIngredients:
            ingredientsChanged ||
            hasExplicitIngredientLinksPayload(payload)
    };
}

async function updateRecipeFavorite(recipeId, isFavorite, workspaceId) {
    const favoriteValue =
        Number(isFavorite) === 1 ? 1 : 0;

    const result = await recipeRepository.updateFavorite(
        recipeId,
        favoriteValue,
        workspaceId
    );

    if (result.changes === 0) {
        return null;
    }

    return {
        id: Number(recipeId),
        is_favorite: favoriteValue
    };
}

async function deleteRecipe(recipeId, workspaceId) {
    const current = await recipeRepository.findById(recipeId, workspaceId);
    if (!current) return false;

    await recipeRepository.deleteIngredients(recipeId);

    const result = await recipeRepository.deleteById(recipeId, workspaceId);

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
