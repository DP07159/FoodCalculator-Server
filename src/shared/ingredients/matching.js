const {
    canonicalizeIngredientName,
    buildFoodIdentity
} = require("./canonicalizer");

const {
    normalizeGermanText
} = require("./normalizer");

function normalizeIngredientRawLineForMatch(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function ingredientFoodNamesMatch(a, b) {
    const left = canonicalizeIngredientName(a);
    const right = canonicalizeIngredientName(b);

    if (!left || !right) {
        return false;
    }

    return left === right;
}

function normalizeComparableName(value) {
    return canonicalizeIngredientName(value);
}

function singularizeComparableName(value) {
    let text = normalizeComparableName(value);

    if (text.length <= 3) {
        return text;
    }

    text = text.replace(
        /\b(\w+)(chen|lein)\b/g,
        "$1$2"
    );

    text = text.replace(
        /\b(\w+?)(innen|ungen|keiten|heiten)\b/g,
        "$1"
    );

    text = text.replace(
        /\b(\w+?)(en|er|n|e|s)\b/g,
        (match, stem) =>
            stem.length >= 3 ? stem : match
    );

    return text
        .replace(/\s+/g, " ")
        .trim();
}

function getComparableNameVariants(value) {
    const normalized =
        normalizeComparableName(value);

    const singular =
        singularizeComparableName(normalized);

    return Array.from(
        new Set(
            [normalized, singular].filter(Boolean)
        )
    );
}

function comparableNamesMatch(a, b) {
    const aVariants =
        getComparableNameVariants(a);

    const bVariants =
        getComparableNameVariants(b);

    if (!aVariants.length || !bVariants.length) {
        return false;
    }

    if (
        aVariants.some(
            value => bVariants.includes(value)
        )
    ) {
        return true;
    }

    return aVariants.some(av =>
        bVariants.some(bv => {
            if (
                av.length < 3 ||
                bv.length < 3
            ) {
                return false;
            }

            const aTokens = av
                .split(" ")
                .filter(token => token.length >= 3);

            const bTokens = bv
                .split(" ")
                .filter(token => token.length >= 3);

            if (
                !aTokens.length ||
                !bTokens.length
            ) {
                return false;
            }

            return (
                aTokens.every(
                    token => bTokens.includes(token)
                ) ||
                bTokens.every(
                    token => aTokens.includes(token)
                )
            );
        })
    );
}

function ingredientMatchesName(
    ingredientName,
    searchName
) {
    const left =
        buildFoodIdentity(
            ingredientName
        ).canonical_key;

    const right =
        buildFoodIdentity(
            searchName
        ).canonical_key;

    if (
        left &&
        right &&
        left === right
    ) {
        return true;
    }

    const leftDisplay =
        normalizeGermanText(ingredientName)
            .replace(
                /[^a-z0-9\s-]/g,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();

    const rightDisplay =
        normalizeGermanText(searchName)
            .replace(
                /[^a-z0-9\s-]/g,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();

    return Boolean(
        leftDisplay &&
        rightDisplay &&
        leftDisplay === rightDisplay
    );
}

module.exports = {
    normalizeIngredientRawLineForMatch,
    ingredientFoodNamesMatch,
    normalizeComparableName,
    singularizeComparableName,
    getComparableNameVariants,
    comparableNamesMatch,
    ingredientMatchesName
};
