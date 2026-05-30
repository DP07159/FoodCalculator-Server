const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const dataDir = "/var/data";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "food_calculator.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Fehler beim Öffnen der Datenbank:", err.message);
    else console.log(`SQLite verbunden: ${dbPath}`);
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function addColumnIfMissing(tableName, columnName, definition) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const existingColumns = columns.map(column => column.name);
    if (!existingColumns.includes(columnName)) {
        await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
        console.log(`Spalte ergänzt: ${tableName}.${columnName}`);
    }
}

async function ensureSchema() {
    await run(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            calories INTEGER NOT NULL,
            portions INTEGER,
            mealTypes TEXT NOT NULL,
            ingredients TEXT DEFAULT '',
            instructions TEXT DEFAULT '',
            is_favorite INTEGER DEFAULT 0
        )
    `);

    await addColumnIfMissing("recipes", "ingredients", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipes", "instructions", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipes", "portions", "INTEGER");
    await addColumnIfMissing("recipes", "is_favorite", "INTEGER DEFAULT 0");

    await run(`
        CREATE TABLE IF NOT EXISTS recipe_ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id INTEGER NOT NULL,
            raw_text TEXT DEFAULT '',
            food_name TEXT NOT NULL,
            amount REAL,
            unit TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        )
    `);

    await addColumnIfMissing("recipe_ingredients", "recipe_id", "INTEGER");
    await addColumnIfMissing("recipe_ingredients", "raw_text", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipe_ingredients", "food_name", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipe_ingredients", "amount", "REAL");
    await addColumnIfMissing("recipe_ingredients", "unit", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipe_ingredients", "sort_order", "INTEGER DEFAULT 0");
    await addColumnIfMissing("recipe_ingredients", "created_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipe_ingredients", "updated_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("recipe_ingredients", "food_item_id", "INTEGER");
    await addColumnIfMissing("recipe_ingredients", "canonical_key", "TEXT DEFAULT ''");

    await run(`
        CREATE TABLE IF NOT EXISTS food_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            canonical_key TEXT NOT NULL UNIQUE,
            calories_per_100g REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS food_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            food_item_id INTEGER NOT NULL,
            alias_name TEXT NOT NULL,
            alias_key TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(food_item_id, alias_key),
            FOREIGN KEY (food_item_id) REFERENCES food_items(id) ON DELETE CASCADE
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS meal_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity REAL,
            unit TEXT DEFAULT '',
            weight REAL,
            expiry_date TEXT DEFAULT '',
            storage_location TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS inventory_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            original_quantity REAL DEFAULT 0,
            unit_weight REAL DEFAULT 0,
            remaining_quantity REAL DEFAULT 0,
            remaining_weight REAL DEFAULT 0,
            expiry_date TEXT DEFAULT '',
            storage_location TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
        )
    `);

    // Robuste Migration: Falls die Tabelle aus einer früheren Inventar-Version bereits existiert,
    // ergänzt CREATE TABLE IF NOT EXISTS keine fehlenden Spalten. Deshalb sichern wir hier alle
    // Spalten ab, die die aktuelle Inventar-Logik benötigt.
    await addColumnIfMissing("inventory_items", "quantity", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_items", "unit", "TEXT DEFAULT 'g'");
    await addColumnIfMissing("inventory_items", "weight", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_items", "expiry_date", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "storage_location", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "notes", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "created_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "updated_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "source", "TEXT DEFAULT 'manual'");
    await addColumnIfMissing("inventory_items", "recipe_match_name", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_items", "calories_per_100g", "REAL");
    await addColumnIfMissing("inventory_items", "food_item_id", "INTEGER");
    await addColumnIfMissing("inventory_items", "canonical_name", "TEXT DEFAULT ''");

    await addColumnIfMissing("inventory_batches", "item_id", "INTEGER");
    await addColumnIfMissing("inventory_batches", "batch_type", "TEXT DEFAULT 'package'");
    await addColumnIfMissing("inventory_batches", "unit_label", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "measure_unit", "TEXT DEFAULT 'g'");
    await addColumnIfMissing("inventory_batches", "original_quantity", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_batches", "unit_weight", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_batches", "remaining_quantity", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_batches", "remaining_weight", "REAL DEFAULT 0");
    await addColumnIfMissing("inventory_batches", "expiry_date", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "storage_location", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "notes", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "created_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "updated_at", "TEXT DEFAULT ''");

    await backfillInventoryBatchDefaults();
    await migrateInventoryBatches();
    await migrateFoodItems();
    await syncAllRecipeIngredients();
}

function parseMealTypes(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeIngredientText(value) {
    return String(value || "")
        .replace(/^[-•*]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseFraction(value) {
    const text = String(value || "").trim().replace(",", ".");
    const fractionMap = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
    if (fractionMap[text] !== undefined) return fractionMap[text];
    if (/^\d+\/\d+$/.test(text)) {
        const [a, b] = text.split("/").map(Number);
        return b ? a / b : null;
    }
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
    const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + (Number(mixed[2]) / Number(mixed[3]));
    return null;
}

function normalizeIngredientUnit(unit) {
    const clean = String(unit || "").trim().toLowerCase().replace(".", "");
    const aliases = {
        g: "g", gr: "g", gramm: "g",
        kg: "kg", kilogramm: "kg",
        ml: "ml", milliliter: "ml",
        l: "l", liter: "l",
        stk: "Stk.", stück: "Stk.", stueck: "Stk.", ei: "Stk.", eier: "Stk.",
        dose: "Dose", dosen: "Dose",
        glas: "Glas", glaeser: "Glas", gläser: "Glas",
        packung: "Packung", packungen: "Packung", pkg: "Packung",
        el: "EL", esslöffel: "EL", essloeffel: "EL",
        tl: "TL", teelöffel: "TL", teeloeffel: "TL",
        prise: "Prise", prisen: "Prise"
    };
    return aliases[clean] || unit || "";
}

function unitForInventory(unit) {
    const normalized = normalizeIngredientUnit(unit);
    if (normalized === "kg" || normalized === "g") return "g";
    if (normalized === "l" || normalized === "ml") return "ml";
    return "Stk.";
}

function convertIngredientAmount(amount, unit) {
    if (amount === null || amount === undefined) return null;
    const normalized = normalizeIngredientUnit(unit);
    if (normalized === "kg" || normalized === "l") return amount * 1000;
    return amount;
}

const FOOD_BASE_ALIASES = new Map([
    ["thunfischstuecke", "thunfisch"], ["thunfischstucke", "thunfisch"], ["thunfischfilet", "thunfisch"], ["thunfischfilets", "thunfisch"], ["tunfisch", "thunfisch"],
    ["paprikaschote", "paprika"], ["paprikaschoten", "paprika"],
    ["kidneybohne", "kidneybohnen"], ["kidneybohnen", "kidneybohnen"], ["kidney", "kidney"],
    ["kichererbse", "kichererbsen"], ["kichererbsen", "kichererbsen"],
    ["tomate", "tomaten"], ["tomaten", "tomaten"],
    ["zwiebel", "zwiebeln"], ["zwiebeln", "zwiebeln"],
    ["fruehlingszwiebel", "fruehlingszwiebeln"], ["fruehlingszwiebeln", "fruehlingszwiebeln"], ["lauchzwiebel", "fruehlingszwiebeln"], ["lauchzwiebeln", "fruehlingszwiebeln"],
    ["ei", "eier"], ["eier", "eier"]
]);

const FOOD_VARIANT_ALIASES = new Map([
    ["rot", "rot"], ["rote", "rot"], ["roter", "rot"], ["rotes", "rot"], ["roten", "rot"],
    ["gelb", "gelb"], ["gelbe", "gelb"], ["gelber", "gelb"], ["gelbes", "gelb"], ["gelben", "gelb"],
    ["gruen", "gruen"], ["gruene", "gruen"], ["gruener", "gruen"], ["gruenes", "gruen"], ["gruenen", "gruen"], ["grun", "gruen"], ["grune", "gruen"],
    ["weiss", "weiss"], ["weisse", "weiss"], ["weisser", "weiss"], ["weisses", "weiss"], ["weissen", "weiss"],
    ["braun", "braun"], ["braune", "braun"], ["brauner", "braun"], ["braunes", "braun"],
    ["vollkorn", "vollkorn"], ["laktosefrei", "laktosefrei"], ["vegan", "vegan"], ["geraeuchert", "geraeuchert"], ["geraeucherte", "geraeuchert"], ["gerauechert", "geraeuchert"],
    ["tk", "tk"], ["tiefgekuehlt", "tk"], ["tiefgefroren", "tk"]
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

const UNIT_TOKEN_SET = new Set(["kg", "g", "gr", "gramm", "ml", "l", "liter", "stk", "stueck", "stuck", "dose", "dosen", "glas", "glaeser", "glaeser", "packung", "packungen", "pkg", "el", "tl", "prise", "prisen"]);
const FILLER_TOKEN_SET = new Set(["a", "à", "je", "pro", "ca", "circa", "etwa", "und", "oder", "mit", "in", "aus", "von", "fuer", "fur"]);

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
        .replace(/\b(?:in|mit)\s+(?:eigenem\s+saft|saft|wasser|oel|öl|lake|tomatensauce)\b/gi, " ")
        .replace(/\b(?:abgetropft|abtropfgewicht|netto|einwaage|fuellmenge|füllmenge|natur|naturell|frisch|frische|frischer|frisches|getrocknet|gekocht|vorgekocht|roh|gehackt|geschnitten|gewuerfelt|gewürfelt|gerieben|optional|ca|circa|etwa|nach\s+geschmack)\b/gi, " ")
        .replace(/[,;:/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function singularizeFoodToken(token) {
    let word = String(token || "").trim();
    if (!word || word.length <= 4) return word;
    if (FOOD_BASE_ALIASES.has(word)) return FOOD_BASE_ALIASES.get(word);
    if (word.endsWith("innen")) return word.slice(0, -5);
    if (word.endsWith("ungen")) return word.slice(0, -5);
    if (word.endsWith("en") && word.length > 5) return word.slice(0, -2);
    if (word.endsWith("er") && word.length > 5) return word.slice(0, -2);
    if (word.endsWith("n") && word.length > 5) return word.slice(0, -1);
    if (word.endsWith("e") && word.length > 5) return word.slice(0, -1);
    if (word.endsWith("s") && word.length > 5) return word.slice(0, -1);
    return word;
}

function titleCaseFoodToken(value) {
    const token = String(value || "").trim();
    if (!token) return "";
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
    if (displayMap[token]) return displayMap[token];
    return token.charAt(0).toUpperCase() + token.slice(1).replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü");
}

function buildFoodIdentity(value) {
    const raw = normalizeGermanText(removeIngredientDescriptors(value))
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const tokens = raw.split(" ").filter(Boolean).filter(token => {
        if (/^\d/.test(token)) return false;
        if (UNIT_TOKEN_SET.has(token)) return false;
        if (FILLER_TOKEN_SET.has(token)) return false;
        return token.length > 1;
    });

    const variants = [];
    const baseTokens = [];

    for (const token of tokens) {
        const variant = FOOD_VARIANT_ALIASES.get(token);
        if (variant) {
            if (!variants.includes(variant)) variants.push(variant);
            continue;
        }
        const base = FOOD_BASE_ALIASES.get(token) || FOOD_BASE_ALIASES.get(singularizeFoodToken(token)) || singularizeFoodToken(token);
        if (base && !baseTokens.includes(base)) baseTokens.push(base);
    }

    const baseKey = baseTokens.join("_");
    const variantKey = variants.sort().join("_");
    const canonicalKey = [baseKey, variantKey].filter(Boolean).join("__");
    const displayParts = [
        ...variants.map(variant => FOOD_VARIANT_DISPLAY[variant] || titleCaseFoodToken(variant)),
        ...baseTokens.map(titleCaseFoodToken)
    ].filter(Boolean);

    return {
        canonical_key: canonicalKey,
        display_name: displayParts.join(" ") || String(value || "").trim()
    };
}

function canonicalizeIngredientName(value) {
    return buildFoodIdentity(value).canonical_key;
}

function displayIngredientNameFromCanonical(value, fallback) {
    const identity = buildFoodIdentity(fallback || value);
    return identity.display_name || fallback || "";
}

function cleanIngredientName(value) {
    const unitPattern = "kg|g|gr|gramm|ml|l|liter|stk\\.?|stück|stueck|dose|dosen|glas|gläser|glaeser|packung|packungen|pkg|el|esslöffel|essloeffel|tl|teelöffel|teeloeffel|prise|prisen";
    const amountPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[,.]\\d+)?|[¼½¾⅓⅔])";

    const cleaned = String(value || "")
        .replace(/\([^)]*\)/g, " ")
        .replace(new RegExp(`\\b(?:a|à)\\s*${amountPattern}\\s*(${unitPattern})\\b`, "gi"), " ")
        .replace(new RegExp(`(^|[\\s,(])${amountPattern}\\s*(${unitPattern})\\b`, "gi"), " ")
        .replace(new RegExp(`(^|[\\s,(])(${unitPattern})\\s*${amountPattern}\\b`, "gi"), " ")
        .replace(/(^|\s)(?:a|à|je|pro)(?=\s|$)/gi, " ");

    const identity = buildFoodIdentity(cleaned);
    return identity.display_name || removeIngredientDescriptors(cleaned);
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
    const amountPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[,.]\\d+)?|[¼½¾⅓⅔])";
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
        // Bei mehreren Gewichtsangaben ist z.B. bei Thunfisch oft das Abtropfgewicht maßgeblich.
        // Sonst nehmen wir die erste echte Gewichts-/Volumenangabe und lassen Packungsangaben nur als Multiplikator wirken.
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
        if (amount !== null && amount !== undefined && amountUnit.multiplier) amount *= amountUnit.multiplier;
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
        .map(parseIngredientLine)
        .filter(Boolean);
}

async function syncRecipeIngredients(recipeId, ingredientsText) {
    await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [recipeId]);
    const parsedIngredients = parseIngredientsText(ingredientsText);

    for (const [index, ingredient] of parsedIngredients.entries()) {
        const foodItem = await getOrCreateFoodItem(ingredient.food_name, { aliasName: ingredient.raw_text });
        await run(
            `INSERT INTO recipe_ingredients (recipe_id, raw_text, food_name, amount, unit, sort_order, updated_at, food_item_id, canonical_key)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
            [recipeId, ingredient.raw_text, foodItem.display_name || ingredient.food_name, ingredient.amount, ingredient.unit, index, foodItem.id, foodItem.canonical_key]
        );

        const existing = await findInventoryItemByName(foodItem.display_name || ingredient.food_name);
        if (!existing) {
            await run(
                `INSERT INTO inventory_items (name, quantity, unit, weight, expiry_date, storage_location, notes, source, recipe_match_name, calories_per_100g, food_item_id, canonical_name)
                 VALUES (?, 0, ?, 0, '', '', '', 'recipe', ?, NULL, ?, ?)`,
                [foodItem.display_name || ingredient.food_name, ingredient.unit || "g", foodItem.display_name || ingredient.food_name, foodItem.id, foodItem.canonical_key]
            );
        } else {
            await run(
                `UPDATE inventory_items
                 SET recipe_match_name = COALESCE(NULLIF(recipe_match_name, ''), ?),
                     source = CASE WHEN source = '' OR source IS NULL THEN 'recipe' ELSE source END,
                     food_item_id = COALESCE(food_item_id, ?),
                     canonical_name = COALESCE(NULLIF(canonical_name, ''), ?),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [foodItem.display_name || ingredient.food_name, foodItem.id, foodItem.canonical_key, existing.id]
            );
        }
    }
}

async function syncAllRecipeIngredients() {
    const recipes = await all(`SELECT id, ingredients FROM recipes`);
    for (const recipe of recipes) {
        await syncRecipeIngredients(recipe.id, recipe.ingredients || "");
    }
}


function normalizeComparableName(value) {
    return canonicalizeIngredientName(value);
}

function singularizeComparableName(value) {
    let text = normalizeComparableName(value);
    if (text.length <= 3) return text;
    text = text.replace(/\b(\w+)(chen|lein)\b/g, "$1$2");
    text = text.replace(/\b(\w+?)(innen|ungen|keiten|heiten)\b/g, "$1");
    text = text.replace(/\b(\w+?)(en|er|n|e|s)\b/g, (match, stem) => stem.length >= 3 ? stem : match);
    return text.replace(/\s+/g, " ").trim();
}

function getComparableNameVariants(value) {
    const normalized = normalizeComparableName(value);
    const singular = singularizeComparableName(normalized);
    return Array.from(new Set([normalized, singular].filter(Boolean)));
}

function comparableNamesMatch(a, b) {
    const aVariants = getComparableNameVariants(a);
    const bVariants = getComparableNameVariants(b);
    if (!aVariants.length || !bVariants.length) return false;
    if (aVariants.some(value => bVariants.includes(value))) return true;

    return aVariants.some(av => bVariants.some(bv => {
        if (av.length < 3 || bv.length < 3) return false;
        const aTokens = av.split(" ").filter(token => token.length >= 3);
        const bTokens = bv.split(" ").filter(token => token.length >= 3);
        if (!aTokens.length || !bTokens.length) return false;
        return aTokens.every(token => bTokens.includes(token)) || bTokens.every(token => aTokens.includes(token));
    }));
}

function improveIngredientNameWithKnownItems(parsedIngredient, inventoryItems) {
    if (!parsedIngredient) return parsedIngredient;
    const rawComparable = normalizeComparableName(parsedIngredient.raw_text);
    const parsedComparable = normalizeComparableName(parsedIngredient.food_name);

    const candidates = inventoryItems
        .flatMap(item => [item.name, item.recipe_match_name].filter(Boolean).map(name => ({ item, name })))
        .filter(candidate => {
            const candidateComparable = normalizeComparableName(candidate.name);
            if (!candidateComparable || candidateComparable.length < 3) return false;
            return comparableNamesMatch(parsedComparable, candidateComparable)
                || rawComparable.includes(candidateComparable)
                || candidateComparable.includes(parsedComparable);
        })
        .sort((a, b) => normalizeComparableName(b.name).length - normalizeComparableName(a.name).length);

    if (!candidates.length) return parsedIngredient;
    return { ...parsedIngredient, food_name: candidates[0].item.name, matched_item_id: candidates[0].item.id };
}

function convertAmountForDisplay(amount, originalUnit, inventoryUnit) {
    if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
    const unit = normalizeIngredientUnit(originalUnit || inventoryUnit);
    if (unit === "kg" || unit === "l") return Number(amount) / 1000;
    return Number(amount);
}

function scaleIngredientLineForPortions(rawLine, factor) {
    if (factor === 1) return rawLine;
    const text = String(rawLine || "");
    const amountUnit = findAmountUnitInIngredient(text);
    if (!amountUnit) return text;

    const amount = parseFraction(amountUnit.amountText);
    if (amount === null || amount === undefined) return text;

    const scaled = Math.round(amount * factor * 100) / 100;
    const scaledText = String(scaled).replace(".", ",");
    return `${text.slice(0, amountUnit.start)}${scaledText}${text.slice(amountUnit.start + amountUnit.amountText.length)}`;
}

function getInventoryStockBreakdown(item) {
    const batches = Array.isArray(item?.batches) ? item.batches : [];

    return batches.reduce((result, batch) => {
        const batchUnit = unitForInventory(batch.measure_unit || item.unit || "g");
        const remainingQuantity = Math.max(0, Number(batch.remaining_quantity || 0));
        const remainingWeight = Math.max(0, Number(batch.remaining_weight || 0));

        if (batch.batch_type === "package") {
            result.packageCount += remainingQuantity;
        }

        if (batchUnit === "g") {
            result.g += remainingWeight;
        } else if (batchUnit === "ml") {
            result.ml += remainingWeight;
        } else if (batchUnit === "Stk.") {
            if (batch.batch_type === "package") {
                result.stk += remainingQuantity;
            } else {
                result.stk += remainingWeight;
            }
        }

        return result;
    }, { g: 0, ml: 0, stk: 0, packageCount: 0 });
}

function isContainerUnit(unit) {
    const normalized = normalizeIngredientUnit(unit);
    return ["Dose", "Glas", "Packung", "Stk."].includes(normalized);
}

function getInventoryAvailableAmountForUnit(item, requestedUnit) {
    if (!item) return 0;
    const inventoryUnit = unitForInventory(requestedUnit || item.unit || "g");
    const stock = getInventoryStockBreakdown(item);

    if (inventoryUnit === "g") return stock.g;
    if (inventoryUnit === "ml") return stock.ml;
    if (inventoryUnit === "Stk.") return stock.stk || stock.packageCount;
    return 0;
}

function compareRecipeIngredientWithStock(item, ingredient, required) {
    if (!item) {
        return { available: 0, status: "missing", note: "Kein passendes Lebensmittel im Inventar" };
    }

    const requestedUnit = ingredient?.unit || item.unit || "g";
    const inventoryUnit = unitForInventory(requestedUnit);
    const originalUnit = normalizeIngredientUnit(ingredient?.original_unit || requestedUnit);
    const stock = getInventoryStockBreakdown(item);
    const available = getInventoryAvailableAmountForUnit(item, requestedUnit);
    const hasAnyStock = stock.g > 0 || stock.ml > 0 || stock.stk > 0 || stock.packageCount > 0;

    if (!hasAnyStock) {
        return { available: 0, status: "missing", note: "Bestand ist 0" };
    }

    if (required === null || required === undefined || !Number.isFinite(Number(required)) || Number(required) <= 0) {
        return { available, status: "available", note: "Lebensmittel ist im Bestand" };
    }

    if (inventoryUnit === "Stk." && isContainerUnit(originalUnit)) {
        const countAvailable = stock.stk || stock.packageCount;
        if (countAvailable >= Number(required)) {
            return { available: countAvailable, status: "available", note: "Benötigte Einheit ist vorhanden" };
        }
        if (countAvailable > 0) {
            return { available: countAvailable, status: "partial", note: "Nur ein Teil der benötigten Einheiten ist vorhanden" };
        }

        // Beispiel: Rezept verlangt „1 Dose Thunfisch“, Inventar enthält aber nur eine freie/gewichtete Menge
        // desselben Lebensmittels. Das ist nicht exakt vergleichbar, aber definitiv nicht „Bestand 0“.
        return { available: 0, status: "partial", note: "Lebensmittel vorhanden, Einheit/Menge aber nicht exakt vergleichbar" };
    }

    if (available >= Number(required)) {
        return { available, status: "available", note: "Benötigte Menge ist vorhanden" };
    }

    if (available > 0) {
        return { available, status: "partial", note: "Nur ein Teil der benötigten Menge ist vorhanden" };
    }

    // Auch hier gilt: Wenn das Lebensmittel vorhanden ist, aber nur in einer anderen Mengeneinheit,
    // zeigen wir gelb statt rot. Rot ist strikt für echten Leerbestand reserviert.
    return { available, status: "partial", note: "Lebensmittel vorhanden, aber nicht in der benötigten Einheit" };
}

function findInventoryItemForIngredient(parsedIngredient, inventoryItems) {
    if (!parsedIngredient) return null;
    if (parsedIngredient.matched_item_id) {
        const byId = inventoryItems.find(item => Number(item.id) === Number(parsedIngredient.matched_item_id));
        if (byId) return byId;
    }

    return inventoryItems.find(item => comparableNamesMatch(parsedIngredient.food_name, item.name)
        || comparableNamesMatch(parsedIngredient.food_name, item.recipe_match_name || "")) || null;
}

function buildRecipeStockEntry(parsedIngredient, inventoryItems, factor) {
    const improved = improveIngredientNameWithKnownItems(parsedIngredient, inventoryItems);
    const item = findInventoryItemForIngredient(improved, inventoryItems);
    const requiredBase = improved?.amount;
    const required = requiredBase !== null && requiredBase !== undefined && Number.isFinite(Number(requiredBase))
        ? Number(requiredBase) * factor
        : null;
    const requestedUnit = improved?.unit || item?.unit || "g";
    const comparison = compareRecipeIngredientWithStock(item, improved, required);

    return {
        raw_text: improved?.raw_text || "",
        display_text: scaleIngredientLineForPortions(improved?.raw_text || "", factor),
        food_name: improved?.food_name || "",
        item_id: item?.id || null,
        required_amount: required,
        required_unit: requestedUnit,
        available_amount: comparison.available,
        status: comparison.status,
        label: comparison.status === "available" ? "Vorhanden" : comparison.status === "partial" ? "Teilweise vorhanden" : "Nicht vorhanden",
        note: comparison.note
    };
}


async function getAllInventoryItemsWithBatches() {
    const inventoryRows = await all(`SELECT * FROM inventory_items ORDER BY name COLLATE NOCASE ASC`);
    const inventoryItems = [];
    for (const row of inventoryRows) {
        const batches = await getInventoryBatches(row.id);
        inventoryItems.push(normalizeInventoryRow(row, batches));
    }
    return inventoryItems;
}

function ingredientMatchesName(ingredientName, searchName) {
    return comparableNamesMatch(ingredientName, searchName)
        || normalizeComparableName(ingredientName).includes(normalizeComparableName(searchName))
        || normalizeComparableName(searchName).includes(normalizeComparableName(ingredientName));
}

function normalizeRecipeRow(recipe) {
    return {
        id: recipe.id,
        name: recipe.name,
        calories: Number(recipe.calories) || 0,
        portions: recipe.portions ?? null,
        mealTypes: parseMealTypes(recipe.mealTypes),
        ingredients: recipe.ingredients || "",
        instructions: recipe.instructions || "",
        is_favorite: Number(recipe.is_favorite) === 1 ? 1 : 0
    };
}

function normalizePlanRow(plan) {
    let data = [];
    try { data = JSON.parse(plan.data || "[]"); } catch { data = []; }
    return { id: plan.id, name: plan.name, data };
}


function normalizeFoodItemRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        display_name: row.display_name,
        canonical_key: row.canonical_key,
        calories_per_100g: row.calories_per_100g === null || row.calories_per_100g === undefined ? null : Number(row.calories_per_100g)
    };
}

async function addFoodAlias(foodItemId, aliasName) {
    const alias = normalizeName(aliasName);
    if (!foodItemId || !alias) return;
    const aliasKey = buildFoodIdentity(alias).canonical_key || canonicalizeIngredientName(alias);
    if (!aliasKey) return;
    await run(
        `INSERT OR IGNORE INTO food_aliases (food_item_id, alias_name, alias_key) VALUES (?, ?, ?)`,
        [foodItemId, alias, aliasKey]
    );
}

async function getOrCreateFoodItem(name, { calories_per_100g = null, aliasName = "" } = {}) {
    const identity = buildFoodIdentity(name);
    const canonicalKey = identity.canonical_key || canonicalizeIngredientName(name);
    const displayName = identity.display_name || normalizeName(name);
    if (!canonicalKey || !displayName) throw new Error("Lebensmittel konnte nicht normalisiert werden.");

    let foodItem = await get(`SELECT * FROM food_items WHERE canonical_key = ? LIMIT 1`, [canonicalKey]);
    if (!foodItem) {
        const result = await run(
            `INSERT INTO food_items (display_name, canonical_key, calories_per_100g) VALUES (?, ?, ?)`,
            [displayName, canonicalKey, calories_per_100g]
        );
        foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [result.lastID]);
    } else if ((foodItem.calories_per_100g === null || foodItem.calories_per_100g === undefined) && calories_per_100g !== null && calories_per_100g !== undefined) {
        await run(`UPDATE food_items SET calories_per_100g = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [calories_per_100g, foodItem.id]);
        foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItem.id]);
    }

    await addFoodAlias(foodItem.id, displayName);
    await addFoodAlias(foodItem.id, name);
    if (aliasName) await addFoodAlias(foodItem.id, aliasName);
    return foodItem;
}

