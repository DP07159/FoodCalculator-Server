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
    await addColumnIfMissing("recipe_ingredients", "link_source", "TEXT DEFAULT 'auto_created'");

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
        CREATE TABLE IF NOT EXISTS health_factors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT '',
            description TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS food_item_health_factors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            food_item_id INTEGER NOT NULL,
            health_factor_id INTEGER NOT NULL,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(food_item_id, health_factor_id),
            FOREIGN KEY (food_item_id) REFERENCES food_items(id) ON DELETE CASCADE,
            FOREIGN KEY (health_factor_id) REFERENCES health_factors(id) ON DELETE CASCADE
        )
    `);


    await run(`
        CREATE TABLE IF NOT EXISTS admin_recipe_resync_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            override_type TEXT NOT NULL,
            canonical_key TEXT DEFAULT '',
            inventory_item_id INTEGER,
            target_inventory_item_id INTEGER,
            food_item_id INTEGER,
            action TEXT NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(override_type, canonical_key, inventory_item_id)
        )
    `);

    await addColumnIfMissing("health_factors", "category", "TEXT DEFAULT ''");
    await addColumnIfMissing("health_factors", "description", "TEXT DEFAULT ''");
    await addColumnIfMissing("health_factors", "updated_at", "TEXT DEFAULT ''");
    await addColumnIfMissing("food_item_health_factors", "notes", "TEXT DEFAULT ''");

    await run(`
        CREATE TABLE IF NOT EXISTS admin_ignored_duplicate_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id_a INTEGER NOT NULL,
            item_id_b INTEGER NOT NULL,
            canonical_key TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(item_id_a, item_id_b)
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
    // Wichtig: Der Rezept-Zutaten-Sync darf beim Serverstart keine bestehenden
    // Verknüpfungen löschen und neu anlegen. Sonst entstehen bei jedem Neustart
    // neue Lebensmittel-/Inventarartikel aus denselben Rezeptzutaten.
    await backfillMissingRecipeIngredientLinks();
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

function normalizeVisibleFoodName(value) {
    return String(value || "")
        .replace(/^[-•*]\s*/, "")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[,;:/]+\s*$/g, "")
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
        cl: "cl", zentiliter: "cl",
        dl: "dl", deziliter: "dl",
        l: "l", liter: "l",
        cup: "cup", cups: "cup", tasse: "cup", tassen: "cup",
        stk: "Stk.", stück: "Stk.", stueck: "Stk.", ei: "Stk.", eier: "Stk.",
        dose: "Dose", dosen: "Dose",
        glas: "Glas", glaeser: "Glas", gläser: "Glas",
        packung: "Packung", packungen: "Packung", pkg: "Packung",
        el: "EL", esslöffel: "EL", essloeffel: "EL", tablespoon: "EL", tablespoons: "EL", tbsp: "EL",
        tl: "TL", teelöffel: "TL", teeloeffel: "TL", teaspoon: "TL", teaspoons: "TL", tsp: "TL",
        prise: "Prise", prisen: "Prise",
        spritzer: "Spritzer", schuss: "Spritzer", schuesse: "Spritzer", schüsse: "Spritzer"
    };
    return aliases[clean] || unit || "";
}

function unitForInventory(unit) {
    const normalized = normalizeIngredientUnit(unit);
    if (normalized === "kg" || normalized === "g") return "g";
    if (["l", "dl", "cl", "ml", "cup", "EL", "TL"].includes(normalized)) return "ml";
    return "Stk.";
}

function convertIngredientAmount(amount, unit) {
    if (amount === null || amount === undefined) return null;
    const normalized = normalizeIngredientUnit(unit);
    if (normalized === "kg" || normalized === "l") return amount * 1000;
    if (normalized === "dl") return amount * 100;
    if (normalized === "cl") return amount * 10;
    if (normalized === "cup") return amount * 240;
    if (normalized === "EL") return amount * 15;
    if (normalized === "TL") return amount * 5;
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

const UNIT_TOKEN_SET = new Set(["kg", "g", "gr", "gramm", "ml", "cl", "dl", "l", "liter", "milliliter", "zentiliter", "deziliter", "stk", "stueck", "stuck", "dose", "dosen", "glas", "glaeser", "gläser", "packung", "packungen", "pkg", "cup", "cups", "tasse", "tassen", "el", "essloeffel", "esslöffel", "tl", "teeloeffel", "teelöffel", "tbsp", "tsp", "prise", "prisen", "spritzer", "schuss", "schuesse", "schüsse"]);
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
        // Wichtig: display_name darf keine automatisch zusammengesetzte/vereinheitlichte
        // Schreibweise mehr sein. Sichtbare Namen bleiben User-/Rezepttext.
        display_name: normalizeVisibleFoodName(value)
    };
}

function canonicalizeIngredientName(value) {
    return buildFoodIdentity(value).canonical_key;
}

function displayIngredientNameFromCanonical(value, fallback) {
    return normalizeVisibleFoodName(fallback || value);
}

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

    // Keine sichtbare Vereinheitlichung, keine Singular-/Plural-Korrektur,
    // keine Entfernung von beschreibenden Namensbestandteilen.
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

async function createDistinctFoodItemFromIngredient(name, { calories_per_100g = null, aliasName = "" } = {}) {
    const identity = buildFoodIdentity(name);
    const baseCanonicalKey = identity.canonical_key || canonicalizeIngredientName(name);
    const displayName = normalizeVisibleFoodName(name);
    if (!baseCanonicalKey || !displayName) throw new Error("Lebensmittel konnte nicht normalisiert werden.");

    let canonicalKey = baseCanonicalKey;
    let counter = 1;
    while (await get(`SELECT id FROM food_items WHERE canonical_key = ? LIMIT 1`, [canonicalKey])) {
        counter += 1;
        canonicalKey = `${baseCanonicalKey}__recipe_${Date.now()}_${counter}`;
    }

    const result = await run(
        `INSERT INTO food_items (display_name, canonical_key, calories_per_100g) VALUES (?, ?, ?)`,
        [displayName, canonicalKey, calories_per_100g]
    );
    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [result.lastID]);
    await addFoodAlias(foodItem.id, displayName);
    await addFoodAlias(foodItem.id, name);
    if (aliasName) await addFoodAlias(foodItem.id, aliasName);
    return foodItem;
}

async function getSelectedFoodItemForIngredient(explicitLinks, index, rawText) {
    const links = Array.isArray(explicitLinks) ? explicitLinks : [];
    const link = links.find(entry => {
        if (Number(entry.line_index) !== Number(index)) return false;
        if (entry.raw_text && rawText && entry.raw_text.trim() !== rawText.trim()) return false;
        return true;
    });
    if (!link || !link.food_item_id) return null;
    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [link.food_item_id]);
    return foodItem || null;
}

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
    if (!left || !right) return false;
    return left === right;
}

async function getPreservedFoodItemForIngredient(previousLinks, index, ingredient) {
    const links = Array.isArray(previousLinks) ? previousLinks : [];
    const raw = normalizeIngredientRawLineForMatch(ingredient?.raw_text);
    const foodName = ingredient?.food_name || "";

    // 1) stärkster Fall: gleiche Zeile und identischer Text, whitespace-tolerant
    let link = links.find(entry =>
        Number(entry.sort_order) === Number(index) &&
        normalizeIngredientRawLineForMatch(entry.raw_text) === raw &&
        entry.food_item_id
    );

    // 2) Fallback: identischer Text an anderer Stelle, falls Zeilen verschoben wurden
    if (!link && raw) {
        link = links.find(entry =>
            normalizeIngredientRawLineForMatch(entry.raw_text) === raw &&
            entry.food_item_id
        );
    }

    // 3) Wichtiger Fall beim Bearbeiten: Menge geändert, Lebensmittel aber gleich.
    // Beispiel: "100 g Reis" -> "150 g Reis" darf keinen neuen Artikel erzeugen.
    if (!link && foodName) {
        link = links.find(entry =>
            Number(entry.sort_order) === Number(index) &&
            ingredientFoodNamesMatch(entry.food_name, foodName) &&
            entry.food_item_id
        );
    }

    // 4) Letzter sicherer Fallback: gleicher normalisierter Lebensmittelname in anderer Zeile.
    if (!link && foodName) {
        link = links.find(entry =>
            ingredientFoodNamesMatch(entry.food_name, foodName) &&
            entry.food_item_id
        );
    }

    if (!link) return null;
    const foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [link.food_item_id]);
    if (!foodItem) return null;

    return {
        foodItem,
        linkSource: link.link_source || "preserved"
    };
}

