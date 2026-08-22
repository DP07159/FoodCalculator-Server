const foodItemRepository = require("./repository");

const {
    buildFoodIdentity,
    canonicalizeIngredientName,
    normalizeVisibleFoodName
} = require("../../shared/ingredients");

async function addFoodAlias(foodItemId, aliasName) {
    const alias = String(aliasName || "").trim();

    if (!foodItemId || !alias) {
        return;
    }

    const aliasKey =
        buildFoodIdentity(alias).canonical_key ||
        canonicalizeIngredientName(alias);

    if (!aliasKey) {
        return;
    }

    await foodItemRepository.createAlias({
        foodItemId,
        aliasName: alias,
        aliasKey
    });
}

async function findFoodItemByName(name) {
    const identity = buildFoodIdentity(name);

    if (!identity.canonical_key) {
        return null;
    }

    const direct = await foodItemRepository.findByCanonicalKey(
        identity.canonical_key
    );

    if (direct) {
        return direct;
    }

    return foodItemRepository.findByAliasKey(identity.canonical_key);
}

async function getOrCreateFoodItem(
    name,
    {
        calories_per_100g = null,
        aliasName = ""
    } = {}
) {
    const identity = buildFoodIdentity(name);

    const canonicalKey =
        identity.canonical_key ||
        canonicalizeIngredientName(name);

    const displayName = normalizeVisibleFoodName(name);

    if (!canonicalKey || !displayName) {
        throw new Error(
            "Lebensmittel konnte nicht normalisiert werden."
        );
    }

    let foodItem =
        await foodItemRepository.findByCanonicalKey(canonicalKey);

    if (!foodItem) {
        foodItem = await foodItemRepository.create({
            displayName,
            canonicalKey,
            caloriesPer100g: calories_per_100g
        });
    } else if (
        (
            foodItem.calories_per_100g === null ||
            foodItem.calories_per_100g === undefined
        ) &&
        calories_per_100g !== null &&
        calories_per_100g !== undefined
    ) {
        foodItem = await foodItemRepository.updateCalories(
            foodItem.id,
            calories_per_100g
        );
    }

    await addFoodAlias(foodItem.id, displayName);
    await addFoodAlias(foodItem.id, name);

    if (aliasName) {
        await addFoodAlias(foodItem.id, aliasName);
    }

    return foodItem;
}

async function renameFoodItemStable(
    foodItemId,
    displayName,
    {
        calories_per_100g = undefined,
        updateCanonical = true
    } = {}
) {
    const id = Number(foodItemId);
    const nextName = String(displayName || "").trim();

    if (!Number.isFinite(id)) {
        throw new Error(
            "Ungültiger Lebensmittel-Stammsatz."
        );
    }

    if (!nextName) {
        throw new Error(
            "Anzeigename ist erforderlich."
        );
    }

    const current = await foodItemRepository.findById(id);

    if (!current) {
        throw new Error(
            "Lebensmittel-Stammsatz wurde nicht gefunden."
        );
    }

    const nextCanonical =
        buildFoodIdentity(nextName).canonical_key ||
        canonicalizeIngredientName(nextName) ||
        current.canonical_key;

    let canonicalToStore = current.canonical_key;

    if (updateCanonical && nextCanonical) {
        const conflicting =
            await foodItemRepository.findByCanonicalKey(
                nextCanonical
            );

        if (
            !conflicting ||
            Number(conflicting.id) === id
        ) {
            canonicalToStore = nextCanonical;
        }
    }

    const calories =
        calories_per_100g === undefined
            ? current.calories_per_100g
            : (
                calories_per_100g === null ||
                calories_per_100g === ""
                    ? null
                    : Number(calories_per_100g)
            );

    await addFoodAlias(id, current.display_name);

    if (current.canonical_key) {
        await addFoodAlias(id, current.canonical_key);
    }

    await addFoodAlias(id, nextName);

    const updated = await foodItemRepository.update({
        foodItemId: id,
        displayName: nextName,
        canonicalKey: canonicalToStore,
        caloriesPer100g: calories
    });

    await foodItemRepository.updateLinkedInventoryItems({
        foodItemId: id,
        displayName: nextName,
        canonicalKey: canonicalToStore,
        caloriesPer100g: calories
    });

    await foodItemRepository.updateLinkedRecipeIngredients({
        foodItemId: id,
        canonicalKey: canonicalToStore
    });

    return updated;
}

async function createDistinctFoodItemFromIngredient(
    name,
    {
        calories_per_100g = null,
        aliasName = ""
    } = {}
) {
    const identity = buildFoodIdentity(name);

    const baseCanonicalKey =
        identity.canonical_key ||
        canonicalizeIngredientName(name);

    const displayName = normalizeVisibleFoodName(name);

    if (!baseCanonicalKey || !displayName) {
        throw new Error(
            "Lebensmittel konnte nicht normalisiert werden."
        );
    }

    let canonicalKey = baseCanonicalKey;
    let counter = 1;

    while (
        await foodItemRepository.existsByCanonicalKey(
            canonicalKey
        )
    ) {
        counter += 1;

        canonicalKey =
            `${baseCanonicalKey}__recipe_${Date.now()}_${counter}`;
    }

    const foodItem = await foodItemRepository.create({
        displayName,
        canonicalKey,
        caloriesPer100g: calories_per_100g
    });

    await addFoodAlias(foodItem.id, displayName);
    await addFoodAlias(foodItem.id, name);

    if (aliasName) {
        await addFoodAlias(foodItem.id, aliasName);
    }

    return foodItem;
}

module.exports = {
    addFoodAlias,
    findFoodItemByName,
    getOrCreateFoodItem,
    renameFoodItemStable,
    createDistinctFoodItemFromIngredient,
};