async function findFoodItemByName(name) {
    const identity = buildFoodIdentity(name);
    if (!identity.canonical_key) return null;
    const direct = await get(`SELECT * FROM food_items WHERE canonical_key = ? LIMIT 1`, [identity.canonical_key]);
    if (direct) return direct;
    const alias = await get(
        `SELECT fi.* FROM food_aliases fa JOIN food_items fi ON fi.id = fa.food_item_id WHERE fa.alias_key = ? LIMIT 1`,
        [identity.canonical_key]
    );
    return alias || null;
}

async function migrateFoodItems() {
    const inventoryRows = await all(`SELECT * FROM inventory_items`);
    for (const row of inventoryRows) {
        const foodItem = await getOrCreateFoodItem(row.name, { calories_per_100g: row.calories_per_100g });
        await run(
            `UPDATE inventory_items SET food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [foodItem.id, foodItem.canonical_key, row.id]
        );
        if (row.recipe_match_name) await addFoodAlias(foodItem.id, row.recipe_match_name);
    }
}

function normalizeInventoryBatchRow(batch) {
    return {
        id: batch.id,
        item_id: batch.item_id,
        batch_type: batch.batch_type || "package",
        unit_label: batch.unit_label || "",
        measure_unit: batch.measure_unit || "g",
        original_quantity: Number(batch.original_quantity ?? 0),
        unit_weight: Number(batch.unit_weight ?? 0),
        remaining_quantity: Number(batch.remaining_quantity ?? 0),
        remaining_weight: Number(batch.remaining_weight ?? 0),
        expiry_date: batch.expiry_date || "",
        storage_location: batch.storage_location || "",
        notes: batch.notes || "",
        created_at: batch.created_at || "",
        updated_at: batch.updated_at || ""
    };
}

function normalizeInventoryRow(item, batches = []) {
    return {
        id: item.id,
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit || "g",
        weight: item.weight ?? null,
        expiry_date: item.expiry_date || "",
        storage_location: item.storage_location || "",
        notes: item.notes || "",
        calories_per_100g: item.calories_per_100g === null || item.calories_per_100g === undefined ? null : Number(item.calories_per_100g),
        food_item_id: item.food_item_id ?? null,
        canonical_name: item.canonical_name || buildFoodIdentity(item.name).canonical_key || "",
        batches: batches.map(normalizeInventoryBatchRow),
        created_at: item.created_at || "",
        updated_at: item.updated_at || ""
    };
}

function normalizeName(name) {
    return String(name || "").trim();
}

function validateInventoryPayload(payload) {
    const name = normalizeName(payload.name);
    if (!name) return { error: "Bezeichnung ist erforderlich." };
    const caloriesValue = payload.calories_per_100g === "" || payload.calories_per_100g === null || payload.calories_per_100g === undefined ? null : Number(payload.calories_per_100g);
    if (caloriesValue !== null && (!Number.isFinite(caloriesValue) || caloriesValue < 0)) return { error: "kcal / 100 g muss eine Zahl größer oder gleich 0 sein." };
    return {
        value: {
            name,
            unit: typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim() : "g",
            notes: typeof payload.notes === "string" ? payload.notes.trim() : "",
            calories_per_100g: caloriesValue
        }
    };
}

function calculateUnitWeight(quantity, weight) {
    const q = Number(quantity ?? 0);
    const w = Number(weight ?? 0);
    if (!Number.isFinite(q) || !Number.isFinite(w) || q <= 0 || w <= 0) return 0;
    return w / q;
}

function normalizeMeasureUnit(value) {
    const unit = String(value || "g").trim();
    return unit || "g";
}

function normalizeUnitLabel(value) {
    return String(value || "").trim();
}

async function getInventoryBatches(itemId, { activeOnly = false } = {}) {
    const where = activeOnly ? "AND (remaining_quantity > 0 OR remaining_weight > 0)" : "";
    return all(
        `SELECT * FROM inventory_batches
         WHERE item_id = ? ${where}
         ORDER BY
            CASE WHEN expiry_date = '' THEN 1 ELSE 0 END,
            expiry_date ASC,
            id ASC`,
        [itemId]
    );
}

async function recalculateInventoryItem(itemId) {
    const summary = await get(
        `SELECT
            COALESCE(SUM(remaining_quantity), 0) AS quantity,
            COALESCE(SUM(remaining_weight), 0) AS weight,
            MIN(NULLIF(expiry_date, '')) AS next_expiry
         FROM inventory_batches
         WHERE item_id = ?`,
        [itemId]
    );
    const locationRow = await get(
        `SELECT storage_location
         FROM inventory_batches
         WHERE item_id = ? AND storage_location <> '' AND (remaining_quantity > 0 OR remaining_weight > 0)
         ORDER BY
            CASE WHEN expiry_date = '' THEN 1 ELSE 0 END,
            expiry_date ASC,
            id ASC
         LIMIT 1`,
        [itemId]
    );
    await run(
        `UPDATE inventory_items
         SET quantity = ?, weight = ?, expiry_date = COALESCE(?, ''), storage_location = COALESCE(?, storage_location), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [summary.quantity || 0, summary.weight || 0, summary.next_expiry || "", locationRow?.storage_location || null, itemId]
    );
}

async function findInventoryItemByName(name) {
    const cleanName = normalizeName(name);
    const foodItem = await findFoodItemByName(cleanName);
    if (foodItem) {
        const byFoodItem = await get(`SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`, [foodItem.id]);
        if (byFoodItem) return byFoodItem;
    }
    const identity = buildFoodIdentity(cleanName);
    const byCanonical = identity.canonical_key
        ? await get(`SELECT * FROM inventory_items WHERE canonical_name = ? ORDER BY id ASC LIMIT 1`, [identity.canonical_key])
        : null;
    if (byCanonical) return byCanonical;
    return get(`SELECT * FROM inventory_items WHERE lower(name) = lower(?) LIMIT 1`, [cleanName]);
}

async function getOrCreateInventoryItem({ name, unit = "g", notes = "", calories_per_100g = null }) {
    const cleanName = normalizeName(name);
    const foodItem = await getOrCreateFoodItem(cleanName, { calories_per_100g });
    let item = await findInventoryItemByName(cleanName);
    if (item) {
        if ((item.calories_per_100g === null || item.calories_per_100g === undefined) && calories_per_100g !== null && calories_per_100g !== undefined) {
            await run(`UPDATE inventory_items SET calories_per_100g = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [calories_per_100g, item.id]);
        }
        await run(`UPDATE inventory_items SET food_item_id = COALESCE(food_item_id, ?), canonical_name = COALESCE(NULLIF(canonical_name, ''), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [foodItem.id, foodItem.canonical_key, item.id]);
        return get(`SELECT * FROM inventory_items WHERE id = ?`, [item.id]);
    }
    const result = await run(
        `INSERT INTO inventory_items (name, quantity, unit, weight, expiry_date, storage_location, notes, calories_per_100g, food_item_id, canonical_name)
         VALUES (?, 0, ?, 0, '', '', ?, ?, ?, ?)`,
        [foodItem.display_name || cleanName, unit || "g", notes || "", calories_per_100g, foodItem.id, foodItem.canonical_key]
    );
    return get(`SELECT * FROM inventory_items WHERE id = ?`, [result.lastID]);
}

async function createInventoryPackageUnits(itemId, { count, unitLabel, unitWeight, measureUnit, expiry_date = "", storage_location = "", notes = "" }) {
    const safeCount = Math.max(0, Math.floor(Number(count ?? 0)));
    const safeUnitWeight = Math.max(0, Number(unitWeight ?? 0));
    if (safeCount <= 0) throw new Error("Anzahl der Packungseinheiten muss größer 0 sein.");
    if (safeUnitWeight <= 0) throw new Error("Inhalt je Packungseinheit muss größer 0 sein.");
    for (let i = 0; i < safeCount; i += 1) {
        await run(
            `INSERT INTO inventory_batches
             (item_id, batch_type, unit_label, measure_unit, original_quantity, unit_weight, remaining_quantity, remaining_weight, expiry_date, storage_location, notes)
             VALUES (?, 'package', ?, ?, 1, ?, 1, ?, ?, ?, ?)`,
            [itemId, normalizeUnitLabel(unitLabel), normalizeMeasureUnit(measureUnit), safeUnitWeight, safeUnitWeight, expiry_date, storage_location, notes]
        );
    }
    await recalculateInventoryItem(itemId);
}

async function createInventoryLooseAmount(itemId, { amount, measureUnit, expiry_date = "", storage_location = "", notes = "" }) {
    const safeAmount = Math.max(0, Number(amount ?? 0));
    if (safeAmount <= 0) throw new Error("Freie Menge muss größer 0 sein.");
    const existingLoose = await get(
        `SELECT * FROM inventory_batches
         WHERE item_id = ? AND batch_type = 'loose' AND measure_unit = ? AND expiry_date = ? AND storage_location = ?
         LIMIT 1`,
        [itemId, normalizeMeasureUnit(measureUnit), expiry_date || "", storage_location || ""]
    );
    if (existingLoose) {
        await run(
            `UPDATE inventory_batches
             SET remaining_weight = remaining_weight + ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [safeAmount, notes || existingLoose.notes || "", existingLoose.id]
        );
    } else {
        await run(
            `INSERT INTO inventory_batches
             (item_id, batch_type, unit_label, measure_unit, original_quantity, unit_weight, remaining_quantity, remaining_weight, expiry_date, storage_location, notes)
             VALUES (?, 'loose', 'lose', ?, 0, 0, 0, ?, ?, ?, ?)`,
            [itemId, normalizeMeasureUnit(measureUnit), safeAmount, expiry_date, storage_location, notes]
        );
    }
    await recalculateInventoryItem(itemId);
}

async function backfillInventoryBatchDefaults() {
    // Repariert Datensätze aus Zwischenständen, in denen neue Spalten zwar ergänzt wurden,
    // aber alte Zeilen noch NULL-Werte enthalten.
    await run(`UPDATE inventory_items SET quantity = COALESCE(quantity, 0), unit = COALESCE(NULLIF(unit, ''), 'g'), weight = COALESCE(weight, 0), expiry_date = COALESCE(expiry_date, ''), storage_location = COALESCE(storage_location, ''), notes = COALESCE(notes, '')`);
    await run(`UPDATE inventory_batches SET batch_type = COALESCE(NULLIF(batch_type, ''), 'package'), unit_label = COALESCE(unit_label, ''), measure_unit = COALESCE(NULLIF(measure_unit, ''), 'g'), original_quantity = COALESCE(original_quantity, 0), unit_weight = COALESCE(unit_weight, 0), remaining_quantity = COALESCE(remaining_quantity, 0), remaining_weight = COALESCE(remaining_weight, 0), expiry_date = COALESCE(expiry_date, ''), storage_location = COALESCE(storage_location, ''), notes = COALESCE(notes, '')`);
}

async function migrateInventoryBatches() {
    const items = await all(`SELECT * FROM inventory_items`);
    for (const item of items) {
        const existingBatch = await get(`SELECT id FROM inventory_batches WHERE item_id = ? LIMIT 1`, [item.id]);
        if (existingBatch) continue;
        const quantity = Number(item.quantity ?? 0);
        const weight = Number(item.weight ?? 0);
        if (quantity <= 0 && weight <= 0) continue;
        if (quantity > 0 && weight > 0) {
            await createInventoryPackageUnits(item.id, {
                count: Math.floor(quantity),
                unitLabel: item.unit || "Einheit",
                unitWeight: weight / quantity,
                measureUnit: "g",
                expiry_date: item.expiry_date || "",
                storage_location: item.storage_location || "",
                notes: "Aus bestehendem Bestand übernommen"
            });
        } else if (weight > 0) {
            await createInventoryLooseAmount(item.id, {
                amount: weight,
                measureUnit: item.unit || "g",
                expiry_date: item.expiry_date || "",
                storage_location: item.storage_location || "",
                notes: "Aus bestehendem Bestand übernommen"
            });
        }
    }
}

function toPositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateRecipePayload(payload, { allowEmptyPortions = false } = {}) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const calories = toPositiveInteger(payload.calories);
    const portions = payload.portions === "" || payload.portions === null || payload.portions === undefined
        ? null
        : toPositiveInteger(payload.portions);
    const mealTypes = Array.isArray(payload.mealTypes) ? payload.mealTypes : [];

    if (!name) return { error: "Name ist erforderlich." };
    if (!calories) return { error: "Kalorien müssen als ganze Zahl größer 0 angegeben werden." };
    if (!allowEmptyPortions && !portions) return { error: "Portionen müssen als ganze Zahl größer 0 angegeben werden." };
    if (mealTypes.length === 0 && payload.mealTypes !== undefined) return { error: "Mindestens eine Mahlzeit muss ausgewählt werden." };

    return {
        value: {
            name,
            calories,
            portions,
            mealTypes,
            ingredients: typeof payload.ingredients === "string" ? payload.ingredients : "",
            instructions: typeof payload.instructions === "string" ? payload.instructions : "",
            is_favorite: Number(payload.is_favorite) === 1 ? 1 : 0
        }
    };
}

app.get("/", (req, res) => res.json({ status: "ok", service: "Food Calculator API" }));

app.get("/check-db", async (req, res) => {
    try {
        const recipes = await all(`PRAGMA table_info(recipes)`);
        const recipeIngredients = await all(`PRAGMA table_info(recipe_ingredients)`);
        const mealPlans = await all(`PRAGMA table_info(meal_plans)`);
        const inventoryItems = await all(`PRAGMA table_info(inventory_items)`);
        const inventoryBatches = await all(`PRAGMA table_info(inventory_batches)`);
        res.json({ recipes, recipeIngredients, mealPlans, inventoryItems, inventoryBatches });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/recipes", async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC`);
        res.json(rows.map(normalizeRecipeRow));
    } catch (error) {
        console.error("Fehler bei GET /recipes:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Rezepte" });
    }
});

app.get("/recipes/:id", async (req, res) => {
    try {
        const row = await get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: "Rezept nicht gefunden" });
        res.json(normalizeRecipeRow(row));
    } catch (error) {
        console.error("Fehler bei GET /recipes/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Rezepts" });
    }
});