async function ensureInventoryItemForFoodItem(foodItem, ingredient, { source = "recipe" } = {}) {
    const existing = await get(`SELECT * FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [foodItem.id]);
    if (!existing) {
        await run(
            `INSERT INTO inventory_items (name, quantity, unit, weight, expiry_date, storage_location, notes, source, recipe_match_name, calories_per_100g, food_item_id, canonical_name)
             VALUES (?, 0, ?, 0, '', '', '', ?, ?, ?, ?, ?)`,
            [foodItem.display_name || ingredient.food_name, ingredient.unit || "g", source, foodItem.display_name || ingredient.food_name, foodItem.calories_per_100g ?? null, foodItem.id, foodItem.canonical_key]
        );
        return;
    }

    await run(
        `UPDATE inventory_items
         SET recipe_match_name = COALESCE(NULLIF(recipe_match_name, ''), ?),
             canonical_name = COALESCE(NULLIF(canonical_name, ''), ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [foodItem.display_name || ingredient.food_name, foodItem.canonical_key, existing.id]
    );
}

async function syncRecipeIngredients(recipeId, ingredientsText, explicitLinks = [], options = {}) {
    const { createMissing = true } = options;
    const previousLinks = await all(
        `SELECT sort_order, raw_text, food_name, canonical_key, food_item_id, link_source
         FROM recipe_ingredients
         WHERE recipe_id = ?`,
        [recipeId]
    );

    await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [recipeId]);
    const parsedIngredients = parseIngredientsText(ingredientsText);

    for (const [index, ingredient] of parsedIngredients.entries()) {
        let linkSource = "new_from_recipe";
        let foodItem = await getSelectedFoodItemForIngredient(explicitLinks, index, ingredient.raw_text);

        if (foodItem) {
            linkSource = "user_selected";
            await addFoodAlias(foodItem.id, ingredient.raw_text);
            await addFoodAlias(foodItem.id, ingredient.food_name);
        } else {
            const preserved = await getPreservedFoodItemForIngredient(previousLinks, index, ingredient);
            if (preserved) {
                foodItem = preserved.foodItem;
                linkSource = preserved.linkSource === "new_from_recipe" ? "preserved_recipe" : preserved.linkSource;
            }
        }

        if (!foodItem) {
            // Strikte automatische Zuordnung: nur exakter Stammdaten-/Alias-Treffer.
            // Keine Teiltreffer, keine Ähnlichkeitssuche, keine sichtbare Namenskorrektur.
            foodItem = await findFoodItemByName(ingredient.food_name);
            if (foodItem) {
                linkSource = "auto_exact";
            }
        }

        if (!foodItem) {
            if (!createMissing) continue;
            foodItem = await createDistinctFoodItemFromIngredient(ingredient.food_name, { aliasName: ingredient.raw_text });
            linkSource = "new_from_recipe";
        }

        await run(
            `INSERT INTO recipe_ingredients (recipe_id, raw_text, food_name, amount, unit, sort_order, updated_at, food_item_id, canonical_key, link_source)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
            [recipeId, ingredient.raw_text, ingredient.food_name, ingredient.amount, ingredient.unit, index, foodItem.id, foodItem.canonical_key, linkSource]
        );

        await ensureInventoryItemForFoodItem(foodItem, ingredient, { source: linkSource === "user_selected" ? "manual" : "recipe" });
    }
}

async function backfillMissingRecipeIngredientLinks() {
    const recipes = await all(`SELECT id, ingredients FROM recipes`);
    for (const recipe of recipes) {
        const existing = await get(`SELECT COUNT(*) AS count FROM recipe_ingredients WHERE recipe_id = ?`, [recipe.id]);
        if (Number(existing?.count || 0) > 0) continue;

        // Nur wenn ein Rezept noch gar keine strukturierte Zutatenverknüpfung besitzt,
        // wird einmalig aufgebaut. Bestehende Links werden beim Serverstart nie gelöscht.
        await syncRecipeIngredients(recipe.id, recipe.ingredients || "", [], { createMissing: true });
    }
}

// Kompatibilitäts-Alias für ältere interne Aufrufe.
const syncAllRecipeIngredients = backfillMissingRecipeIngredientLinks;


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
    // Keine automatische Umbenennung/Zuordnung anhand ähnlicher Namen.
    // Der sichere Weg ist: expliziter Link aus recipe_ingredients oder exakter Treffer.
    return parsedIngredient;
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

    if (parsedIngredient.food_item_id) {
        const byFoodItemId = inventoryItems.find(item => Number(item.food_item_id) === Number(parsedIngredient.food_item_id));
        if (byFoodItemId) return byFoodItemId;
    }

    if (parsedIngredient.matched_item_id) {
        const byId = inventoryItems.find(item => Number(item.id) === Number(parsedIngredient.matched_item_id));
        if (byId) return byId;
    }

    const ingredientKey = buildFoodIdentity(parsedIngredient.food_name).canonical_key;
    if (!ingredientKey) return null;

    return inventoryItems.find(item => {
        const itemKey = item.canonical_name || buildFoodIdentity(item.name).canonical_key;
        return itemKey && itemKey === ingredientKey;
    }) || null;
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
    const inventoryRows = await all(`
        SELECT
            ii.*,
            fi.display_name AS food_display_name,
            fi.canonical_key AS food_canonical_key,
            fi.calories_per_100g AS food_calories_per_100g
        FROM inventory_items ii
        LEFT JOIN food_items fi ON fi.id = ii.food_item_id
        ORDER BY COALESCE(NULLIF(fi.display_name, ''), ii.name) COLLATE NOCASE ASC
    `);
    const inventoryItems = [];
    for (const row of inventoryRows) {
        const batches = await getInventoryBatches(row.id);
        inventoryItems.push(normalizeInventoryRow(row, batches));
    }
    return inventoryItems;
}

async function getInventoryItemWithFoodName(itemId) {
    return get(`
        SELECT
            ii.*,
            fi.display_name AS food_display_name,
            fi.canonical_key AS food_canonical_key,
            fi.calories_per_100g AS food_calories_per_100g
        FROM inventory_items ii
        LEFT JOIN food_items fi ON fi.id = ii.food_item_id
        WHERE ii.id = ?
    `, [itemId]);
}

function ingredientMatchesName(ingredientName, searchName) {
    const left = buildFoodIdentity(ingredientName).canonical_key;
    const right = buildFoodIdentity(searchName).canonical_key;
    if (left && right && left === right) return true;

    const leftDisplay = normalizeGermanText(ingredientName).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
    const rightDisplay = normalizeGermanText(searchName).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
    return Boolean(leftDisplay && rightDisplay && leftDisplay === rightDisplay);
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

async function renameFoodItemStable(foodItemId, displayName, { calories_per_100g = undefined, updateCanonical = true } = {}) {
    const id = Number(foodItemId);
    const nextName = String(displayName || "").trim();
    if (!Number.isFinite(id)) throw new Error("Ungültiger Lebensmittel-Stammsatz.");
    if (!nextName) throw new Error("Anzeigename ist erforderlich.");

    const current = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
    if (!current) throw new Error("Lebensmittel-Stammsatz wurde nicht gefunden.");

    const nextCanonical = buildFoodIdentity(nextName).canonical_key || canonicalizeIngredientName(nextName) || current.canonical_key;
    let canonicalToStore = current.canonical_key;

    if (updateCanonical && nextCanonical) {
        const conflicting = await get(`SELECT id, display_name FROM food_items WHERE canonical_key = ? AND id <> ? LIMIT 1`, [nextCanonical, id]);
        if (!conflicting) canonicalToStore = nextCanonical;
    }

    const calories = calories_per_100g === undefined
        ? current.calories_per_100g
        : (calories_per_100g === null || calories_per_100g === "" ? null : Number(calories_per_100g));

    await addFoodAlias(id, current.display_name);
    if (current.canonical_key) await addFoodAlias(id, current.canonical_key);
    await addFoodAlias(id, nextName);

    await run(
        `UPDATE food_items
         SET display_name = ?, canonical_key = ?, calories_per_100g = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextName, canonicalToStore, calories, id]
    );

    // Legacy-Synchronisierung: food_items bleibt die Wahrheit, aber alte Inventarspalten werden mitgezogen,
    // damit keine veralteten Fallback-Namen in älteren Frontend-/Admin-Ansichten auftauchen.
    await run(
        `UPDATE inventory_items
         SET name = ?, canonical_name = ?, calories_per_100g = COALESCE(?, calories_per_100g), updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [nextName, canonicalToStore, calories, id]
    );

    await run(
        `UPDATE recipe_ingredients
         SET canonical_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [canonicalToStore, id]
    );

    return get(`SELECT * FROM food_items WHERE id = ?`, [id]);
}

