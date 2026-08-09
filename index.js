const app = require("./src/app");
const { dbPath, run, get, all } = require("./src/database/database");
const { addColumnIfMissing } = require("./src/database/schema");
const { backfillInventoryBatchDefaults } = require("./src/database/inventoryMigrations");
const ingredients = require("./src/shared/ingredients");
const foodItemService = require("./src/modules/foodItems/service");
const inventoryService = require("./src/modules/inventory/service");
const inventoryRoutes = require("./src/modules/inventory/routes");
const mealPlanRoutes = require("./src/modules/mealPlans/routes");
const recipeQueryRoutes = require("./src/modules/recipes/queryRoutes");
const recipeWriteRoutes = require("./src/modules/recipes/writeRoutes");
const recipeSyncService = require("./src/modules/recipes/syncService");


const normalizeVisibleFoodName = ingredients.normalizeVisibleFoodName;
const normalizeGermanText = ingredients.normalizeGermanText;
const buildFoodIdentity = ingredients.buildFoodIdentity;
const canonicalizeIngredientName = ingredients.canonicalizeIngredientName;
const parseIngredientLine = ingredients.parseIngredientLine;
const parseIngredientsText = ingredients.parseIngredientsText;

const PORT = process.env.PORT || 3000;

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
    await inventoryService.migrateInventoryBatches();
    await migrateFoodItems();
    // Wichtig: Der Rezept-Zutaten-Sync darf beim Serverstart keine bestehenden
    // Verknüpfungen löschen und neu anlegen. Sonst entstehen bei jedem Neustart
    // neue Lebensmittel-/Inventarartikel aus denselben Rezeptzutaten.
    await recipeSyncService.backfillMissingRecipeIngredientLinks();
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





async function migrateFoodItems() {
    const inventoryRows = await all(`SELECT * FROM inventory_items`);
    for (const row of inventoryRows) {
        const foodItem = await foodItemService.getOrCreateFoodItem(row.name, { calories_per_100g: row.calories_per_100g });
        await run(
            `UPDATE inventory_items SET food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [foodItem.id, foodItem.canonical_key, row.id]
        );
        if (row.recipe_match_name) await foodItemService.addFoodAlias(foodItem.id, row.recipe_match_name);
    }
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

app.use(inventoryRoutes);
app.use(mealPlanRoutes);
app.use(recipeQueryRoutes);
app.use(recipeWriteRoutes);

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

    const foodItem = await foodItemService.getOrCreateFoodItem(item.name, { calories_per_100g: item.calories_per_100g });
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
        if (alias) await foodItemService.addFoodAlias(masterId, alias);
    }

    if (!Number.isFinite(sourceId) || sourceId === masterId) return;

    const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [sourceId]);
    for (const alias of aliases) {
        await foodItemService.addFoodAlias(masterId, alias.alias_name);
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
    const inventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
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
        parsed.forEach(ingredient => {
            const index = ingredient.line_index;
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

            for (const ingredient of parsed) {
                const index = ingredient.line_index;
                const canonicalKey = buildFoodIdentity(ingredient.food_name || ingredient.raw_text).canonical_key || "";
                if (canonicalKey && overrideMaps.ignoreCreateByCanonical.has(canonicalKey)) continue;

                let foodItem = null;
                let linkSource = "rebuilt";

                // Wichtigster Schutz: bestehende, einmal gesetzte Verknüpfungen bleiben erhalten.
                // Die Admin-Synchronisierung darf sie nicht durch neue Parse-Entscheidungen überschreiben.
                const preserved = await recipeSyncService.getPreservedFoodItemForIngredient(previousRecipeLinks, index, ingredient);
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
                    foodItem = await foodItemService.findFoodItemByName(ingredient.food_name);
                    if (foodItem) linkSource = "auto_exact";
                }

                // Erst wenn wirklich kein bestehender Artikel/Alias/Preserve-Treffer existiert, neu anlegen.
                if (!foodItem) {
                    foodItem = await foodItemService.createDistinctFoodItemFromIngredient(ingredient.food_name, { aliasName: ingredient.raw_text });
                    linkSource = "new_from_resync";
                    createdItems += 1;
                }

                await foodItemService.addFoodAlias(foodItem.id, ingredient.raw_text);
                await foodItemService.addFoodAlias(foodItem.id, ingredient.food_name);
                await recipeSyncService.ensureInventoryItemForFoodItem(foodItem, ingredient, { source: linkSource === "admin_override" ? "manual" : "recipe" });

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

        const currentInventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
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
                        await foodItemService.addFoodAlias(targetItem.food_item_id, item.name);
                        await foodItemService.addFoodAlias(targetItem.food_item_id, item.recipe_match_name || item.name);
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
    const inventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
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



app.get("/food-items/resolve", async (req, res) => {
    try {
        const originalQuery = String(req.query.q || "").trim();
        const parsed = parseIngredientLine(originalQuery);
        const lookupText = normalizeName(parsed?.food_name || originalQuery);
        if (!lookupText) return res.json({ query: originalQuery, lookup: lookupText, identity: null, exact: null, suggestions: [] });
        const identity = buildFoodIdentity(lookupText);
        const exactFoodItem = await foodItemService.findFoodItemByName(lookupText);
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
    res.status(410).json({
        error: "Die Rezept-Zutaten-Synchronisierung wurde deaktiviert. Bitte nutze die Admin-Vorschau nur noch zur Analyse."
    });
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
        await foodItemService.renameFoodItemStable(id, displayName, { calories_per_100g: calories, updateCanonical: true });
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
        await foodItemService.addFoodAlias(foodItemId, aliasName);
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
            await foodItemService.addFoodAlias(masterId, duplicate.display_name);
            await foodItemService.addFoodAlias(masterId, duplicate.canonical_key);

            const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [duplicate.id]);
            for (const alias of aliases) await foodItemService.addFoodAlias(masterId, alias.alias_name);

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
                    await inventoryService.recalculateInventoryItem(masterInventory.id);
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