app.post("/recipes", async (req, res) => {
    try {
        const validation = validateRecipePayload(req.body);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const recipe = validation.value;

        const result = await run(
            `INSERT INTO recipes (name, calories, portions, mealTypes, ingredients, instructions, is_favorite)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                recipe.name,
                recipe.calories,
                recipe.portions,
                JSON.stringify(recipe.mealTypes),
                recipe.ingredients,
                recipe.instructions,
                recipe.is_favorite
            ]
        );

        const created = await get(`SELECT * FROM recipes WHERE id = ?`, [result.lastID]);
        await syncRecipeIngredients(created.id, created.ingredients || "");
        res.status(201).json(normalizeRecipeRow(created));
    } catch (error) {
        console.error("Fehler bei POST /recipes:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Rezepts" });
    }
});

app.put("/recipes/:id", async (req, res) => {
    try {
        const current = await get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);
        if (!current) return res.status(404).json({ error: "Rezept nicht gefunden" });

        const validation = validateRecipePayload({
            ...req.body,
            mealTypes: req.body.mealTypes ?? parseMealTypes(current.mealTypes)
        }, { allowEmptyPortions: true });
        if (validation.error) return res.status(400).json({ error: validation.error });
        const recipe = validation.value;

        const favoriteValue = req.body.is_favorite === undefined
            ? Number(current.is_favorite) || 0
            : recipe.is_favorite;

        await run(
            `UPDATE recipes
             SET name = ?, calories = ?, portions = ?, mealTypes = ?, ingredients = ?, instructions = ?, is_favorite = ?
             WHERE id = ?`,
            [
                recipe.name,
                recipe.calories,
                recipe.portions,
                JSON.stringify(recipe.mealTypes),
                recipe.ingredients,
                recipe.instructions,
                favoriteValue,
                req.params.id
            ]
        );

        const updated = await get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);
        await syncRecipeIngredients(updated.id, updated.ingredients || "");
        res.json(normalizeRecipeRow(updated));
    } catch (error) {
        console.error("Fehler bei PUT /recipes/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Rezepts" });
    }
});

app.patch("/recipes/:id/favorite", async (req, res) => {
    try {
        const favoriteValue = Number(req.body.is_favorite) === 1 ? 1 : 0;
        const result = await run(
            `UPDATE recipes SET is_favorite = ? WHERE id = ?`,
            [favoriteValue, req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: "Rezept nicht gefunden" });
        res.json({ id: Number(req.params.id), is_favorite: favoriteValue });
    } catch (error) {
        console.error("Fehler bei PATCH /recipes/:id/favorite:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Favoritenstatus" });
    }
});

app.delete("/recipes/:id", async (req, res) => {
    try {
        await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [req.params.id]);
        const result = await run(`DELETE FROM recipes WHERE id = ?`, [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Rezept nicht gefunden" });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /recipes/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Rezepts" });
    }
});

app.get("/meal_plans", async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM meal_plans ORDER BY id DESC`);
        res.json(rows.map(normalizePlanRow));
    } catch (error) {
        console.error("Fehler bei GET /meal_plans:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Wochenpläne" });
    }
});

