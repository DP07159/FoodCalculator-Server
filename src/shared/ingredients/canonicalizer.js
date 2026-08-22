const {
    FOOD_BASE_ALIASES,
    FOOD_VARIANT_ALIASES,
    FOOD_VARIANT_DISPLAY,
    UNIT_TOKEN_SET,
    FILLER_TOKEN_SET
} = require("./aliases");

const {
    normalizeVisibleFoodName,
    normalizeGermanText,
    removeIngredientDescriptors
} = require("./normalizer");

function singularizeFoodToken(token) {
    let word = String(token || "").trim();

    if (!word || word.length <= 4) {
        return word;
    }

    if (FOOD_BASE_ALIASES.has(word)) {
        return FOOD_BASE_ALIASES.get(word);
    }

    if (word.endsWith("innen")) {
        return word.slice(0, -5);
    }

    if (word.endsWith("ungen")) {
        return word.slice(0, -5);
    }

    if (word.endsWith("en") && word.length > 5) {
        return word.slice(0, -2);
    }

    if (word.endsWith("er") && word.length > 5) {
        return word.slice(0, -2);
    }

    if (word.endsWith("n") && word.length > 5) {
        return word.slice(0, -1);
    }

    if (word.endsWith("e") && word.length > 5) {
        return word.slice(0, -1);
    }

    if (word.endsWith("s") && word.length > 5) {
        return word.slice(0, -1);
    }

    return word;
}

function titleCaseFoodToken(value) {
    const token = String(value || "").trim();

    if (!token) {
        return "";
    }

    const displayMap = {
        thunfisch: "Thunfisch",
        paprika: "Paprika",
        kidneybohnen: "Kidneybohnen",
        kichererbsen: "Kichererbsen",
        tomaten: "Tomaten",
        zwiebeln: "Zwiebeln",
        fruehlingszwiebeln: "Frühlingszwiebeln",
        eier: "Eier"
    };

    if (displayMap[token]) {
        return displayMap[token];
    }

    return token
        .charAt(0)
        .toUpperCase() +
        token
            .slice(1)
            .replace(/ae/g, "ä")
            .replace(/oe/g, "ö")
            .replace(/ue/g, "ü");
}

function buildFoodIdentity(value) {
    const raw = normalizeGermanText(
        removeIngredientDescriptors(value)
    )
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const tokens = raw
        .split(" ")
        .filter(Boolean)
        .filter(token => {
            if (/^\d/.test(token)) {
                return false;
            }

            if (UNIT_TOKEN_SET.has(token)) {
                return false;
            }

            if (FILLER_TOKEN_SET.has(token)) {
                return false;
            }

            return token.length > 1;
        });

    const variants = [];
    const baseTokens = [];

    for (const token of tokens) {
        const variant = FOOD_VARIANT_ALIASES.get(token);

        if (variant) {
            if (!variants.includes(variant)) {
                variants.push(variant);
            }

            continue;
        }

        const singular = singularizeFoodToken(token);

        const base =
            FOOD_BASE_ALIASES.get(token) ||
            FOOD_BASE_ALIASES.get(singular) ||
            singular;

        if (base && !baseTokens.includes(base)) {
            baseTokens.push(base);
        }
    }

    const baseKey = baseTokens.join("_");
    const variantKey = variants.sort().join("_");

    const canonicalKey = [baseKey, variantKey]
        .filter(Boolean)
        .join("__");

    return {
        canonical_key: canonicalKey,
        display_name: normalizeVisibleFoodName(value)
    };
}

function canonicalizeIngredientName(value) {
    return buildFoodIdentity(value).canonical_key;
}

function displayIngredientNameFromCanonical(value, fallback) {
    return normalizeVisibleFoodName(fallback || value);
}

module.exports = {
    singularizeFoodToken,
    titleCaseFoodToken,
    buildFoodIdentity,
    canonicalizeIngredientName,
    displayIngredientNameFromCanonical
};
