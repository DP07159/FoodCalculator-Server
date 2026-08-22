const FOOD_BASE_ALIASES = new Map([
    ["thunfischstuecke", "thunfisch"],
    ["thunfischstucke", "thunfisch"],
    ["thunfischfilet", "thunfisch"],
    ["thunfischfilets", "thunfisch"],
    ["tunfisch", "thunfisch"],

    ["paprikaschote", "paprika"],
    ["paprikaschoten", "paprika"],

    ["kidneybohne", "kidneybohnen"],
    ["kidneybohnen", "kidneybohnen"],
    ["kidney", "kidney"],

    ["kichererbse", "kichererbsen"],
    ["kichererbsen", "kichererbsen"],

    ["tomate", "tomaten"],
    ["tomaten", "tomaten"],

    ["zwiebel", "zwiebeln"],
    ["zwiebeln", "zwiebeln"],

    ["fruehlingszwiebel", "fruehlingszwiebeln"],
    ["fruehlingszwiebeln", "fruehlingszwiebeln"],
    ["lauchzwiebel", "fruehlingszwiebeln"],
    ["lauchzwiebeln", "fruehlingszwiebeln"],

    ["ei", "eier"],
    ["eier", "eier"]
]);

const FOOD_VARIANT_ALIASES = new Map([
    ["rot", "rot"],
    ["rote", "rot"],
    ["roter", "rot"],
    ["rotes", "rot"],
    ["roten", "rot"],

    ["gelb", "gelb"],
    ["gelbe", "gelb"],
    ["gelber", "gelb"],
    ["gelbes", "gelb"],
    ["gelben", "gelb"],

    ["gruen", "gruen"],
    ["gruene", "gruen"],
    ["gruener", "gruen"],
    ["gruenes", "gruen"],
    ["gruenen", "gruen"],
    ["grun", "gruen"],
    ["grune", "gruen"],

    ["weiss", "weiss"],
    ["weisse", "weiss"],
    ["weisser", "weiss"],
    ["weisses", "weiss"],
    ["weissen", "weiss"],

    ["braun", "braun"],
    ["braune", "braun"],
    ["brauner", "braun"],
    ["braunes", "braun"],

    ["vollkorn", "vollkorn"],
    ["laktosefrei", "laktosefrei"],
    ["vegan", "vegan"],

    ["geraeuchert", "geraeuchert"],
    ["geraeucherte", "geraeuchert"],
    ["gerauechert", "geraeuchert"],

    ["tk", "tk"],
    ["tiefgekuehlt", "tk"],
    ["tiefgefroren", "tk"]
]);

const FOOD_VARIANT_DISPLAY = {
    rot: "Rote",
    gelb: "Gelbe",
    gruen: "Grüne",
    weiss: "Weiße",
    braun: "Braune",
    vollkorn: "Vollkorn",
    laktosefrei: "Laktosefreie",
    vegan: "Vegane",
    geraeuchert: "Geräucherte",
    tk: "TK"
};

const UNIT_TOKEN_SET = new Set([
    "kg",
    "g",
    "gr",
    "gramm",
    "ml",
    "cl",
    "dl",
    "l",
    "liter",
    "milliliter",
    "zentiliter",
    "deziliter",
    "stk",
    "stueck",
    "stuck",
    "dose",
    "dosen",
    "glas",
    "glaeser",
    "gläser",
    "packung",
    "packungen",
    "pkg",
    "cup",
    "cups",
    "tasse",
    "tassen",
    "el",
    "essloeffel",
    "esslöffel",
    "tl",
    "teeloeffel",
    "teelöffel",
    "tbsp",
    "tsp",
    "prise",
    "prisen",
    "spritzer",
    "schuss",
    "schuesse",
    "schüsse"
]);

const FILLER_TOKEN_SET = new Set([
    "a",
    "à",
    "je",
    "pro",
    "ca",
    "circa",
    "etwa",
    "und",
    "oder",
    "mit",
    "in",
    "aus",
    "von",
    "fuer",
    "fur"
]);

module.exports = {
    FOOD_BASE_ALIASES,
    FOOD_VARIANT_ALIASES,
    FOOD_VARIANT_DISPLAY,
    UNIT_TOKEN_SET,
    FILLER_TOKEN_SET
};
