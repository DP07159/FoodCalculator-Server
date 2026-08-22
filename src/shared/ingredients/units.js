function parseFraction(value) {
    const text = String(value || "")
        .trim()
        .replace(",", ".");

    const fractionMap = {
        "¼": 0.25,
        "½": 0.5,
        "¾": 0.75,
        "⅓": 1 / 3,
        "⅔": 2 / 3
    };

    if (fractionMap[text] !== undefined) {
        return fractionMap[text];
    }

    if (/^\d+\/\d+$/.test(text)) {
        const [numerator, denominator] = text.split("/").map(Number);
        return denominator ? numerator / denominator : null;
    }

    if (/^\d+(\.\d+)?$/.test(text)) {
        return Number(text);
    }

    const mixedFraction = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);

    if (mixedFraction) {
        return (
            Number(mixedFraction[1]) +
            Number(mixedFraction[2]) / Number(mixedFraction[3])
        );
    }

    return null;
}

function normalizeIngredientUnit(unit) {
    const clean = String(unit || "")
        .trim()
        .toLowerCase()
        .replace(".", "");

    const aliases = {
        g: "g",
        gr: "g",
        gramm: "g",
        kg: "kg",
        kilogramm: "kg",

        ml: "ml",
        milliliter: "ml",
        cl: "cl",
        zentiliter: "cl",
        dl: "dl",
        deziliter: "dl",
        l: "l",
        liter: "l",

        cup: "cup",
        cups: "cup",
        tasse: "cup",
        tassen: "cup",

        stk: "Stk.",
        stück: "Stk.",
        stueck: "Stk.",
        ei: "Stk.",
        eier: "Stk.",

        dose: "Dose",
        dosen: "Dose",
        glas: "Glas",
        glaeser: "Glas",
        gläser: "Glas",
        packung: "Packung",
        packungen: "Packung",
        pkg: "Packung",

        el: "EL",
        esslöffel: "EL",
        essloeffel: "EL",
        tablespoon: "EL",
        tablespoons: "EL",
        tbsp: "EL",

        tl: "TL",
        teelöffel: "TL",
        teeloeffel: "TL",
        teaspoon: "TL",
        teaspoons: "TL",
        tsp: "TL",

        prise: "Prise",
        prisen: "Prise",
        spritzer: "Spritzer",
        schuss: "Spritzer",
        schuesse: "Spritzer",
        schüsse: "Spritzer"
    };

    return aliases[clean] || unit || "";
}

function unitForInventory(unit) {
    const normalized = normalizeIngredientUnit(unit);

    if (normalized === "kg" || normalized === "g") {
        return "g";
    }

    if (
        ["l", "dl", "cl", "ml", "cup", "EL", "TL"].includes(normalized)
    ) {
        return "ml";
    }

    return "Stk.";
}

function convertIngredientAmount(amount, unit) {
    if (amount === null || amount === undefined) {
        return null;
    }

    const normalized = normalizeIngredientUnit(unit);

    if (normalized === "kg" || normalized === "l") {
        return amount * 1000;
    }

    if (normalized === "dl") {
        return amount * 100;
    }

    if (normalized === "cl") {
        return amount * 10;
    }

    if (normalized === "cup") {
        return amount * 240;
    }

    if (normalized === "EL") {
        return amount * 15;
    }

    if (normalized === "TL") {
        return amount * 5;
    }

    return amount;
}

module.exports = {
    parseFraction,
    normalizeIngredientUnit,
    unitForInventory,
    convertIngredientAmount
};
