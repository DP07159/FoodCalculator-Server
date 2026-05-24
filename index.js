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

    await addColumnIfMissing("inventory_batches", "batch_type", "TEXT DEFAULT 'package'");
    await addColumnIfMissing("inventory_batches", "unit_label", "TEXT DEFAULT ''");
    await addColumnIfMissing("inventory_batches", "measure_unit", "TEXT DEFAULT 'g'");

    await migrateInventoryBatches();
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
    return {
        value: {
            name,
            unit: typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim() : "g",
            notes: typeof payload.notes === "string" ? payload.notes.trim() : ""
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
    return get(`SELECT * FROM inventory_items WHERE lower(name) = lower(?) LIMIT 1`, [normalizeName(name)]);
}

async function getOrCreateInventoryItem({ name, unit = "g", notes = "" }) {
    const cleanName = normalizeName(name);
    let item = await findInventoryItemByName(cleanName);
    if (item) return item;
    const result = await run(
        `INSERT INTO inventory_items (name, quantity, unit, weight, expiry_date, storage_location, notes)
         VALUES (?, 0, ?, 0, '', '', ?)`,
        [cleanName, unit || "g", notes || ""]
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
        const mealPlans = await all(`PRAGMA table_info(meal_plans)`);
        res.json({ recipes, mealPlans });
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

app.get("/inventory/suggestions", async (req, res) => {
    try {
        const q = normalizeName(req.query.q || "");
        const rows = q
            ? await all(`SELECT id, name, unit FROM inventory_items WHERE name LIKE ? ORDER BY name COLLATE NOCASE ASC LIMIT 10`, [`%${q}%`])
            : await all(`SELECT id, name, unit FROM inventory_items ORDER BY name COLLATE NOCASE ASC LIMIT 10`);
        res.json(rows);
    } catch (error) {
        console.error("Fehler bei GET /inventory/suggestions:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Vorschläge" });
    }
});

app.get("/inventory", async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM inventory_items ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, name COLLATE NOCASE ASC`);
        const enriched = [];
        for (const row of rows) {
            const batches = await getInventoryBatches(row.id);
            enriched.push(normalizeInventoryRow(row, batches));
        }
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
        await run(`UPDATE inventory_items SET name = ?, unit = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [validation.value.name, validation.value.unit, validation.value.notes, req.params.id]);
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
                const profile = String(req.body?.packageProfile || "");
                if (!profile) return res.status(400).json({ error: "Bitte eine vorhandene Einheit auswählen." });
                const parts = profile.split("||");
                let unitWeight = 0;
                let measureUnit = "g";

                let storageLocation = typeof req.body.storage_location === "string" ? req.body.storage_location.trim() : "";
                let expiryDate = typeof req.body.expiry_date === "string" ? req.body.expiry_date : "";
                let hasStorageLocationFilter = Object.prototype.hasOwnProperty.call(req.body, "storage_location");
                let hasExpiryDateFilter = Object.prototype.hasOwnProperty.call(req.body, "expiry_date");

                // Profile werden über Inhalt + Einheit + Lagerort + Ablaufdatum identifiziert.
                // Ältere Profile bleiben kompatibel.
                if (parts.length >= 4) {
                    unitWeight = Number(decodeURIComponent(parts[0]));
                    measureUnit = normalizeMeasureUnit(decodeURIComponent(parts[1]));
                    storageLocation = decodeURIComponent(parts[2] || "");
                    expiryDate = decodeURIComponent(parts[3] || "");
                    hasStorageLocationFilter = true;
                    hasExpiryDateFilter = true;
                } else if (parts.length >= 3) {
                    unitWeight = Number(parts[1]);
                    measureUnit = normalizeMeasureUnit(parts[2]);
                } else {
                    unitWeight = Number(parts[0]);
                    measureUnit = normalizeMeasureUnit(parts[1]);
                }

                const countToRemove = Math.floor(amount);
                if (!Number.isFinite(unitWeight) || unitWeight <= 0) return res.status(400).json({ error: "Ungültige Einheit." });

                const packageWhere = [
                    "item_id = ?",
                    "batch_type = 'package'",
                    "unit_weight = ?",
                    "measure_unit = ?",
                    "remaining_quantity > 0"
                ];
                const packageParams = [item.id, unitWeight, measureUnit];
                if (hasStorageLocationFilter) { packageWhere.push("storage_location = ?"); packageParams.push(storageLocation); }
                if (hasExpiryDateFilter) { packageWhere.push("expiry_date = ?"); packageParams.push(expiryDate); }
                packageParams.push(countToRemove);

                const packages = await all(
                    `SELECT * FROM inventory_batches
                     WHERE ${packageWhere.join(" AND ")}
                     ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, id ASC
                     LIMIT ?`,
                    packageParams
                );
                if (packages.length < countToRemove) return res.status(400).json({ error: "Nicht genügend Einheiten vorhanden." });
                for (const pack of packages) {
                    await run(`UPDATE inventory_batches SET remaining_quantity = 0, remaining_weight = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [pack.id]);
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

ensureSchema()
    .then(() => {
        app.listen(PORT, () => console.log(`Food Calculator API läuft auf Port ${PORT}`));
    })
    .catch((error) => {
        console.error("Datenbankinitialisierung fehlgeschlagen:", error.message);
        process.exit(1);
    });
