const app = require("./src/app");
const database = require("./src/database/database");
const { run, get, all } = database;
const { runMigrations } = require("./lib/migrationRunner");
const { addColumnIfMissing } = require("./src/database/schema");
const { backfillInventoryBatchDefaults } = require("./src/database/inventoryMigrations");
const ingredients = require("./src/shared/ingredients");
const foodItemService = require("./src/modules/foodItems/service");
const inventoryService = require("./src/modules/inventory/service");
const inventoryRoutes = require("./src/modules/inventory/routes");
const mealPlanRoutes = require("./src/modules/mealPlans/routes");
const recipeRoutes = require("./src/modules/recipes/routes");
const recipeQueryRoutes = require("./src/modules/recipes/queryRoutes");
const recipeWriteRoutes = require("./src/modules/recipes/writeRoutes");
const recipeSyncService = require("./src/modules/recipes/syncService");
const adminRoutes = require("./src/modules/admin/routes");
const identity = require("./src/core/identity");
const workspaces = require("./src/core/workspaces");
const authorization = require("./src/core/authorization");
const platformAdmin = require("./src/core/platformAdmin");


const normalizeGermanText = ingredients.normalizeGermanText;
const buildFoodIdentity = ingredients.buildFoodIdentity;
const parseIngredientLine = ingredients.parseIngredientLine;

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
    await addColumnIfMissing("recipes", "workspace_id", "INTEGER REFERENCES workspaces(id)");
    await addColumnIfMissing("recipes", "owner_user_id", "INTEGER REFERENCES users(id)");
    await addColumnIfMissing("recipes", "visibility", "TEXT DEFAULT 'workspace'");
    await addColumnIfMissing("recipes", "version", "INTEGER DEFAULT 1");
    await addColumnIfMissing("recipes", "created_at", "DATETIME");
    await addColumnIfMissing("recipes", "updated_at", "DATETIME");

    await run(`
        CREATE TABLE IF NOT EXISTS recipe_workspace_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id INTEGER NOT NULL,
            workspace_id INTEGER NOT NULL,
            assigned_by_user_id INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(recipe_id, workspace_id),
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

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
app.use("/recipes", recipeRoutes);
app.use(recipeQueryRoutes);
app.use(recipeWriteRoutes);
app.use(adminRoutes);
app.use("/auth", identity.routes);
app.use("/workspaces", workspaces.routes);
app.use("/authorization", authorization.routes);
app.use("/platform-admin", platformAdmin.routes);


app.get("/food-items/resolve", async (req, res) => {
    try {
        const originalQuery = String(req.query.q || "").trim();
        const parsed = parseIngredientLine(originalQuery);
        const lookupText = inventoryService.normalizeName(parsed?.food_name || originalQuery);
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






async function startServer() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    const migrationResult = await runMigrations(connection);
    if (migrationResult.appliedNow.length) {
        console.log(`Migrationen angewendet: ${migrationResult.appliedNow.join(", ")}`);
    }
    await ensureSchema();
    app.listen(PORT, () => {
        console.log(`Food Calculator API läuft auf Port ${PORT}`);
        console.log(`SQLite verbunden: ${connection.databasePath}`);
    });
}

startServer().catch((error) => {
    console.error("Datenbankinitialisierung fehlgeschlagen:", error.message);
    process.exit(1);
});
