function normalizeIngredientText(value) {
    return String(value || "")
        .replace(/^[-•*]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeVisibleFoodName(value) {
    return String(value || "")
        .replace(/^[-•*]\s*/, "")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[,;:/]+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeGermanText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue");
}

function removeIngredientDescriptors(value) {
    return String(value || "")
        .replace(/\([^)]*\)/g, " ")
        .replace(
            /\b(?:in|mit)\s+(?:eigenem\s+saft|saft|wasser|oel|öl|lake|tomatensauce)\b/gi,
            " "
        )
        .replace(
            /\b(?:abgetropft|abtropfgewicht|netto|einwaage|fuellmenge|füllmenge|natur|naturell|frisch|frische|frischer|frisches|getrocknet|gekocht|vorgekocht|roh|gehackt|geschnitten|gewuerfelt|gewürfelt|gerieben|optional|ca|circa|etwa|nach\s+geschmack)\b/gi,
            " "
        )
        .replace(/[,;:/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

module.exports = {
    normalizeIngredientText,
    normalizeVisibleFoodName,
    normalizeGermanText,
    removeIngredientDescriptors
};