async function getOrCreateFoodItem(name, { calories_per_100g = null, aliasName = "" } = {}) {
    const identity = buildFoodIdentity(name);
    const canonicalKey = identity.canonical_key || canonicalizeIngredientName(name);
    const displayName = normalizeVisibleFoodName(name);
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
    const displayName = item.food_display_name || item.display_name || item.name || "";
    const canonicalName = item.food_canonical_key || item.canonical_key || item.canonical_name || buildFoodIdentity(displayName || item.name).canonical_key || "";
    const calories = item.food_calories_per_100g !== null && item.food_calories_per_100g !== undefined
        ? item.food_calories_per_100g
        : item.calories_per_100g;

    return {
        id: item.id,
        name: displayName,
        inventory_name: item.name || "",
        quantity: item.quantity ?? null,
        unit: item.unit || "g",
        weight: item.weight ?? null,
        expiry_date: item.expiry_date || "",
        storage_location: item.storage_location || "",
        notes: item.notes || "",
        calories_per_100g: calories === null || calories === undefined ? null : Number(calories),
        food_item_id: item.food_item_id ?? null,
        canonical_name: canonicalName,
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

function normalizeIngredientLinks(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(link => ({
            line_index: Number.parseInt(link.line_index ?? link.index, 10),
            food_item_id: Number.parseInt(link.food_item_id ?? link.foodItemId, 10),
            raw_text: typeof link.raw_text === "string" ? link.raw_text : ""
        }))
        .filter(link => Number.isInteger(link.line_index) && link.line_index >= 0 && Number.isInteger(link.food_item_id) && link.food_item_id > 0);
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
            is_favorite: Number(payload.is_favorite) === 1 ? 1 : 0,
            ingredientLinks: normalizeIngredientLinks(payload.ingredientLinks)
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

async function getRecipeIngredientLinks(recipeId) {
    const rows = await all(
        `SELECT
            ri.sort_order AS line_index,
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.food_item_id,
            ri.link_source,
            fi.display_name AS food_display_name
         FROM recipe_ingredients ri
         LEFT JOIN food_items fi ON fi.id = ri.food_item_id
         WHERE ri.recipe_id = ?
         ORDER BY ri.sort_order ASC`,
        [recipeId]
    );
    return rows.map(row => ({
        line_index: Number(row.line_index) || 0,
        raw_text: row.raw_text || "",
        food_name: row.food_display_name || row.food_name || "",
        stored_food_name: row.food_name || "",
        amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
        unit: row.unit || "",
        food_item_id: row.food_item_id || null,
        link_source: row.link_source || ""
    }));
}

async function normalizeRecipeRowWithIngredientLinks(recipe) {
    return {
        ...normalizeRecipeRow(recipe),
        ingredientLinks: await getRecipeIngredientLinks(recipe.id)
    };
}

function normalizeIngredientsTextForChangeCheck(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim();
}

function hasExplicitIngredientLinksPayload(payload) {
    return Object.prototype.hasOwnProperty.call(payload || {}, "ingredientLinks") && Array.isArray(payload.ingredientLinks);
}

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
        res.json(await normalizeRecipeRowWithIngredientLinks(row));
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
        await syncRecipeIngredients(created.id, created.ingredients || "", recipe.ingredientLinks);
        res.status(201).json(await normalizeRecipeRowWithIngredientLinks(created));
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
        const ingredientsChanged = normalizeIngredientsTextForChangeCheck(current.ingredients) !== normalizeIngredientsTextForChangeCheck(updated.ingredients);
        const explicitLinksProvided = hasExplicitIngredientLinksPayload(req.body);

        // Wichtig: Wenn nur Name, Kalorien, Portionen, Mahlzeiten oder Anleitung geändert werden,
        // dürfen die bestehenden Zutaten-Verknüpfungen nicht neu synchronisiert werden.
        // Genau das hat vorher beim erneuten Speichern bestehender Rezepte neue Inventarartikel erzeugen können.
        if (ingredientsChanged || explicitLinksProvided) {
            await syncRecipeIngredients(updated.id, updated.ingredients || "", recipe.ingredientLinks);
        }

        res.json(await normalizeRecipeRowWithIngredientLinks(updated));
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

function normalizeDuplicatePairIds(idA, idB) {
    const a = Number(idA);
    const b = Number(idB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
    return a < b ? [a, b] : [b, a];
}


async function ensureFoodItemForInventoryRow(item) {
    if (!item) throw new Error("Artikel nicht gefunden.");
    if (item.food_item_id) {
        const existing = await get(`SELECT * FROM food_items WHERE id = ?`, [item.food_item_id]);
        if (existing) return existing;
    }

    const foodItem = await getOrCreateFoodItem(item.name, { calories_per_100g: item.calories_per_100g });
    await run(
        `UPDATE inventory_items SET food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [foodItem.id, foodItem.canonical_key, item.id]
    );
    return foodItem;
}

async function moveFoodAliasesToMaster(sourceFoodItemId, masterFoodItemId, additionalAliases = []) {
    const sourceId = Number(sourceFoodItemId);
    const masterId = Number(masterFoodItemId);
    if (!Number.isFinite(masterId)) return;

    for (const alias of additionalAliases) {
        if (alias) await addFoodAlias(masterId, alias);
    }

    if (!Number.isFinite(sourceId) || sourceId === masterId) return;

    const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [sourceId]);
    for (const alias of aliases) {
        await addFoodAlias(masterId, alias.alias_name);
    }
}

async function removeFoodItemIfUnused(foodItemId) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) return;
    const linkedInventory = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [id]);
    const linkedRecipe = await get(`SELECT id FROM recipe_ingredients WHERE food_item_id = ? LIMIT 1`, [id]);
    if (linkedInventory || linkedRecipe) return;
    await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [id]);
    await run(`DELETE FROM food_items WHERE id = ?`, [id]);
}

async function mergeInventoryItemsInternal(masterItemId, duplicateItemId) {
    const masterId = Number(masterItemId);
    const duplicateId = Number(duplicateItemId);
    if (!Number.isFinite(masterId) || !Number.isFinite(duplicateId) || masterId === duplicateId) {
        throw new Error("Zwei unterschiedliche Artikel sind erforderlich.");
    }

    const master = await get(`SELECT * FROM inventory_items WHERE id = ?`, [masterId]);
    const duplicate = await get(`SELECT * FROM inventory_items WHERE id = ?`, [duplicateId]);
    if (!master || !duplicate) throw new Error("Mindestens ein Artikel wurde nicht gefunden.");

    const masterFood = await ensureFoodItemForInventoryRow(master);
    const duplicateFood = await ensureFoodItemForInventoryRow(duplicate);

    await moveFoodAliasesToMaster(duplicateFood.id, masterFood.id, [
        duplicate.name,
        duplicate.recipe_match_name,
        duplicate.canonical_name,
        duplicateFood.display_name,
        duplicateFood.canonical_key
    ]);

    await run(
        `UPDATE recipe_ingredients
         SET food_item_id = ?, canonical_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [masterFood.id, masterFood.canonical_key, duplicateFood.id]
    );

    await run(
        `UPDATE inventory_batches SET item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?`,
        [masterId, duplicateId]
    );

    await run(
        `UPDATE inventory_items
         SET unit = COALESCE(NULLIF(unit, ''), ?),
             recipe_match_name = COALESCE(NULLIF(recipe_match_name, ''), ?),
             calories_per_100g = COALESCE(calories_per_100g, ?),
             food_item_id = ?,
             canonical_name = ?,
             name = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [duplicate.unit || "", duplicate.recipe_match_name || duplicate.name || "", duplicate.calories_per_100g ?? null, masterFood.id, masterFood.canonical_key, masterFood.display_name || master.name || "", masterId]
    );

    await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a IN (?, ?) OR item_id_b IN (?, ?)`, [masterId, duplicateId, masterId, duplicateId]);
    await run(`DELETE FROM inventory_items WHERE id = ?`, [duplicateId]);

    await removeFoodItemIfUnused(duplicateFood.id);

    return {
        master_item: { id: masterId, name: master.name },
        merged_item: { id: duplicateId, name: duplicate.name }
    };
}

async function mergeInventoryItems(masterItemId, duplicateItemId) {
    await run("BEGIN");
    try {
        const result = await mergeInventoryItemsInternal(masterItemId, duplicateItemId);
        await run("COMMIT");
        return result;
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function mergeInventoryItemsIntoMaster(masterItemId, duplicateItemIds = []) {
    const masterId = Number(masterItemId);
    const duplicateIds = Array.from(new Set((Array.isArray(duplicateItemIds) ? duplicateItemIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id !== masterId)));
    if (!Number.isFinite(masterId) || duplicateIds.length === 0) {
        throw new Error("Ein Zielartikel und mindestens eine Dublette sind erforderlich.");
    }

    await run("BEGIN");
    try {
        const mergedItems = [];
        for (const duplicateId of duplicateIds) {
            const result = await mergeInventoryItemsInternal(masterId, duplicateId);
            mergedItems.push(result.merged_item);
        }
        const master = await get(`SELECT * FROM inventory_items WHERE id = ?`, [masterId]);
        const masterFood = master?.food_item_id ? await get(`SELECT * FROM food_items WHERE id = ?`, [master.food_item_id]) : null;
        if (masterFood) {
            await run(
                `UPDATE inventory_items
                 SET name = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE food_item_id = ?`,
                [masterFood.display_name || master.name || "", masterFood.canonical_key || "", masterFood.id]
            );
        }

        await run("COMMIT");
        return {
            master_item: { id: masterId, name: masterFood?.display_name || master?.name || "Zielartikel" },
            merged_items: mergedItems
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function deleteInventoryItemCompletely(itemId) {
    const id = Number(itemId);
    if (!Number.isFinite(id)) throw new Error("Ungültiger Artikel.");
    const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [id]);
    if (!item) throw new Error("Artikel nicht gefunden.");

    const foodItemId = item.food_item_id ? Number(item.food_item_id) : null;

    await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [id]);
    await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a = ? OR item_id_b = ?`, [id, id]);
    await run(`DELETE FROM inventory_items WHERE id = ?`, [id]);

    if (foodItemId) {
        // Parsed recipe rows are derived data. They must not keep a hard pointer to a deleted admin item.
        await run(`UPDATE recipe_ingredients SET food_item_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [foodItemId]);

        const otherInventory = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [foodItemId]);
        const linkedRecipe = await get(`SELECT id FROM recipe_ingredients WHERE food_item_id = ? LIMIT 1`, [foodItemId]);

        if (!otherInventory && !linkedRecipe) {
            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [foodItemId]);
            await run(`DELETE FROM food_items WHERE id = ?`, [foodItemId]);
        }
    }

    return { id, name: item.name };
}


function getEffectiveInventoryCanonical(item) {
    const visibleKey = buildFoodIdentity(item?.name || "").canonical_key || "";
    return visibleKey || item?.canonical_name || "";
}

function isRecipeGeneratedWithoutStock(item) {
    return String(item?.source || "manual") === "recipe" && getInventoryStockTotal(item) <= 0;
}


async function getRecipeResyncOverrides() {
    const rows = await all(`SELECT * FROM admin_recipe_resync_overrides`);
    return rows || [];
}

function buildRecipeResyncOverrideMaps(overrides = []) {
    const linkByCanonical = new Map();
    const ignoreCreateByCanonical = new Set();
    const deleteByInventoryId = new Map();
    const ignoreDeleteByInventoryId = new Set();
    for (const row of overrides || []) {
        const type = String(row.override_type || "");
        const action = String(row.action || "");
        const canonical = String(row.canonical_key || "");
        const inventoryId = Number(row.inventory_item_id || 0);
        const targetId = Number(row.target_inventory_item_id || 0);
        if (type === "create" && canonical && action === "link_existing" && targetId) linkByCanonical.set(canonical, targetId);
        if (type === "create" && canonical && action === "ignore") ignoreCreateByCanonical.add(canonical);
        if (type === "delete" && inventoryId && action === "link_existing" && targetId) deleteByInventoryId.set(inventoryId, targetId);
        if (type === "delete" && inventoryId && action === "ignore") ignoreDeleteByInventoryId.add(inventoryId);
    }
    return { linkByCanonical, ignoreCreateByCanonical, deleteByInventoryId, ignoreDeleteByInventoryId };
}

function toRecipeResyncInventoryOption(item) {
    if (!item) return null;
    return {
        id: item.id,
        name: item.name,
        source: item.source || "manual",
        stock_total: getInventoryStockTotal(item),
        canonical_name: item.canonical_name || "",
        food_item_id: item.food_item_id || null
    };
}

function chooseInventoryItemForParsedTarget(parsedIngredient, inventoryItems, alreadyUsedIds = new Set()) {
    const targetKey = buildFoodIdentity(parsedIngredient?.food_name || parsedIngredient?.raw_text).canonical_key || "";
    if (!targetKey) return null;
    const targetName = normalizeVisibleFoodName(parsedIngredient?.food_name || "");
    const targetComparable = normalizeGermanText(targetName).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

    const candidates = inventoryItems
        .filter(item => !alreadyUsedIds.has(Number(item.id)))
        .filter(item => {
            const storedKey = item?.canonical_name || "";
            const effectiveKey = getEffectiveInventoryCanonical(item);
            return storedKey === targetKey || effectiveKey === targetKey;
        })
        .map(item => {
            const itemComparable = normalizeGermanText(item.name || "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
            let score = 0;
            if (itemComparable === targetComparable) score += 1000;
            if (getInventoryStockTotal(item) > 0) score += 500;
            if (String(item.source || "manual") !== "recipe") score += 250;
            if ((item.canonical_name || "") === targetKey) score += 50;
            score -= Math.abs(String(item.name || "").length - targetName.length);
            score -= Number(item.id) / 100000;
            return { item, score };
        })
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.item || null;
}

async function buildRecipeIngredientRebuildPlan() {
    const recipes = await all(`SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC`);
    const inventoryItems = await getAllInventoryItemsWithBatches();
    const overrides = await getRecipeResyncOverrides();
    const overrideMaps = buildRecipeResyncOverrideMaps(overrides);
    const inventoryOptions = inventoryItems
        .map(toRecipeResyncInventoryOption)
        .filter(Boolean)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
    const targetMap = new Map();
    const parsedRows = [];

    for (const recipe of recipes) {
        const parsed = parseIngredientsText(recipe.ingredients || "");
        parsed.forEach((ingredient, index) => {
            const canonicalKey = buildFoodIdentity(ingredient.food_name || ingredient.raw_text).canonical_key || "";
            if (!canonicalKey) return;
            if (!targetMap.has(canonicalKey)) {
                targetMap.set(canonicalKey, {
                    canonical_key: canonicalKey,
                    display_name: normalizeVisibleFoodName(ingredient.food_name || ingredient.raw_text),
                    unit: ingredient.unit || "g",
                    occurrences: []
                });
            }
            targetMap.get(canonicalKey).occurrences.push({
                recipe_id: recipe.id,
                recipe_name: recipe.name,
                sort_order: index,
                raw_text: ingredient.raw_text,
                food_name: ingredient.food_name,
                amount: ingredient.amount,
                unit: ingredient.unit
            });
            parsedRows.push({ recipe, ingredient, index, canonical_key: canonicalKey });
        });
    }

    const targetItems = [];
    const usedInventoryIds = new Set();
    for (const target of targetMap.values()) {
        const representative = {
            food_name: target.display_name,
            raw_text: target.occurrences[0]?.raw_text || target.display_name
        };
        let existing = null;
        let override = null;
        if (overrideMaps.ignoreCreateByCanonical.has(target.canonical_key)) {
            targetItems.push({
                ...target,
                action: "ignore",
                existing_item: null,
                override: { action: "ignore" },
                will_rename_existing: false
            });
            continue;
        }
        const overrideTargetId = overrideMaps.linkByCanonical.get(target.canonical_key);
        if (overrideTargetId) {
            existing = inventoryItems.find(item => Number(item.id) === Number(overrideTargetId)) || null;
            if (existing) override = { action: "link_existing", target_inventory_item_id: existing.id };
        }
        if (!existing) existing = chooseInventoryItemForParsedTarget(representative, inventoryItems, usedInventoryIds);
        if (existing) usedInventoryIds.add(Number(existing.id));
        targetItems.push({
            ...target,
            action: override?.action || (existing ? "link_existing" : "create_new"),
            existing_item: toRecipeResyncInventoryOption(existing),
            override,
            will_rename_existing: Boolean(existing && isRecipeGeneratedWithoutStock(existing) && normalizeGermanText(existing.name) !== normalizeGermanText(target.display_name))
        });
    }

    const targetKeys = new Set(Array.from(targetMap.keys()));
    const deleteCandidates = inventoryItems.filter(item => {
        if (!isRecipeGeneratedWithoutStock(item)) return false;
        if (usedInventoryIds.has(Number(item.id))) return false;
        if (overrideMaps.ignoreDeleteByInventoryId.has(Number(item.id))) return false;
        if (overrideMaps.deleteByInventoryId.has(Number(item.id))) return true;
        const storedKey = item.canonical_name || "";
        const effectiveKey = getEffectiveInventoryCanonical(item);
        // Wenn ein bestandsloser Auto-Artikel nur wegen alter Einheiten-Schreibweise effektiv zu einem Ziel gehört,
        // aber nicht als Zielartikel ausgewählt wurde, darf er gelöscht werden.
        if (targetKeys.has(storedKey) || targetKeys.has(effectiveKey)) return true;
        return true;
    });

    const fullRebuildDeleteCandidates = inventoryItems.filter(item =>
        getInventoryStockTotal(item) <= 0 && !usedInventoryIds.has(Number(item.id))
    );

    const protectedItems = inventoryItems.filter(item => !deleteCandidates.some(candidate => Number(candidate.id) === Number(item.id)));

    return {
        generated_at: new Date().toISOString(),
        counts: {
            recipes: recipes.length,
            parsed_ingredients: parsedRows.length,
            target_items: targetItems.length,
            link_existing: targetItems.filter(item => item.action === "link_existing").length,
            create_new: targetItems.filter(item => item.action === "create_new").length,
            rename_existing: targetItems.filter(item => item.will_rename_existing).length,
            delete_candidates: deleteCandidates.length,
            full_rebuild_delete_candidates: fullRebuildDeleteCandidates.length,
            protected_items: protectedItems.length
        },
        target_items: targetItems.sort((a, b) => a.display_name.localeCompare(b.display_name, "de")),
        delete_candidates: deleteCandidates.map(item => ({
            id: item.id,
            name: item.name,
            canonical_name: item.canonical_name || "",
            effective_canonical_name: getEffectiveInventoryCanonical(item),
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item)
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de")),
        full_rebuild_delete_candidates: fullRebuildDeleteCandidates.map(item => ({
            id: item.id,
            name: item.name,
            canonical_name: item.canonical_name || "",
            effective_canonical_name: getEffectiveInventoryCanonical(item),
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item)
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de")),
        inventory_options: inventoryOptions,
        overrides: overrides,
        protected_items: protectedItems.map(item => ({
            id: item.id,
            name: item.name,
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item),
            reason: getInventoryStockTotal(item) > 0 ? "Bestand vorhanden" : String(item.source || "manual") !== "recipe" ? "manuell gepflegt" : "wird als Zielartikel genutzt oder ist nicht sicher löschbar"
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
    };
}

async function applyRecipeIngredientRebuild(options = {}) {
    const recipes = await all(`SELECT * FROM recipes ORDER BY id ASC`);
    let createdItems = 0;
    let linkedIngredients = 0;
    let preservedIngredients = 0;
    let deletedItems = [];
    const deleteAllZeroStock = Boolean(options.deleteAllZeroStock);

    await run("BEGIN");
    try {
        const previousLinksByRecipe = new Map();
        const previousLinks = await all(
            `SELECT sort_order, raw_text, food_name, canonical_key, food_item_id, link_source, recipe_id
             FROM recipe_ingredients
             ORDER BY recipe_id ASC, sort_order ASC`
        );
        for (const link of previousLinks) {
            if (!previousLinksByRecipe.has(Number(link.recipe_id))) previousLinksByRecipe.set(Number(link.recipe_id), []);
            previousLinksByRecipe.get(Number(link.recipe_id)).push(link);
        }

        const overrides = await getRecipeResyncOverrides();
        const overrideMaps = buildRecipeResyncOverrideMaps(overrides);
        const usedInventoryIds = new Set();
        const usedFoodItemIds = new Set();

        for (const recipe of recipes) {
            const parsed = parseIngredientsText(recipe.ingredients || "");
            const previousRecipeLinks = previousLinksByRecipe.get(Number(recipe.id)) || [];

            await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [recipe.id]);

            for (const [index, ingredient] of parsed.entries()) {
                const canonicalKey = buildFoodIdentity(ingredient.food_name || ingredient.raw_text).canonical_key || "";
                if (canonicalKey && overrideMaps.ignoreCreateByCanonical.has(canonicalKey)) continue;

                let foodItem = null;
                let linkSource = "rebuilt";

                // Wichtigster Schutz: bestehende, einmal gesetzte Verknüpfungen bleiben erhalten.
                // Die Admin-Synchronisierung darf sie nicht durch neue Parse-Entscheidungen überschreiben.
                const preserved = await getPreservedFoodItemForIngredient(previousRecipeLinks, index, ingredient);
                if (preserved?.foodItem) {
                    foodItem = preserved.foodItem;
                    linkSource = preserved.linkSource || "preserved_resync";
                    preservedIngredients += 1;
                }

                // Admin-Override: nur wenn keine bestehende Verknüpfung erhalten werden konnte.
                if (!foodItem && canonicalKey) {
                    const overrideTargetId = overrideMaps.linkByCanonical.get(canonicalKey);
                    if (overrideTargetId) {
                        const targetItem = await get(`SELECT * FROM inventory_items WHERE id = ?`, [overrideTargetId]);
                        if (targetItem?.food_item_id) {
                            foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [targetItem.food_item_id]);
                            if (foodItem) linkSource = "admin_override";
                        }
                    }
                }

                // Sicherer automatischer Fallback: nur exakter Food-Item-/Alias-Treffer.
                if (!foodItem) {
                    foodItem = await findFoodItemByName(ingredient.food_name);
                    if (foodItem) linkSource = "auto_exact";
                }

                // Erst wenn wirklich kein bestehender Artikel/Alias/Preserve-Treffer existiert, neu anlegen.
                if (!foodItem) {
                    foodItem = await createDistinctFoodItemFromIngredient(ingredient.food_name, { aliasName: ingredient.raw_text });
                    linkSource = "new_from_resync";
                    createdItems += 1;
                }

                await addFoodAlias(foodItem.id, ingredient.raw_text);
                await addFoodAlias(foodItem.id, ingredient.food_name);
                await ensureInventoryItemForFoodItem(foodItem, ingredient, { source: linkSource === "admin_override" ? "manual" : "recipe" });

                const inventoryItem = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`, [foodItem.id]);
                if (inventoryItem?.id) usedInventoryIds.add(Number(inventoryItem.id));
                usedFoodItemIds.add(Number(foodItem.id));

                await run(
                    `INSERT INTO recipe_ingredients (recipe_id, raw_text, food_name, amount, unit, sort_order, updated_at, food_item_id, canonical_key, link_source)
                     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
                    [recipe.id, ingredient.raw_text, ingredient.food_name, ingredient.amount, ingredient.unit, index, foodItem.id, foodItem.canonical_key, linkSource]
                );
                linkedIngredients += 1;
            }
        }

        // Nach dem Neuaufbau dürfen nur ungenutzte, bestandslose Altlasten entfernt werden.
        // Alles, was aktuell über recipe_ingredients.food_item_id verknüpft ist, bleibt geschützt.
        const linkedFoodRows = await all(`SELECT DISTINCT food_item_id FROM recipe_ingredients WHERE food_item_id IS NOT NULL`);
        for (const row of linkedFoodRows) usedFoodItemIds.add(Number(row.food_item_id));

        const currentInventoryItems = await getAllInventoryItemsWithBatches();
        const deleteCandidates = currentInventoryItems.filter(item => {
            if (usedInventoryIds.has(Number(item.id))) return false;
            if (item.food_item_id && usedFoodItemIds.has(Number(item.food_item_id))) return false;
            if (getInventoryStockTotal(item) > 0) return false;
            if (deleteAllZeroStock) return true;
            return isRecipeGeneratedWithoutStock(item);
        });

        for (const item of deleteCandidates) {
            const targetOverrideId = overrideMaps.deleteByInventoryId.get(Number(item.id));
            if (targetOverrideId) {
                const targetItem = currentInventoryItems.find(candidate => Number(candidate.id) === Number(targetOverrideId));
                if (targetItem) {
                    if (targetItem.food_item_id && item.food_item_id && Number(targetItem.food_item_id) !== Number(item.food_item_id)) {
                        await consolidateFoodItems(targetItem.food_item_id, [item.food_item_id]);
                    }
                    if (targetItem.food_item_id) {
                        await addFoodAlias(targetItem.food_item_id, item.name);
                        await addFoodAlias(targetItem.food_item_id, item.recipe_match_name || item.name);
                    }
                }
            }
            await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [item.id]);
            await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a = ? OR item_id_b = ?`, [item.id, item.id]);
            await run(`DELETE FROM inventory_items WHERE id = ?`, [item.id]);
            deletedItems.push({ id: item.id, name: item.name, linked_to_inventory_item_id: targetOverrideId || null });
            if (item.food_item_id) await removeFoodItemIfUnused(item.food_item_id);
        }

        await run("COMMIT");
        return {
            created_items: createdItems,
            linked_ingredients: linkedIngredients,
            preserved_ingredients: preservedIngredients,
            deleted_items: deletedItems
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function buildInventoryCleanupPreview() {
    const inventoryItems = await getAllInventoryItemsWithBatches();
    const recipeIngredientRows = await all(`
        SELECT ri.*, r.name AS recipe_name
        FROM recipe_ingredients ri
        LEFT JOIN recipes r ON r.id = ri.recipe_id
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC
    `);
    const ignoredPairs = await all(`SELECT * FROM admin_ignored_duplicate_pairs`);
    const ignoredPairKeys = new Set(ignoredPairs.map(row => `${row.item_id_a}:${row.item_id_b}`));

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
        const protectionReasons = [];
        if (stockTotal > 0) protectionReasons.push("Bestand vorhanden");
        if (source !== "recipe") protectionReasons.push("manuell gepflegt");
        if (usedInRecipes.length > 0) protectionReasons.push("in Rezepten verwendet");
        return {
            id: item.id,
            name: item.name,
            canonical_name: canonical,
            source,
            stock_total: stockTotal,
            has_stock: stockTotal > 0,
            used_in_recipes: usedInRecipes,
            is_protected: protectionReasons.length > 0,
            protection_reasons: protectionReasons.length ? protectionReasons : ["automatisch erzeugt, ohne aktiven Schutz"],
            calories_per_100g: item.calories_per_100g === null || item.calories_per_100g === undefined ? null : Number(item.calories_per_100g)
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
            const activeItems = items.filter(item => true);
            const pair = activeItems.length === 2 ? normalizeDuplicatePairIds(activeItems[0].id, activeItems[1].id) : null;
            const isIgnored = Boolean(pair && ignoredPairKeys.has(`${pair[0]}:${pair[1]}`));
            const preferred = [...activeItems].sort((a, b) => {
                if (a.has_stock !== b.has_stock) return a.has_stock ? -1 : 1;
                if (a.source !== b.source) return a.source === "manual" ? -1 : 1;
                return String(a.name || "").length - String(b.name || "").length;
            })[0];
            const deleteCandidates = activeItems.filter(item => Number(item.id) !== Number(preferred.id));
            return {
                canonical_key,
                ignored: isIgnored,
                suggested_master: preferred,
                suggested_delete_candidates: deleteCandidates,
                candidates: activeItems,
                reason: "Gleicher normalisierter Lebensmittel-Schlüssel. Bitte fachlich prüfen, ob beide wirklich denselben Artikel meinen."
            };
        })
        .filter(group => !group.ignored);

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
        inventory_items: enrichedItems,
        possible_duplicates: possibleDuplicates,
        orphan_recipe_items: orphanRecipeItems,
        protected_items: protectedItems,
        ignored_duplicate_pairs: ignoredPairs
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
    const itemKey = item?.canonical_name || buildFoodIdentity(item?.name).canonical_key;

    // Nur exakte interne Identität oder exakter sichtbarer Name darf automatisch treffen.
    // Keine Teilstring-/Token-Matches mehr: "Salz" darf NICHT "gesalzen" treffen,
    // "Eier" darf NICHT "Eierstich" treffen.
    if (ingredientKey && itemKey && ingredientKey === itemKey) return 100;

    const ingredientComparable = normalizeGermanText(ingredientName)
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const candidateNames = [item?.name, item?.recipe_match_name].filter(Boolean);
    for (const candidate of candidateNames) {
        const candidateComparable = normalizeGermanText(candidate)
            .replace(/[^a-z0-9\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (candidateComparable && ingredientComparable && candidateComparable === ingredientComparable) return 100;
    }

    return 0;
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

        const linkedIngredients = await all(
            `SELECT
                ri.raw_text,
                ri.food_name,
                ri.amount,
                ri.unit,
                ri.sort_order,
                ri.food_item_id,
                fi.display_name AS food_display_name
             FROM recipe_ingredients ri
             LEFT JOIN food_items fi ON fi.id = ri.food_item_id
             WHERE ri.recipe_id = ?
             ORDER BY ri.sort_order ASC`,
            [req.params.id]
        );

        const parsedIngredients = linkedIngredients.length
            ? linkedIngredients.map(row => ({
                raw_text: row.raw_text || "",
                food_name: row.food_display_name || row.food_name || "",
                amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
                unit: row.unit || "",
                original_unit: row.unit || "",
                food_item_id: row.food_item_id || null
            }))
            : parseIngredientsText(recipe.ingredients || "");

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
            SELECT DISTINCT
                ii.id,
                COALESCE(NULLIF(fi.display_name, ''), ii.name) AS name,
                ii.name AS inventory_name,
                ii.unit,
                COALESCE(fi.calories_per_100g, ii.calories_per_100g) AS calories_per_100g,
                COALESCE(NULLIF(fi.canonical_key, ''), ii.canonical_name) AS canonical_name
            FROM inventory_items ii
            LEFT JOIN food_items fi ON fi.id = ii.food_item_id
            LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
            ORDER BY COALESCE(NULLIF(fi.display_name, ''), ii.name) COLLATE NOCASE ASC
        `);
        const filtered = rows.filter(row => {
            if (!q) return true;
            const haystack = [row.name, row.inventory_name, row.canonical_name].join(" ").toLowerCase();
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
        const originalQuery = String(req.query.q || "").trim();
        const parsed = parseIngredientLine(originalQuery);
        const lookupText = normalizeName(parsed?.food_name || originalQuery);
        if (!lookupText) return res.json({ query: originalQuery, lookup: lookupText, identity: null, exact: null, suggestions: [] });
        const identity = buildFoodIdentity(lookupText);
        const exactFoodItem = await findFoodItemByName(lookupText);
        const suggestions = await all(`
            SELECT fi.id, fi.display_name, fi.canonical_key, fi.calories_per_100g
            FROM food_items fi
            ORDER BY fi.display_name COLLATE NOCASE ASC
        `);
        const ranked = suggestions
            .map(item => {
                const displayComparable = normalizeGermanText(item.display_name)
                    .replace(/[^a-z0-9\s-]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                const lookupComparable = normalizeGermanText(lookupText)
                    .replace(/[^a-z0-9\s-]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                return {
                    ...item,
                    score: item.canonical_key === identity.canonical_key || displayComparable === lookupComparable ? 100 : 0
                };
            })
            .filter(item => item.score >= 100)
            .sort((a, b) => a.display_name.localeCompare(b.display_name, "de"))
            .slice(0, 5);
        res.json({ query: originalQuery, lookup: lookupText, identity, exact: normalizeFoodItemRow(exactFoodItem), suggestions: ranked });
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
        const row = await get(`
            SELECT
                ii.*,
                fi.display_name AS food_display_name,
                fi.canonical_key AS food_canonical_key,
                fi.calories_per_100g AS food_calories_per_100g
            FROM inventory_items ii
            LEFT JOIN food_items fi ON fi.id = ii.food_item_id
            WHERE ii.id = ?
        `, [req.params.id]);
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
        const updated = await getInventoryItemWithFoodName(item.id);
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

        const identity = buildFoodIdentity(validation.value.name);
        const canonicalKey = identity.canonical_key || canonicalizeIngredientName(validation.value.name);
        if (!canonicalKey) return res.status(400).json({ error: "Lebensmittel konnte nicht normalisiert werden." });

        let foodItem = null;

        if (existing.food_item_id) {
            // Eine Umbenennung im Inventar ist eine reine Pflege des bestehenden Stammdatensatzes.
            // Sie darf niemals auf einen anderen food_item wechseln, sonst verlieren Rezepte/Aliase ihre Zuordnung.
            const currentFoodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [existing.food_item_id]);
            if (currentFoodItem) {
                foodItem = await renameFoodItemStable(existing.food_item_id, validation.value.name, {
                    calories_per_100g: validation.value.calories_per_100g,
                    updateCanonical: true
                });
            } else {
                foodItem = await getOrCreateFoodItem(validation.value.name, {
                    calories_per_100g: validation.value.calories_per_100g
                });
            }
        } else {
            foodItem = await getOrCreateFoodItem(validation.value.name, {
                calories_per_100g: validation.value.calories_per_100g
            });
        }

        await addFoodAlias(foodItem.id, existing.name);
        await addFoodAlias(foodItem.id, validation.value.name);

        await run(
            `UPDATE inventory_items
             SET name = ?, unit = ?, notes = ?, calories_per_100g = ?, food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                foodItem.display_name || validation.value.name,
                validation.value.unit,
                validation.value.notes,
                validation.value.calories_per_100g,
                foodItem.id,
                foodItem.canonical_key || canonicalKey,
                req.params.id
            ]
        );

        await recalculateInventoryItem(req.params.id);
        const updated = await getInventoryItemWithFoodName(req.params.id);
        const batches = await getInventoryBatches(req.params.id);
        res.json(normalizeInventoryRow(updated, batches));
    } catch (error) {
        console.error("Fehler bei PUT /inventory/:id:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Aktualisieren des Inventar-Eintrags" });
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




async function getTableCountSafe(tableName) {
    try {
        const row = await get(`SELECT COUNT(*) AS count FROM ${tableName}`);
        return Number(row?.count || 0);
    } catch (error) {
        return 0;
    }
}

async function getDatabaseTableNames() {
    const rows = await all(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name COLLATE NOCASE ASC
    `);
    return rows.map(row => row.name);
}


function quoteSqlIdentifier(identifier) {
    const text = String(identifier || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
        throw new Error("Ungültiger Tabellenname.");
    }
    return `"${text.replace(/"/g, '""')}"`;
}

async function getAdminTablePreview(tableName, limit = 200) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const tableNames = await getDatabaseTableNames();
    if (!tableNames.includes(tableName)) {
        throw new Error("Tabelle wurde nicht gefunden.");
    }

    const quotedTable = quoteSqlIdentifier(tableName);
    const columns = await all(`PRAGMA table_info(${quotedTable})`);
    const columnNames = columns.map(col => col.name);

    let rows;
    if (tableName === "food_aliases") {
        rows = await all(`
            SELECT
                fa.id,
                fa.alias_name,
                fa.alias_key,
                fa.food_item_id,
                fi.display_name AS target_food_item,
                fi.canonical_key AS target_canonical_key,
                fa.created_at
            FROM food_aliases fa
            LEFT JOIN food_items fi ON fi.id = fa.food_item_id
            ORDER BY fa.alias_name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "food_items") {
        rows = await all(`
            SELECT
                fi.*,
                COUNT(DISTINCT fa.id) AS alias_count,
                COUNT(DISTINCT ri.id) AS recipe_ingredient_count,
                COALESCE(GROUP_CONCAT(DISTINCT hf.name), '') AS health_factors
            FROM food_items fi
            LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
            LEFT JOIN recipe_ingredients ri ON ri.food_item_id = fi.id
            LEFT JOIN food_item_health_factors fihf ON fihf.food_item_id = fi.id
            LEFT JOIN health_factors hf ON hf.id = fihf.health_factor_id
            GROUP BY fi.id
            ORDER BY fi.display_name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "recipe_ingredients") {
        rows = await all(`
            SELECT
                ri.id,
                ri.recipe_id,
                r.name AS recipe_name,
                ri.raw_text,
                ri.food_name,
                ri.amount,
                ri.unit,
                ri.food_item_id,
                fi.display_name AS linked_food_item,
                ri.link_source,
                ri.canonical_key,
                ri.sort_order,
                ri.updated_at
            FROM recipe_ingredients ri
            LEFT JOIN recipes r ON r.id = ri.recipe_id
            LEFT JOIN food_items fi ON fi.id = ri.food_item_id
            ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC, ri.id ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "inventory_items") {
        rows = await all(`
            SELECT
                ii.*,
                COALESCE(batch_stock.amount, 0) AS package_stock,
                COALESCE(loose_stock.amount, 0) AS loose_stock,
                COALESCE(batch_stock.amount, 0) + COALESCE(loose_stock.amount, 0) AS total_stock
            FROM inventory_items ii
            LEFT JOIN (
                SELECT item_id, SUM(remaining_quantity) AS amount
                FROM inventory_batches
                WHERE COALESCE(batch_type, 'package') != 'loose'
                GROUP BY item_id
            ) batch_stock ON batch_stock.item_id = ii.id
            LEFT JOIN (
                SELECT item_id, SUM(remaining_weight) AS amount
                FROM inventory_batches
                WHERE COALESCE(batch_type, '') = 'loose'
                GROUP BY item_id
            ) loose_stock ON loose_stock.item_id = ii.id
            ORDER BY ii.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "health_factors") {
        rows = await all(`
            SELECT
                hf.*,
                COUNT(DISTINCT fihf.food_item_id) AS food_item_count
            FROM health_factors hf
            LEFT JOIN food_item_health_factors fihf ON fihf.health_factor_id = hf.id
            GROUP BY hf.id
            ORDER BY hf.category COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "food_item_health_factors") {
        rows = await all(`
            SELECT
                fihf.id,
                fihf.food_item_id,
                fi.display_name AS food_item,
                fihf.health_factor_id,
                hf.name AS health_factor,
                hf.category,
                fihf.notes,
                fihf.created_at
            FROM food_item_health_factors fihf
            LEFT JOIN food_items fi ON fi.id = fihf.food_item_id
            LEFT JOIN health_factors hf ON hf.id = fihf.health_factor_id
            ORDER BY fi.display_name COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else {
        rows = await all(`SELECT * FROM ${quotedTable} LIMIT ?`, [safeLimit]);
    }

    return {
        table: tableName,
        limit: safeLimit,
        total_count: await getTableCountSafe(tableName),
        columns: rows.length ? Object.keys(rows[0]) : columnNames,
        rows
    };
}



async function getFoodItemAdminDetail(foodItemId) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) throw new Error("Ungültige Lebensmittel-ID.");
    const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
    if (!item) throw new Error("Lebensmittel-Stammsatz wurde nicht gefunden.");

    const aliases = await all(`
        SELECT id, alias_name, alias_key, created_at
        FROM food_aliases
        WHERE food_item_id = ?
        ORDER BY alias_name COLLATE NOCASE ASC
    `, [id]);

    const recipeIngredients = await all(`
        SELECT
            ri.id,
            ri.recipe_id,
            r.name AS recipe_name,
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.link_source,
            ri.sort_order,
            ri.updated_at
        FROM recipe_ingredients ri
        LEFT JOIN recipes r ON r.id = ri.recipe_id
        WHERE ri.food_item_id = ?
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC, ri.id ASC
    `, [id]);

    const inventoryItems = await all(`
        SELECT
            ii.id,
            ii.name,
            ii.unit,
            ii.source,
            ii.canonical_name,
            ii.calories_per_100g,
            COALESCE(batch_stock.amount, 0) AS package_stock,
            COALESCE(loose_stock.amount, 0) AS loose_stock,
            COALESCE(batch_stock.amount, 0) + COALESCE(loose_stock.amount, 0) AS total_stock
        FROM inventory_items ii
        LEFT JOIN (
            SELECT item_id, SUM(remaining_quantity) AS amount
            FROM inventory_batches
            WHERE COALESCE(batch_type, 'package') != 'loose'
            GROUP BY item_id
        ) batch_stock ON batch_stock.item_id = ii.id
        LEFT JOIN (
            SELECT item_id, SUM(remaining_weight) AS amount
            FROM inventory_batches
            WHERE COALESCE(batch_type, '') = 'loose'
            GROUP BY item_id
        ) loose_stock ON loose_stock.item_id = ii.id
        WHERE ii.food_item_id = ?
        ORDER BY ii.name COLLATE NOCASE ASC
    `, [id]);

    const healthFactors = await all(`
        SELECT
            hf.id,
            hf.name,
            hf.category,
            hf.description,
            fihf.notes
        FROM food_item_health_factors fihf
        JOIN health_factors hf ON hf.id = fihf.health_factor_id
        WHERE fihf.food_item_id = ?
        ORDER BY hf.category COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
    `, [id]);

    return { item, aliases, recipe_ingredients: recipeIngredients, inventory_items: inventoryItems, health_factors: healthFactors };
}

async function getAdminFoodItemOptions() {
    return all(`
        SELECT
            fi.id,
            fi.display_name,
            fi.canonical_key,
            COUNT(DISTINCT fa.id) AS alias_count,
            COUNT(DISTINCT ri.id) AS recipe_ingredient_count
        FROM food_items fi
        LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
        LEFT JOIN recipe_ingredients ri ON ri.food_item_id = fi.id
        GROUP BY fi.id
        ORDER BY fi.display_name COLLATE NOCASE ASC
    `);
}

async function buildAdminSystemStatus() {
    const [recipes, recipeIngredients, inventoryItems, inventoryBatches, foodItems, foodAliases, mealPlans, ignoredDuplicatePairs] = await Promise.all([
        getTableCountSafe('recipes'), getTableCountSafe('recipe_ingredients'), getTableCountSafe('inventory_items'), getTableCountSafe('inventory_batches'), getTableCountSafe('food_items'), getTableCountSafe('food_aliases'), getTableCountSafe('meal_plans'), getTableCountSafe('admin_ignored_duplicate_pairs')
    ]);
    const looseCountRow = await get(`SELECT COUNT(*) AS count FROM inventory_batches WHERE COALESCE(batch_type, '') = 'loose'`).catch(() => ({ count: 0 }));
    const inventoryLooseStock = Number(looseCountRow?.count || 0);
    const stockRows = await all(`
        SELECT item_id, SUM(remaining_weight) AS amount FROM inventory_batches WHERE COALESCE(batch_type, '') = 'loose' GROUP BY item_id
        UNION ALL
        SELECT item_id, SUM(remaining_quantity) AS amount FROM inventory_batches WHERE COALESCE(batch_type, 'package') != 'loose' GROUP BY item_id
    `).catch(() => []);
    const itemStock = new Map();
    stockRows.forEach(row => {
        const id = Number(row.item_id);
        itemStock.set(id, (itemStock.get(id) || 0) + Number(row.amount || 0));
    });
    const itemsWithStock = Array.from(itemStock.values()).filter(value => value > 0).length;
    const linkedRow = await get(`SELECT COUNT(*) AS count FROM recipe_ingredients WHERE food_item_id IS NOT NULL`).catch(() => ({ count: 0 }));
    const linkedRecipeIngredients = Number(linkedRow?.count || 0);
    const unlinkedRecipeIngredients = Math.max(0, recipeIngredients - linkedRecipeIngredients);
    const tableNames = await getDatabaseTableNames();
    const tableCounts = [];
    for (const table of tableNames) {
        tableCounts.push({ name: table, count: await getTableCountSafe(table) });
    }
    return {
        generated_at: new Date().toISOString(),
        database_path: dbPath,
        counts: {
            recipes,
            recipe_ingredients: recipeIngredients,
            linked_recipe_ingredients: linkedRecipeIngredients,
            unlinked_recipe_ingredients: unlinkedRecipeIngredients,
            inventory_items: inventoryItems,
            inventory_items_with_stock: itemsWithStock,
            inventory_batches: inventoryBatches,
            inventory_loose_stock: inventoryLooseStock,
            food_items: foodItems,
            food_aliases: foodAliases,
            meal_plans: mealPlans,
            ignored_duplicate_pairs: ignoredDuplicatePairs
        },
        tables: tableCounts
    };
}

async function buildFullJsonBackup() {
    const tableNames = await getDatabaseTableNames();
    const tables = {};
    for (const table of tableNames) {
        tables[table] = await all(`SELECT * FROM ${table}`);
    }
    return {
        app: 'Food Calculator',
        format: 'foodcalculator-json-backup-v1',
        exported_at: new Date().toISOString(),
        database_path: dbPath,
        tables
    };
}

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

app.delete("/admin/inventory-items/:id", async (req, res) => {
    try {
        const deleted = await deleteInventoryItemCompletely(req.params.id);
        const preview = await buildInventoryCleanupPreview();
        res.json({ success: true, deleted_item: deleted, preview });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/inventory-items/:id:", error.message);
        res.status(500).json({ error: error.message || "Artikel konnte nicht gelöscht werden." });
    }
});


app.post("/admin/duplicates/merge", async (req, res) => {
    try {
        const masterItemId = Number(req.body?.master_item_id);
        const duplicateItemId = Number(req.body?.duplicate_item_id);
        const merged = await mergeInventoryItems(masterItemId, duplicateItemId);
        const preview = await buildInventoryCleanupPreview();
        res.json({ success: true, merged, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicates/merge:", error.message);
        res.status(500).json({ error: error.message || "Dubletten konnten nicht zusammengeführt werden." });
    }
});

app.post("/admin/duplicates/merge-all", async (req, res) => {
    try {
        const masterItemId = Number(req.body?.master_item_id);
        const duplicateItemIds = Array.isArray(req.body?.duplicate_item_ids) ? req.body.duplicate_item_ids : [];
        const merged = await mergeInventoryItemsIntoMaster(masterItemId, duplicateItemIds);
        const preview = await buildInventoryCleanupPreview();
        res.json({ success: true, merged, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicates/merge-all:", error.message);
        res.status(500).json({ error: error.message || "Dubletten konnten nicht gesammelt zusammengeführt werden." });
    }
});

app.post("/admin/duplicate-keep-both", async (req, res) => {
    try {
        const pair = normalizeDuplicatePairIds(req.body?.item_id_a, req.body?.item_id_b);
        if (!pair) return res.status(400).json({ error: "Zwei unterschiedliche Artikel sind erforderlich." });
        const itemA = await get(`SELECT * FROM inventory_items WHERE id = ?`, [pair[0]]);
        const itemB = await get(`SELECT * FROM inventory_items WHERE id = ?`, [pair[1]]);
        if (!itemA || !itemB) return res.status(404).json({ error: "Mindestens ein Artikel wurde nicht gefunden." });
        const canonicalKey = itemA.canonical_name || itemB.canonical_name || buildFoodIdentity(itemA.name || itemB.name).canonical_key || "";
        await run(
            `INSERT OR IGNORE INTO admin_ignored_duplicate_pairs (item_id_a, item_id_b, canonical_key) VALUES (?, ?, ?)`,
            [pair[0], pair[1], canonicalKey]
        );
        const preview = await buildInventoryCleanupPreview();
        res.json({ success: true, ignored_pair: { item_id_a: pair[0], item_id_b: pair[1] }, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicate-keep-both:", error.message);
        res.status(500).json({ error: "Dubletten-Entscheidung konnte nicht gespeichert werden." });
    }
});


app.post("/admin/recipe-resync-overrides", async (req, res) => {
    try {
        const overrideType = String(req.body?.override_type || "").trim();
        const canonicalKey = String(req.body?.canonical_key || "").trim();
        const inventoryItemId = req.body?.inventory_item_id === null || req.body?.inventory_item_id === undefined ? null : Number(req.body.inventory_item_id);
        const targetInventoryItemId = req.body?.target_inventory_item_id === null || req.body?.target_inventory_item_id === undefined ? null : Number(req.body.target_inventory_item_id);
        const action = String(req.body?.action || "").trim();
        const note = String(req.body?.note || "").trim();

        if (!["create", "delete"].includes(overrideType)) return res.status(400).json({ error: "Ungültiger Override-Typ." });
        if (!["link_existing", "ignore", "clear"].includes(action)) return res.status(400).json({ error: "Ungültige Aktion." });
        if (overrideType === "create" && !canonicalKey) return res.status(400).json({ error: "Canonical Key fehlt." });
        if (overrideType === "delete" && !Number.isFinite(inventoryItemId)) return res.status(400).json({ error: "Inventarartikel fehlt." });
        if (action === "link_existing" && !Number.isFinite(targetInventoryItemId)) return res.status(400).json({ error: "Zielartikel fehlt." });
        if (overrideType === "delete" && action === "link_existing" && Number(inventoryItemId) === Number(targetInventoryItemId)) {
            return res.status(400).json({ error: "Ein Löschkandidat kann nicht mit sich selbst verknüpft werden." });
        }

        const inventoryKey = Number.isFinite(inventoryItemId) ? inventoryItemId : 0;
        if (action === "clear") {
            await run(
                `DELETE FROM admin_recipe_resync_overrides WHERE override_type = ? AND canonical_key = ? AND inventory_item_id = ?`,
                [overrideType, canonicalKey, inventoryKey]
            );
        } else {
            await run(
                `INSERT INTO admin_recipe_resync_overrides (override_type, canonical_key, inventory_item_id, target_inventory_item_id, action, note, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(override_type, canonical_key, inventory_item_id)
                 DO UPDATE SET target_inventory_item_id = excluded.target_inventory_item_id, action = excluded.action, note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
                [overrideType, canonicalKey, inventoryKey, Number.isFinite(targetInventoryItemId) ? targetInventoryItemId : null, action, note]
            );
        }

        res.json({ success: true, preview: await buildRecipeIngredientRebuildPlan() });
    } catch (error) {
        console.error("Fehler bei POST /admin/recipe-resync-overrides:", error.message);
        res.status(500).json({ error: error.message || "Override konnte nicht gespeichert werden." });
    }
});

app.get("/admin/recipe-resync-preview", async (req, res) => {
    try {
        const preview = await buildRecipeIngredientRebuildPlan();
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/recipe-resync-preview:", error.message);
        res.status(500).json({ error: "Rezept-Zutaten-Synchronisierung konnte nicht analysiert werden." });
    }
});

app.post("/admin/recipe-resync-apply", async (req, res) => {
    try {
        const result = await applyRecipeIngredientRebuild({ deleteAllZeroStock: Boolean(req.body?.delete_all_zero_stock) });
        const preview = await buildRecipeIngredientRebuildPlan();
        const cleanupPreview = await buildInventoryCleanupPreview();
        res.json({ success: true, result, preview, cleanup_preview: cleanupPreview });
    } catch (error) {
        console.error("Fehler bei POST /admin/recipe-resync-apply:", error.message);
        res.status(500).json({ error: error.message || "Rezept-Zutaten konnten nicht neu aufgebaut werden." });
    }
});







async function getHealthFactorOptions() {
    return all(`
        SELECT id, name, category, description
        FROM health_factors
        ORDER BY category COLLATE NOCASE ASC, name COLLATE NOCASE ASC
    `);
}

async function replaceFoodItemHealthFactors(foodItemId, healthFactorIds = []) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) throw new Error("Ungültige Lebensmittel-ID.");
    const uniqueIds = Array.from(new Set((Array.isArray(healthFactorIds) ? healthFactorIds : [])
        .map(Number)
        .filter(Number.isFinite)));
    await run(`DELETE FROM food_item_health_factors WHERE food_item_id = ?`, [id]);
    for (const factorId of uniqueIds) {
        const factor = await get(`SELECT id FROM health_factors WHERE id = ?`, [factorId]);
        if (factor) {
            await run(`INSERT OR IGNORE INTO food_item_health_factors (food_item_id, health_factor_id) VALUES (?, ?)`, [id, factorId]);
        }
    }
}

async function getFoodItemStockTotalByFoodItem(foodItemId) {
    const row = await get(`
        SELECT
            COALESCE(SUM(CASE WHEN COALESCE(ib.batch_type, 'package') = 'loose' THEN COALESCE(ib.remaining_weight, 0) ELSE COALESCE(ib.remaining_quantity, 0) END), 0) AS total_stock
        FROM inventory_items ii
        LEFT JOIN inventory_batches ib ON ib.item_id = ii.id
        WHERE ii.food_item_id = ?
    `, [Number(foodItemId)]);
    return Number(row?.total_stock || 0);
}

app.get("/admin/health-factors", async (req, res) => {
    try {
        res.json({ factors: await getHealthFactorOptions() });
    } catch (error) {
        console.error("Fehler bei GET /admin/health-factors:", error.message);
        res.status(500).json({ error: "Gesundheits-/Diätfaktoren konnten nicht geladen werden." });
    }
});

app.post("/admin/health-factors", async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        const category = String(req.body?.category || "").trim();
        const description = String(req.body?.description || "").trim();
        if (!name) return res.status(400).json({ error: "Name ist erforderlich." });
        await run(`INSERT INTO health_factors (name, category, description, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, [name, category, description]);
        res.json({ success: true, factors: await getHealthFactorOptions(), table: await getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei POST /admin/health-factors:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Faktor existiert bereits." : (error.message || "Faktor konnte nicht angelegt werden.") });
    }
});

app.put("/admin/health-factors/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body?.name || "").trim();
        const category = String(req.body?.category || "").trim();
        const description = String(req.body?.description || "").trim();
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Faktor." });
        if (!name) return res.status(400).json({ error: "Name ist erforderlich." });
        const existing = await get(`SELECT id FROM health_factors WHERE id = ?`, [id]);
        if (!existing) return res.status(404).json({ error: "Faktor wurde nicht gefunden." });
        await run(`UPDATE health_factors SET name = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [name, category, description, id]);
        res.json({ success: true, factors: await getHealthFactorOptions(), table: await getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/health-factors/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Faktor existiert bereits." : (error.message || "Faktor konnte nicht aktualisiert werden.") });
    }
});

app.delete("/admin/health-factors/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Faktor." });
        await run(`DELETE FROM food_item_health_factors WHERE health_factor_id = ?`, [id]);
        const result = await run(`DELETE FROM health_factors WHERE id = ?`, [id]);
        if (result.changes === 0) return res.status(404).json({ error: "Faktor wurde nicht gefunden." });
        res.json({ success: true, factors: await getHealthFactorOptions(), table: await getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/health-factors/:id:", error.message);
        res.status(500).json({ error: error.message || "Faktor konnte nicht gelöscht werden." });
    }
});

app.put("/admin/food-items/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const displayName = String(req.body?.display_name || "").trim();
        const caloriesRaw = req.body?.calories_per_100g;
        const calories = caloriesRaw === null || caloriesRaw === undefined || caloriesRaw === "" ? null : Number(caloriesRaw);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        if (!displayName) return res.status(400).json({ error: "Anzeigename ist erforderlich." });
        if (calories !== null && (!Number.isFinite(calories) || calories < 0)) return res.status(400).json({ error: "kcal / 100 g ist ungültig." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        await renameFoodItemStable(id, displayName, { calories_per_100g: calories, updateCanonical: true });
        await replaceFoodItemHealthFactors(id, req.body?.health_factor_ids || []);
        res.json({ success: true, detail: await getFoodItemAdminDetail(id), table: await getAdminTablePreview("food_items") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/food-items/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Stammsatz konnte nicht gespeichert werden." });
    }
});

app.delete("/admin/food-items/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        const totalStock = await getFoodItemStockTotalByFoodItem(id);
        if (totalStock > 0) return res.status(409).json({ error: "Dieser Stammsatz hat Bestand und kann nicht direkt gelöscht werden. Bestand zuerst verschieben oder Stammsatz konsolidieren." });
        await run("BEGIN");
        try {
            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [id]);
            await run(`DELETE FROM food_item_health_factors WHERE food_item_id = ?`, [id]);
            await run(`UPDATE recipe_ingredients SET food_item_id = NULL, canonical_key = '', link_source = 'manual_unlinked', updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [id]);
            await run(`UPDATE inventory_items SET food_item_id = NULL, canonical_name = '', updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [id]);
            await run(`DELETE FROM food_items WHERE id = ?`, [id]);
            await run("COMMIT");
        } catch (inner) {
            await run("ROLLBACK");
            throw inner;
        }
        res.json({ success: true, deleted_item: item, table: await getAdminTablePreview("food_items"), system_status: await buildAdminSystemStatus() });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/food-items/:id:", error.message);
        const status = /Bestand|nicht gefunden|Ungültiger/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Stammsatz konnte nicht gelöscht werden." });
    }
});

app.get("/admin/food-items", async (req, res) => {
    try {
        res.json({ items: await getAdminFoodItemOptions() });
    } catch (error) {
        console.error("Fehler bei GET /admin/food-items:", error.message);
        res.status(500).json({ error: "Lebensmittel-Stammdaten konnten nicht geladen werden." });
    }
});

app.get("/admin/food-items/:id/detail", async (req, res) => {
    try {
        res.json(await getFoodItemAdminDetail(req.params.id));
    } catch (error) {
        console.error("Fehler bei GET /admin/food-items/:id/detail:", error.message);
        const status = /nicht gefunden|Ungültige/.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Details konnten nicht geladen werden." });
    }
});

app.post("/admin/food-aliases", async (req, res) => {
    try {
        const foodItemId = Number(req.body?.food_item_id);
        const aliasName = String(req.body?.alias_name || "").trim();
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ziel-Lebensmittel ist erforderlich." });
        if (!aliasName) return res.status(400).json({ error: "Alias ist erforderlich." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Ziel-Lebensmittel wurde nicht gefunden." });
        await addFoodAlias(foodItemId, aliasName);
        res.json({ success: true, detail: await getFoodItemAdminDetail(foodItemId), table: await getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei POST /admin/food-aliases:", error.message);
        res.status(500).json({ error: error.message || "Alias konnte nicht angelegt werden." });
    }
});

app.put("/admin/food-aliases/:id", async (req, res) => {
    try {
        const aliasId = Number(req.params.id);
        const foodItemId = Number(req.body?.food_item_id);
        const aliasName = String(req.body?.alias_name || "").trim();
        if (!Number.isFinite(aliasId)) return res.status(400).json({ error: "Ungültiger Alias." });
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ziel-Lebensmittel ist erforderlich." });
        if (!aliasName) return res.status(400).json({ error: "Alias ist erforderlich." });
        const alias = await get(`SELECT * FROM food_aliases WHERE id = ?`, [aliasId]);
        if (!alias) return res.status(404).json({ error: "Alias wurde nicht gefunden." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Ziel-Lebensmittel wurde nicht gefunden." });
        const aliasKey = buildFoodIdentity(aliasName).canonical_key || aliasName.toLowerCase().trim();
        await run(`UPDATE food_aliases SET food_item_id = ?, alias_name = ?, alias_key = ? WHERE id = ?`, [foodItemId, aliasName, aliasKey, aliasId]);
        res.json({ success: true, detail: await getFoodItemAdminDetail(foodItemId), table: await getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/food-aliases/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Alias existiert für das Ziel-Lebensmittel bereits." : (error.message || "Alias konnte nicht aktualisiert werden.") });
    }
});

async function consolidateFoodItems(masterFoodItemId, duplicateFoodItemIds = []) {
    const masterId = Number(masterFoodItemId);
    const duplicateIds = Array.from(new Set((Array.isArray(duplicateFoodItemIds) ? duplicateFoodItemIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id !== masterId)));

    if (!Number.isFinite(masterId) || duplicateIds.length === 0) {
        throw new Error("Ein Master-Lebensmittel und mindestens eine Dublette sind erforderlich.");
    }

    await run("BEGIN");
    try {
        const master = await get(`SELECT * FROM food_items WHERE id = ?`, [masterId]);
        if (!master) throw new Error("Master-Lebensmittel wurde nicht gefunden.");

        const duplicates = [];
        for (const duplicateId of duplicateIds) {
            const duplicate = await get(`SELECT * FROM food_items WHERE id = ?`, [duplicateId]);
            if (!duplicate) continue;
            duplicates.push(duplicate);
        }
        if (!duplicates.length) throw new Error("Keine gültigen Dubletten gefunden.");

        let masterInventory = await get(`SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`, [masterId]);

        if (!masterInventory) {
            const firstDuplicateInventory = await get(
                `SELECT * FROM inventory_items WHERE food_item_id IN (${duplicates.map(() => "?").join(",")}) ORDER BY id ASC LIMIT 1`,
                duplicates.map(d => d.id)
            );
            if (firstDuplicateInventory) {
                await run(
                    `UPDATE inventory_items
                     SET food_item_id = ?, canonical_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [masterId, master.canonical_key || "", master.display_name || firstDuplicateInventory.name || "", firstDuplicateInventory.id]
                );
                masterInventory = await get(`SELECT * FROM inventory_items WHERE id = ?`, [firstDuplicateInventory.id]);
            }
        }

        const merged = [];
        for (const duplicate of duplicates) {
            await addFoodAlias(masterId, duplicate.display_name);
            await addFoodAlias(masterId, duplicate.canonical_key);

            const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [duplicate.id]);
            for (const alias of aliases) await addFoodAlias(masterId, alias.alias_name);

            await run(
                `UPDATE recipe_ingredients
                 SET food_item_id = ?, canonical_key = ?, link_source = CASE WHEN link_source = 'manual_unlinked' THEN 'manual' ELSE COALESCE(NULLIF(link_source, ''), 'manual') END, updated_at = CURRENT_TIMESTAMP
                 WHERE food_item_id = ?`,
                [masterId, master.canonical_key || "", duplicate.id]
            );

            const duplicateInventoryRows = await all(`SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC`, [duplicate.id]);
            for (const inv of duplicateInventoryRows) {
                if (masterInventory && Number(inv.id) !== Number(masterInventory.id)) {
                    await run(`UPDATE inventory_batches SET item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?`, [masterInventory.id, inv.id]);
                    await run(`DELETE FROM inventory_items WHERE id = ?`, [inv.id]);
                    await recalculateInventoryItem(masterInventory.id);
                } else {
                    await run(
                        `UPDATE inventory_items
                         SET food_item_id = ?, canonical_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [masterId, master.canonical_key || "", master.display_name || inv.name || "", inv.id]
                    );
                    masterInventory = await get(`SELECT * FROM inventory_items WHERE id = ?`, [inv.id]);
                }
            }

            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [duplicate.id]);
            await run(`DELETE FROM food_items WHERE id = ?`, [duplicate.id]);
            merged.push({ id: duplicate.id, display_name: duplicate.display_name, canonical_key: duplicate.canonical_key });
        }

        await run(
            `UPDATE inventory_items
             SET name = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
             WHERE food_item_id = ?`,
            [master.display_name || "", master.canonical_key || "", masterId]
        );

        await run("COMMIT");
        return {
            master: await getFoodItemAdminDetail(masterId),
            merged
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}


app.delete("/admin/food-aliases/:id", async (req, res) => {
    try {
        const aliasId = Number(req.params.id);
        const alias = await get(`SELECT * FROM food_aliases WHERE id = ?`, [aliasId]);
        if (!alias) return res.status(404).json({ error: "Alias wurde nicht gefunden." });
        await run(`DELETE FROM food_aliases WHERE id = ?`, [aliasId]);
        res.json({ success: true, deleted_alias: alias, detail: await getFoodItemAdminDetail(alias.food_item_id), table: await getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/food-aliases/:id:", error.message);
        res.status(500).json({ error: error.message || "Alias konnte nicht gelöscht werden." });
    }
});

app.post("/admin/food-items/consolidate", async (req, res) => {
    try {
        const result = await consolidateFoodItems(req.body?.master_food_item_id, req.body?.duplicate_food_item_ids || []);
        res.json({
            success: true,
            result,
            table: await getAdminTablePreview("food_items"),
            system_status: await buildAdminSystemStatus()
        });
    } catch (error) {
        console.error("Fehler bei POST /admin/food-items/consolidate:", error.message);
        res.status(500).json({ error: error.message || "Lebensmittel-Stammdaten konnten nicht konsolidiert werden." });
    }
});


app.put("/admin/recipe-ingredients/:id/link", async (req, res) => {
    try {
        const ingredientId = Number(req.params.id);
        const rawFoodItemId = req.body?.food_item_id;
        const ingredient = await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]);
        if (!ingredient) return res.status(404).json({ error: "Rezept-Zutat wurde nicht gefunden." });

        if (rawFoodItemId === null || rawFoodItemId === "" || rawFoodItemId === undefined) {
            await run(`UPDATE recipe_ingredients SET food_item_id = NULL, canonical_key = '', link_source = 'manual_unlinked', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [ingredientId]);
            return res.json({ success: true, ingredient: await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]) });
        }

        const foodItemId = Number(rawFoodItemId);
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        await run(`UPDATE recipe_ingredients SET food_item_id = ?, canonical_key = ?, link_source = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [foodItemId, item.canonical_key || '', ingredientId]);
        res.json({ success: true, ingredient: await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]), detail: await getFoodItemAdminDetail(foodItemId) });
    } catch (error) {
        console.error("Fehler bei PUT /admin/recipe-ingredients/:id/link:", error.message);
        res.status(500).json({ error: error.message || "Rezept-Zutat konnte nicht verknüpft werden." });
    }
});

app.get("/admin/system-status", async (req, res) => {
    try {
        res.json(await buildAdminSystemStatus());
    } catch (error) {
        console.error("Fehler bei GET /admin/system-status:", error.message);
        res.status(500).json({ error: "Systemstatus konnte nicht geladen werden" });
    }
});


app.get("/admin/tables/:tableName", async (req, res) => {
    try {
        const preview = await getAdminTablePreview(req.params.tableName, req.query.limit);
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/tables/:tableName:", error.message);
        const status = /nicht gefunden|Ungültiger/.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message || "Tabelle konnte nicht geladen werden." });
    }
});

app.get("/admin/backup/export", async (req, res) => {
    try {
        const backup = await buildFullJsonBackup();
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="foodcalculator-backup-${date}.json"`);
        res.json(backup);
    } catch (error) {
        console.error("Fehler bei GET /admin/backup/export:", error.message);
        res.status(500).json({ error: "Backup konnte nicht erstellt werden" });
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