app.get("/meal_plans/:id", async (req, res) => {
    try {
        const row = await get(`SELECT * FROM meal_plans WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        res.json(normalizePlanRow(row));
    } catch (error) {
        console.error("Fehler bei GET /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Wochenplans" });
    }
});

app.post("/meal_plans", async (req, res) => {
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const data = Array.isArray(req.body.data) ? req.body.data : null;
        if (!name || !data) return res.status(400).json({ error: "Name und Daten sind erforderlich." });

        const result = await run(`INSERT INTO meal_plans (name, data) VALUES (?, ?)`, [name, JSON.stringify(data)]);
        const created = await get(`SELECT * FROM meal_plans WHERE id = ?`, [result.lastID]);
        res.status(201).json(normalizePlanRow(created));
    } catch (error) {
        console.error("Fehler bei POST /meal_plans:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Wochenplans" });
    }
});

app.put("/meal_plans/:id", async (req, res) => {
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const data = Array.isArray(req.body.data) ? req.body.data : null;
        if (!name || !data) return res.status(400).json({ error: "Name und Daten sind erforderlich." });

        const result = await run(`UPDATE meal_plans SET name = ?, data = ? WHERE id = ?`, [name, JSON.stringify(data), req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        const updated = await get(`SELECT * FROM meal_plans WHERE id = ?`, [req.params.id]);
        res.json(normalizePlanRow(updated));
    } catch (error) {
        console.error("Fehler bei PUT /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Wochenplans" });
    }
});

app.delete("/meal_plans/:id", async (req, res) => {
    try {
        const result = await run(`DELETE FROM meal_plans WHERE id = ?`, [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Wochenplans" });
    }
});



function getInventoryStockTotal(item) {
    const batches = Array.isArray(item?.batches) ? item.batches : [];
    const batchTotal = batches.reduce((sum, batch) => {
        const remainingQuantity = Number(batch.remaining_quantity ?? 0);
        const remainingWeight = Number(batch.remaining_weight ?? 0);
        return sum + Math.max(0, remainingQuantity) + Math.max(0, remainingWeight);
    }, 0);
    const legacyTotal = Math.max(0, Number(item?.quantity ?? 0)) + Math.max(0, Number(item?.weight ?? 0));
    return batchTotal + legacyTotal;
}

function isInventoryItemProtected(item, recipeUsageByCanonical) {
    const canonical = item?.canonical_name || buildFoodIdentity(item?.name).canonical_key || "";
    return getInventoryStockTotal(item) > 0 || String(item?.source || "manual") !== "recipe" || Boolean(recipeUsageByCanonical.get(canonical));
}

async function buildInventoryCleanupPreview() {
    const inventoryItems = await getAllInventoryItemsWithBatches();
    const recipeIngredientRows = await all(`
        SELECT ri.*, r.name AS recipe_name
        FROM recipe_ingredients ri
        LEFT JOIN recipes r ON r.id = ri.recipe_id
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC
    `);

    const recipeUsageByCanonical = new Map();
    for (const row of recipeIngredientRows) {
        const canonical = row.canonical_key || buildFoodIdentity(row.food_name || row.raw_text).canonical_key || "";
        if (!canonical) continue;
        if (!recipeUsageByCanonical.has(canonical)) recipeUsageByCanonical.set(canonical, []);
        recipeUsageByCanonical.get(canonical).push({
            recipe_id: row.recipe_id,
            recipe_name: row.recipe_name || "Unbenanntes Rezept",
            raw_text: row.raw_text || "",
            food_name: row.food_name || ""
        });
    }

    const enrichedItems = inventoryItems.map(item => {
        const canonical = item.canonical_name || buildFoodIdentity(item.name).canonical_key || "";
        const stockTotal = getInventoryStockTotal(item);
        const usedInRecipes = recipeUsageByCanonical.get(canonical) || [];
        const source = String(item.source || "manual");
        return {
            id: item.id,
            name: item.name,
            canonical_name: canonical,
            source,
            stock_total: stockTotal,
            has_stock: stockTotal > 0,
            used_in_recipes: usedInRecipes,
            is_protected: stockTotal > 0 || source !== "recipe" || usedInRecipes.length > 0
        };
    });

    const groups = new Map();
    for (const item of enrichedItems) {
        const key = item.canonical_name || buildFoodIdentity(item.name).canonical_key || item.name;
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }

    const possibleDuplicates = Array.from(groups.entries())
        .filter(([, items]) => items.length > 1)
        .map(([canonical_key, items]) => {
            const preferred = [...items].sort((a, b) => {
                if (a.has_stock !== b.has_stock) return a.has_stock ? -1 : 1;
                if (a.source !== b.source) return a.source === "manual" ? -1 : 1;
                return String(a.name || "").length - String(b.name || "").length;
            })[0];
            return {
                canonical_key,
                suggested_master: preferred,
                candidates: items
            };
        });

    const orphanRecipeItems = enrichedItems.filter(item =>
        item.source === "recipe" && !item.has_stock && item.used_in_recipes.length === 0
    );

    const protectedItems = enrichedItems.filter(item => item.is_protected);

    return {
        generated_at: new Date().toISOString(),
        counts: {
            inventory_items: enrichedItems.length,
            possible_duplicates: possibleDuplicates.length,
            orphan_recipe_items: orphanRecipeItems.length,
            protected_items: protectedItems.length
        },
        possible_duplicates: possibleDuplicates,
        orphan_recipe_items: orphanRecipeItems,
        protected_items: protectedItems
    };
}


app.get("/recipes/by-ingredient/:name", async (req, res) => {
    try {
        const ingredientName = normalizeIngredientText(req.params.name || "");
        if (!ingredientName) return res.status(400).json({ error: "Lebensmittelname ist erforderlich." });

        const recipes = await all(`SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC`);
        const matches = [];

        for (const recipe of recipes) {
            const parsed = parseIngredientsText(recipe.ingredients || "");
            const matchedIngredients = parsed.filter(ingredient => ingredientMatchesName(ingredient.food_name, ingredientName));
            if (matchedIngredients.length) {
                matches.push({
                    ...normalizeRecipeRow(recipe),
                    matched_ingredients: matchedIngredients.map(ingredient => ({
                        raw_text: ingredient.raw_text,
                        food_name: ingredient.food_name,
                        amount: ingredient.amount,
                        unit: ingredient.unit
                    }))
                });
            }
        }

        res.json({ ingredient: ingredientName, recipes: matches });
    } catch (error) {
        console.error("Fehler bei GET /recipes/by-ingredient/:name:", error.message);
        res.status(500).json({ error: "Rezepte zur Zutat konnten nicht geladen werden" });
    }
});

function scoreInventoryIngredientMatch(item, ingredientName) {
    const ingredientKey = buildFoodIdentity(ingredientName).canonical_key;
    if (ingredientKey && item.canonical_name && ingredientKey === item.canonical_name) return 100;
    const candidateNames = [item.name, item.recipe_match_name, item.canonical_name].filter(Boolean);
    let bestScore = 0;

    for (const candidate of candidateNames) {
        const candidateComparable = normalizeComparableName(candidate);
        const ingredientComparable = normalizeComparableName(ingredientName);
        if (!candidateComparable || !ingredientComparable) continue;

        if (candidateComparable === ingredientComparable) bestScore = Math.max(bestScore, 100);
        if (comparableNamesMatch(candidate, ingredientName)) bestScore = Math.max(bestScore, 90);

        const candidateTokens = candidateComparable.split(" ").filter(token => token.length >= 3);
        const ingredientTokens = ingredientComparable.split(" ").filter(token => token.length >= 3);
        const sharedTokens = ingredientTokens.filter(token => candidateTokens.includes(token));

        if (sharedTokens.length && sharedTokens.length === ingredientTokens.length) bestScore = Math.max(bestScore, 75);
        if (sharedTokens.length && sharedTokens.length === candidateTokens.length) bestScore = Math.max(bestScore, 70);
    }

    return bestScore;
}

app.get("/inventory/by-ingredient/:name", async (req, res) => {
    try {
        const ingredientName = normalizeIngredientText(req.params.name || "");
        if (!ingredientName) return res.status(400).json({ error: "Lebensmittelname ist erforderlich." });

        const inventoryItems = await getAllInventoryItemsWithBatches();
        const rankedItems = inventoryItems
            .map(item => ({ item, score: scoreInventoryIngredientMatch(item, ingredientName) }))
            .filter(entry => entry.score >= 70)
            .sort((a, b) => b.score - a.score || String(a.item.name || "").localeCompare(String(b.item.name || ""), "de"));

        if (!rankedItems.length) return res.status(404).json({ error: "Kein passender Inventarartikel gefunden." });
        res.json(rankedItems[0].item);
    } catch (error) {
        console.error("Fehler bei GET /inventory/by-ingredient/:name:", error.message);
        res.status(500).json({ error: "Inventarartikel zur Zutat konnte nicht geladen werden" });
    }
});

app.get("/recipes/:id/stock-check", async (req, res) => {
    try {
        const recipe = await get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);
        if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden" });

        const requestedPortions = Number.parseInt(req.query.portions, 10);
        const basePortions = Number.parseInt(recipe.portions, 10) > 0 ? Number.parseInt(recipe.portions, 10) : 1;
        const displayedPortions = Number.isInteger(requestedPortions) && requestedPortions > 0 ? requestedPortions : basePortions;
        const factor = displayedPortions / basePortions;

        const inventoryItems = await getAllInventoryItemsWithBatches();

        const parsedIngredients = parseIngredientsText(recipe.ingredients || "");
        const entries = parsedIngredients.map(ingredient => buildRecipeStockEntry(ingredient, inventoryItems, factor));

        const summary = entries.reduce((result, entry) => {
            if (entry.status === "available") result.available += 1;
            if (entry.status === "partial") result.partial += 1;
            if (entry.status === "missing") result.missing += 1;
            return result;
        }, { available: 0, partial: 0, missing: 0 });

        res.json({
            recipe_id: Number(recipe.id),
            base_portions: basePortions,
            displayed_portions: displayedPortions,
            ingredients: entries,
            summary
        });
    } catch (error) {
        console.error("Fehler bei GET /recipes/:id/stock-check:", error.message);
        res.status(500).json({ error: "Bestandsprüfung konnte nicht geladen werden" });
    }
});

app.get("/inventory/suggestions", async (req, res) => {
    try {
        const q = normalizeName(req.query.q || "");
        const qIdentity = buildFoodIdentity(q);
        const rows = await all(`
            SELECT DISTINCT ii.id, ii.name, ii.unit, ii.calories_per_100g, ii.canonical_name
            FROM inventory_items ii
            LEFT JOIN food_items fi ON fi.id = ii.food_item_id
            LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
            ORDER BY ii.name COLLATE NOCASE ASC
        `);
        const filtered = rows.filter(row => {
            if (!q) return true;
            const haystack = [row.name, row.canonical_name].join(" ").toLowerCase();
            if (haystack.includes(q.toLowerCase())) return true;
            if (qIdentity.canonical_key && row.canonical_name === qIdentity.canonical_key) return true;
            return comparableNamesMatch(row.name, q);
        }).slice(0, 10);
        res.json(filtered);
    } catch (error) {
        console.error("Fehler bei GET /inventory/suggestions:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Vorschläge" });
    }
});

app.get("/food-items/resolve", async (req, res) => {
    try {
        const q = normalizeName(req.query.q || "");
        if (!q) return res.json({ query: q, identity: null, exact: null, suggestions: [] });
        const identity = buildFoodIdentity(q);
        const exactFoodItem = await findFoodItemByName(q);
        const suggestions = await all(`
            SELECT fi.id, fi.display_name, fi.canonical_key, fi.calories_per_100g
            FROM food_items fi
            ORDER BY fi.display_name COLLATE NOCASE ASC
        `);
        const ranked = suggestions
            .map(item => ({ ...item, score: item.canonical_key === identity.canonical_key ? 100 : (comparableNamesMatch(item.display_name, q) ? 75 : 0) }))
            .filter(item => item.score >= 75)
            .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name, "de"))
            .slice(0, 5);
        res.json({ query: q, identity, exact: normalizeFoodItemRow(exactFoodItem), suggestions: ranked });
    } catch (error) {
        console.error("Fehler bei GET /food-items/resolve:", error.message);
        res.status(500).json({ error: "Lebensmittel konnte nicht geprüft werden" });
    }
});

app.get("/inventory", async (req, res) => {
    try {
        const enriched = await getAllInventoryItemsWithBatches();
        res.json(enriched);
    } catch (error) {
        console.error("Fehler bei GET /inventory:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Inventars" });
    }
});

app.get("/inventory/:id", async (req, res) => {
    try {
        const row = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        const batches = await getInventoryBatches(row.id);
        res.json(normalizeInventoryRow(row, batches));
    } catch (error) {
        console.error("Fehler bei GET /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Inventar-Eintrags" });
    }
});

app.post("/inventory", async (req, res) => {
    try {
        const validation = validateInventoryPayload(req.body);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const item = await getOrCreateInventoryItem(validation.value);
        const stockType = req.body?.stockType === "loose" ? "loose" : "package";
        const common = {
            expiry_date: typeof req.body.expiry_date === "string" ? req.body.expiry_date : "",
            storage_location: typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "",
            notes: typeof req.body.notes === "string" ? req.body.notes.trim() : ""
        };
        if (stockType === "package") {
            await createInventoryPackageUnits(item.id, { count: req.body.packageCount, unitLabel: req.body.unitLabel, unitWeight: req.body.unitWeight, measureUnit: req.body.measureUnit, ...common });
        } else {
            await createInventoryLooseAmount(item.id, { amount: req.body.looseAmount, measureUnit: req.body.measureUnit, ...common });
        }
        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [item.id]);
        const batches = await getInventoryBatches(item.id);
        res.status(201).json(normalizeInventoryRow(updated, batches));
    } catch (error) {
        console.error("Fehler bei POST /inventory:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Speichern des Inventar-Eintrags" });
    }
});

app.put("/inventory/:id", async (req, res) => {
    try {
        const validation = validateInventoryPayload(req.body);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const existing = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!existing) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        const foodItem = await getOrCreateFoodItem(validation.value.name, { calories_per_100g: validation.value.calories_per_100g });
        await run(`UPDATE inventory_items SET name = ?, unit = ?, notes = ?, calories_per_100g = ?, food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [foodItem.display_name || validation.value.name, validation.value.unit, validation.value.notes, validation.value.calories_per_100g, foodItem.id, foodItem.canonical_key, req.params.id]);
        await recalculateInventoryItem(req.params.id);
        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        const batches = await getInventoryBatches(req.params.id);
        res.json(normalizeInventoryRow(updated, batches));
    } catch (error) {
        console.error("Fehler bei PUT /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Inventar-Eintrags" });
    }
});

