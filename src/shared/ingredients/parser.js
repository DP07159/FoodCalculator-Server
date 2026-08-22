const {
    parseFraction,
    normalizeIngredientUnit,
    unitForInventory,
    convertIngredientAmount
} = require("./units");

const {
    normalizeIngredientText,
    normalizeVisibleFoodName
} = require("./normalizer");

function cleanIngredientName(value) {
    const unitPattern = "kg|g|gr|gramm|ml|l|liter|stk\\.?|stück|stueck|dose|dosen|glas|gläser|glaeser|packung|packungen|pkg|el|esslöffel|essloeffel|tl|teelöffel|teeloeffel|prise|prisen";
    const amountPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[,.]\\d+)?|[¼½¾⅓⅔])";

    const cleaned = String(value || "")
        .replace(/\([^)]*\)/g, " ")
        .replace(new RegExp(`\\b(?:a|à)\\s*${amountPattern}\\s*(${unitPattern})\\b`, "gi"), " ")
        .replace(new RegExp(`(^|[\\s,(])${amountPattern}\\s*(${unitPattern})\\b`, "gi"), " ")
        .replace(new RegExp(`(^|[\\s,(])(${unitPattern})\\s*${amountPattern}\\b`, "gi"), " ")
        .replace(/(^|\s)(?:a|à|je|pro)(?=\s|$)/gi, " ")
        .replace(/[,;:/]+\s*$/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return normalizeVisibleFoodName(cleaned);
}

function findAmountUnitMatches(rawText, unitPattern) {
    const text = String(rawText || "");
    const amountPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[,.]\\d+)?|[¼½¾⅓⅔])";
    const matches = [];

    const patterns = [
        { regex: new RegExp(`(^|[\\s,(])(${amountPattern})\\s*(${unitPattern})\\b`, "gi"), amountIndex: 2, unitIndex: 3 },
        { regex: new RegExp(`(^|[\\s,(])(${unitPattern})\\s*(${amountPattern})\\b`, "gi"), amountIndex: 3, unitIndex: 2 }
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
            const prefixLength = match[1] ? match[1].length : 0;
            const start = match.index + prefixLength;
            const token = match[0].slice(prefixLength);
            matches.push({
                start,
                end: start + token.length,
                amountText: match[pattern.amountIndex],
                unitText: match[pattern.unitIndex],
                token
            });
        }
    }

    return matches.sort((a, b) => a.start - b.start);
}

function getContainerMultiplier(rawText, physicalMatch) {
    const textBeforePhysical = String(rawText || "").slice(0, physicalMatch?.start ?? 0);
    const containerUnitPattern = "stk\\.?|stück|stueck|dose|dosen|glas|gläser|glaeser|packung|packungen|pkg";
    const containerMatches = findAmountUnitMatches(textBeforePhysical, containerUnitPattern);
    if (!containerMatches.length) return 1;

    const lastContainer = containerMatches[containerMatches.length - 1];
    const between = String(rawText || "").slice(lastContainer.end, physicalMatch.start).toLowerCase();
    const hasPerUnitHint = /(?:\b(?:a|à|je|pro)\b|\/|per)/i.test(between);
    const isCloseEnough = between.length <= 50;

    if (!hasPerUnitHint && !isCloseEnough) return 1;

    const multiplier = parseFraction(lastContainer.amountText);
    return multiplier && multiplier > 0 ? multiplier : 1;
}

function findAmountUnitInIngredient(rawText) {
    const amountPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[,.]\\d+)?|[¼½¾⅓⅔])";
    const physicalUnitPattern = "kg|g|gr|gramm|ml|l|liter";
    const containerUnitPattern = "stk\\.?|stück|stueck|dose|dosen|glas|gläser|glaeser|packung|packungen|pkg|el|esslöffel|essloeffel|tl|teelöffel|teeloeffel|prise|prisen";

    const physicalMatches = findAmountUnitMatches(rawText, physicalUnitPattern);
    if (physicalMatches.length) {
        const text = String(rawText || "").toLowerCase();
        const selected = /abtropf|abgetropft|netto|einwaage/.test(text)
            ? physicalMatches[physicalMatches.length - 1]
            : physicalMatches[0];
        return { ...selected, multiplier: getContainerMultiplier(rawText, selected) };
    }

    const containerMatches = findAmountUnitMatches(rawText, containerUnitPattern);
    if (containerMatches.length) return { ...containerMatches[0], multiplier: 1 };

    const amountOnlyRegex = new RegExp(`(^|[\\s,(])(${amountPattern})(?=\\s|$)`, "i");
    const match = String(rawText || "").match(amountOnlyRegex);
    if (match) {
        const prefixLength = match[1] ? match[1].length : 0;
        const start = match.index + prefixLength;
        const token = match[0].slice(prefixLength);
        return { start, end: start + token.length, amountText: match[2], unitText: "Stk.", multiplier: 1 };
    }

    return null;
}

function parseIngredientLine(line) {
    const rawText = normalizeIngredientText(line);
    if (!rawText) return null;

    let amount = null;
    let unit = "";
    let foodName = rawText;

    const amountUnit = findAmountUnitInIngredient(rawText);
    if (amountUnit) {
        amount = parseFraction(amountUnit.amountText);
        if (amount !== null && amount !== undefined && amountUnit.multiplier) {
            amount *= amountUnit.multiplier;
        }
        unit = normalizeIngredientUnit(amountUnit.unitText);
        foodName = `${rawText.slice(0, amountUnit.start)} ${rawText.slice(amountUnit.end)}`;
    }

    foodName = cleanIngredientName(foodName);
    if (!foodName || foodName.length < 2) return null;

    const inventoryUnit = unitForInventory(unit);
    const normalizedAmount = convertIngredientAmount(amount, unit);

    return {
        raw_text: rawText,
        food_name: foodName,
        amount: normalizedAmount,
        unit: inventoryUnit || normalizeIngredientUnit(unit) || "",
        original_unit: normalizeIngredientUnit(unit)
    };
}

function parseIngredientsText(ingredientsText) {
    return String(ingredientsText || "")
        .split(/\n|\r|;/)
        .map((line, index) => {
            const parsed = parseIngredientLine(line);
            if (!parsed) return null;
            return {
                ...parsed,
                line_index: index
            };
        })
        .filter(Boolean);
}

module.exports = {
    cleanIngredientName,
    findAmountUnitMatches,
    getContainerMultiplier,
    findAmountUnitInIngredient,
    parseIngredientLine,
    parseIngredientsText
};