app.patch("/inventory/:id/adjust", async (req, res) => {
    try {
        const action = req.body?.action === "add" ? "add" : req.body?.action === "remove" ? "remove" : "";
        const mode = ["package", "loose", "auto"].includes(req.body?.mode) ? req.body.mode : "";
        const amount = Number(req.body?.amount);
        if (!action) return res.status(400).json({ error: "Aktion muss add oder remove sein." });
        if (!mode) return res.status(400).json({ error: "Anpassungsart ist erforderlich." });
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Anpassungswert muss größer 0 sein." });
        const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!item) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        if (action === "add") {
            if (mode === "package") {
                await createInventoryPackageUnits(item.id, {
                    count: amount,
                    unitLabel: req.body.unitLabel,
                    unitWeight: req.body.unitWeight,
                    measureUnit: req.body.measureUnit,
                    expiry_date: typeof req.body.expiry_date === "string" ? req.body.expiry_date : "",
                    storage_location: typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "",
                    notes: "Bestand hinzugefügt"
                });
            } else {
                await createInventoryLooseAmount(item.id, {
                    amount,
                    measureUnit: req.body.measureUnit,
                    expiry_date: typeof req.body.expiry_date === "string" ? req.body.expiry_date : "",
                    storage_location: typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "",
                    notes: "Freie Menge hinzugefügt"
                });
            }
        } else {
            if (mode === "package") {
                const unitWeight = Number(req.body?.unitWeight);
                const measureUnit = normalizeMeasureUnit(req.body?.measureUnit);
                const storageLocation = typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "";
                const expiryDate = typeof req.body.expiry_date === "string" ? req.body.expiry_date : "";
                const countToRemove = Math.floor(amount);

                if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
                    return res.status(400).json({ error: "Ungültige Einheit." });
                }

                const packages = await all(
                    `SELECT * FROM inventory_batches
                     WHERE item_id = ?
                       AND batch_type = 'package'
                       AND unit_weight = ?
                       AND measure_unit = ?
                       AND storage_location = ?
                       AND expiry_date = ?
                       AND remaining_quantity > 0
                     ORDER BY id ASC
                     LIMIT ?`,
                    [item.id, unitWeight, measureUnit, storageLocation, expiryDate, countToRemove]
                );

                if (packages.length < countToRemove) {
                    return res.status(400).json({ error: "Nicht genügend Einheiten vorhanden." });
                }

                for (const pack of packages) {
                    // Nicht löschen: Die Position bleibt als Bestand 0 sichtbar und kann später wieder erhöht werden.
                    await run(
                        `UPDATE inventory_batches
                         SET remaining_quantity = 0, remaining_weight = 0, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [pack.id]
                    );
                }
            } else {
                const measureUnit = normalizeMeasureUnit(req.body.measureUnit);
                const storageLocation = typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "";
                const expiryDate = typeof req.body.expiry_date === "string" ? req.body.expiry_date : "";
                const hasStorageLocationFilter = Object.prototype.hasOwnProperty.call(req.body, "storage_location");
                const hasExpiryDateFilter = Object.prototype.hasOwnProperty.call(req.body, "expiry_date");
                let remainingToRemove = amount;
                const looseWhere = ["item_id = ?", "batch_type = 'loose'", "measure_unit = ?", "remaining_weight > 0"];
                const looseParams = [item.id, measureUnit];
                if (hasStorageLocationFilter) { looseWhere.push("storage_location = ?"); looseParams.push(storageLocation); }
                if (hasExpiryDateFilter) { looseWhere.push("expiry_date = ?"); looseParams.push(expiryDate); }
                const looseRows = await all(
                    `SELECT * FROM inventory_batches WHERE ${looseWhere.join(" AND ")} ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, id ASC`,
                    looseParams
                );
                for (const row of looseRows) {
                    if (remainingToRemove <= 0) break;
                    const current = Number(row.remaining_weight ?? 0);
                    const take = Math.min(current, remainingToRemove);
                    await run(`UPDATE inventory_batches SET remaining_weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [Math.max(0, current - take), row.id]);
                    remainingToRemove -= take;
                }
                if (mode === "auto" && remainingToRemove > 0) {
                    const packageRows = await all(
                        `SELECT * FROM inventory_batches WHERE item_id = ? AND batch_type = 'package' AND measure_unit = ? AND remaining_weight > 0 ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, id ASC`,
                        [item.id, measureUnit]
                    );
                    for (const row of packageRows) {
                        if (remainingToRemove <= 0) break;
                        const current = Number(row.remaining_weight ?? 0);
                        const take = Math.min(current, remainingToRemove);
                        const newWeight = Math.max(0, current - take);
                        const newQuantity = newWeight > 0 && Number(row.unit_weight ?? 0) > 0 ? newWeight / Number(row.unit_weight) : 0;
                        await run(`UPDATE inventory_batches SET remaining_weight = ?, remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newWeight, newQuantity, row.id]);
                        remainingToRemove -= take;
                    }
                }
                if (remainingToRemove > 0.000001) return res.status(400).json({ error: "Nicht genügend Bestand für diese Entnahme vorhanden." });
            }
        }
        await recalculateInventoryItem(req.params.id);
        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        const updatedBatches = await getInventoryBatches(req.params.id);
        res.json(normalizeInventoryRow(updated, updatedBatches));
    } catch (error) {
        console.error("Fehler bei PATCH /inventory/:id/adjust:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Anpassen des Inventarbestands" });
    }
});

app.delete("/inventory/:id/stock-profile", async (req, res) => {
    try {
        const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!item) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });

        const mode = req.body?.mode === "package" ? "package" : req.body?.mode === "loose" ? "loose" : "";
        if (!mode) return res.status(400).json({ error: "Positionstyp ist erforderlich." });

        const measureUnit = normalizeMeasureUnit(req.body?.measureUnit);
        const storageLocation = typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "";
        const expiryDate = typeof req.body.expiry_date === "string" ? req.body.expiry_date : "";

        let result;
        if (mode === "package") {
            const unitWeight = Number(req.body?.unitWeight);
            if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
                return res.status(400).json({ error: "Ungültige Einheit." });
            }
            result = await run(
                `DELETE FROM inventory_batches
                 WHERE item_id = ?
                   AND batch_type = 'package'
                   AND unit_weight = ?
                   AND measure_unit = ?
                   AND storage_location = ?
                   AND expiry_date = ?`,
                [item.id, unitWeight, measureUnit, storageLocation, expiryDate]
            );
        } else {
            result = await run(
                `DELETE FROM inventory_batches
                 WHERE item_id = ?
                   AND batch_type = 'loose'
                   AND measure_unit = ?
                   AND storage_location = ?
                   AND expiry_date = ?`,
                [item.id, measureUnit, storageLocation, expiryDate]
            );
        }

        if (result.changes === 0) return res.status(404).json({ error: "Position nicht gefunden." });

        await recalculateInventoryItem(item.id);
        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [item.id]);
        const updatedBatches = await getInventoryBatches(item.id);
        res.json(normalizeInventoryRow(updated, updatedBatches));
    } catch (error) {
        console.error("Fehler bei DELETE /inventory/:id/stock-profile:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Löschen der Bestandsposition" });
    }
});

app.delete("/inventory/:id", async (req, res) => {
    try {
        await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [req.params.id]);
        const result = await run(`DELETE FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Inventar-Eintrags" });
    }
});


app.get("/admin/inventory-cleanup-preview", async (req, res) => {
    try {
        const preview = await buildInventoryCleanupPreview();
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/inventory-cleanup-preview:", error.message);
        res.status(500).json({ error: "Inventar-Bereinigungsanalyse konnte nicht erstellt werden." });
    }
});

app.post("/admin/inventory-cleanup-apply", async (req, res) => {
    try {
        const deleteIds = Array.isArray(req.body?.delete_item_ids) ? req.body.delete_item_ids.map(Number).filter(Number.isFinite) : [];
        if (!deleteIds.length) return res.status(400).json({ error: "Keine Artikel zum Löschen ausgewählt." });

        const preview = await buildInventoryCleanupPreview();
        const allowedIds = new Set(preview.orphan_recipe_items.map(item => Number(item.id)));
        const safeDeleteIds = deleteIds.filter(id => allowedIds.has(id));
        if (!safeDeleteIds.length) {
            return res.status(400).json({ error: "Keine sicher löschbaren Artikel ausgewählt." });
        }

        for (const id of safeDeleteIds) {
            await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [id]);
            await run(`DELETE FROM inventory_items WHERE id = ?`, [id]);
        }

        const updatedPreview = await buildInventoryCleanupPreview();
        res.json({ success: true, deleted_item_ids: safeDeleteIds, preview: updatedPreview });
    } catch (error) {
        console.error("Fehler bei POST /admin/inventory-cleanup-apply:", error.message);
        res.status(500).json({ error: "Inventar-Bereinigung konnte nicht ausgeführt werden." });
    }
});

ensureSchema()
    .then(() => {
        app.listen(PORT, () => console.log(`Food Calculator API läuft auf Port ${PORT}`));
    })
    .catch((error) => {
        console.error("Datenbankinitialisierung fehlgeschlagen:", error.message);
        process.exit(1);
    });
