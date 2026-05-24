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
        unit: item.unit || "",
        weight: item.weight ?? null,
        expiry_date: item.expiry_date || "",
        storage_location: item.storage_location || "",
        notes: item.notes || "",
        batches: batches.map(normalizeInventoryBatchRow),
        created_at: item.created_at || "",
        updated_at: item.updated_at || ""
    };
}

function toNullableNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function validateInventoryPayload(payload) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) return { error: "Bezeichnung ist erforderlich." };

    const quantity = toNullableNumber(payload.quantity);
    const weight = toNullableNumber(payload.weight);

    if (quantity !== null && quantity < 0) return { error: "Menge darf nicht negativ sein." };
    if (weight !== null && weight < 0) return { error: "Gewicht darf nicht negativ sein." };

    return {
        value: {
            name,
            quantity,
            unit: typeof payload.unit === "string" ? payload.unit.trim() : "",
            weight,
            expiry_date: typeof payload.expiry_date === "string" ? payload.expiry_date : "",
            storage_location: typeof payload.storage_location === "string" ? payload.storage_location.trim() : "",
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

async function createInventoryBatch(itemId, item, { quantity, unitWeight, weight, expiry_date, storage_location, notes }) {
    const safeQuantity = Math.max(0, Number(quantity ?? 0));
    const safeUnitWeight = Math.max(0, Number(unitWeight ?? 0));
    const safeWeight = weight !== undefined && weight !== null
        ? Math.max(0, Number(weight))
        : safeQuantity * safeUnitWeight;

    await run(
        `INSERT INTO inventory_batches
         (item_id, original_quantity, unit_weight, remaining_quantity, remaining_weight, expiry_date, storage_location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemId, safeQuantity, safeUnitWeight, safeQuantity, safeWeight, expiry_date ?? item.expiry_date ?? "", storage_location ?? item.storage_location ?? "", notes ?? ""]
    );

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

        const unitWeight = calculateUnitWeight(quantity, weight);
        await createInventoryBatch(item.id, item, {
            quantity,
            unitWeight,
            weight,
            expiry_date: item.expiry_date || "",
            storage_location: item.storage_location || "",
            notes: "Aus bestehendem Bestand übernommen"
        });
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

app.get("/inventory", async (req, res) => {
    try {
        const rows = await all(`
            SELECT * FROM inventory_items
            ORDER BY 
                CASE WHEN expiry_date = '' THEN 1 ELSE 0 END,
                expiry_date ASC,
                name COLLATE NOCASE ASC
        `);

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

        const item = validation.value;

        const result = await run(
            `INSERT INTO inventory_items 
             (name, quantity, unit, weight, expiry_date, storage_location, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [item.name, 0, item.unit, 0, item.expiry_date, item.storage_location, item.notes]
        );

        if ((item.quantity ?? 0) > 0 || (item.weight ?? 0) > 0) {
            await createInventoryBatch(result.lastID, item, {
                quantity: item.quantity ?? 0,
                unitWeight: calculateUnitWeight(item.quantity, item.weight),
                weight: item.weight ?? 0,
                expiry_date: item.expiry_date,
                storage_location: item.storage_location,
                notes: "Ersterfassung"
            });
        }

        const created = await get(`SELECT * FROM inventory_items WHERE id = ?`, [result.lastID]);
        const batches = await getInventoryBatches(result.lastID);
        res.status(201).json(normalizeInventoryRow(created, batches));
    } catch (error) {
        console.error("Fehler bei POST /inventory:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Inventar-Eintrags" });
    }
});

app.put("/inventory/:id", async (req, res) => {
    try {
        const validation = validateInventoryPayload(req.body);
        if (validation.error) return res.status(400).json({ error: validation.error });

        const item = validation.value;
        const existing = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!existing) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });

        await run(
            `UPDATE inventory_items
             SET name = ?, unit = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [item.name, item.unit, item.notes, req.params.id]
        );

        const batches = await getInventoryBatches(req.params.id);
        if (batches.length === 1 && ((item.quantity ?? 0) > 0 || (item.weight ?? 0) > 0)) {
            const unitWeight = calculateUnitWeight(item.quantity, item.weight);
            await run(
                `UPDATE inventory_batches
                 SET original_quantity = ?, unit_weight = ?, remaining_quantity = ?, remaining_weight = ?, expiry_date = ?, storage_location = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [item.quantity ?? 0, unitWeight, item.quantity ?? 0, item.weight ?? 0, item.expiry_date, item.storage_location, batches[0].id]
            );
        } else if (batches.length === 0 && ((item.quantity ?? 0) > 0 || (item.weight ?? 0) > 0)) {
            await createInventoryBatch(req.params.id, item, {
                quantity: item.quantity ?? 0,
                unitWeight: calculateUnitWeight(item.quantity, item.weight),
                weight: item.weight ?? 0,
                expiry_date: item.expiry_date,
                storage_location: item.storage_location,
                notes: "Nachträglich angelegt"
            });
        }

        await recalculateInventoryItem(req.params.id);

        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        const updatedBatches = await getInventoryBatches(req.params.id);
        res.json(normalizeInventoryRow(updated, updatedBatches));
    } catch (error) {
        console.error("Fehler bei PUT /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Inventar-Eintrags" });
    }
});

app.patch("/inventory/:id/adjust", async (req, res) => {
    try {
        const action = req.body?.action === "add" ? "add" : req.body?.action === "remove" ? "remove" : "";
        const mode = req.body?.mode === "quantity" ? "quantity" : req.body?.mode === "weight" ? "weight" : "";
        const amount = Number(req.body?.amount);
        const suppliedUnitWeight = Number(req.body?.unitWeight);
        const batchId = req.body?.batchId ? Number(req.body.batchId) : null;

        if (!action) return res.status(400).json({ error: "Aktion muss 'add' oder 'remove' sein." });
        if (!mode) return res.status(400).json({ error: "Anpassungsart muss 'quantity' oder 'weight' sein." });
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Anpassungswert muss größer 0 sein." });

        const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!item) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });

        if (action === "add" && mode === "quantity") {
            let unitWeight = Number.isFinite(suppliedUnitWeight) && suppliedUnitWeight > 0 ? suppliedUnitWeight : 0;
            let profile = null;
            if (batchId) {
                profile = await get(`SELECT * FROM inventory_batches WHERE id = ? AND item_id = ?`, [batchId, req.params.id]);
                if (profile && !unitWeight) unitWeight = Number(profile.unit_weight ?? 0);
            }
            if (!unitWeight) return res.status(400).json({ error: "Gewicht je Einheit muss größer 0 sein." });

            await createInventoryBatch(req.params.id, item, {
                quantity: amount,
                unitWeight,
                weight: amount * unitWeight,
                expiry_date: profile?.expiry_date || item.expiry_date || "",
                storage_location: profile?.storage_location || item.storage_location || "",
                notes: "Bestand hinzugefügt"
            });
        }

        if (action === "remove" && mode === "quantity") {
            if (!batchId) return res.status(400).json({ error: "Bitte eine vorhandene Bestandseinheit auswählen." });
            const batch = await get(`SELECT * FROM inventory_batches WHERE id = ? AND item_id = ?`, [batchId, req.params.id]);
            if (!batch) return res.status(404).json({ error: "Bestandseinheit nicht gefunden." });

            const currentQuantity = Number(batch.remaining_quantity ?? 0);
            const currentWeight = Number(batch.remaining_weight ?? 0);
            const unitWeight = Number(batch.unit_weight ?? suppliedUnitWeight ?? 0);
            const quantityToRemove = Math.min(amount, currentQuantity);
            const weightToRemove = Math.min(currentWeight, quantityToRemove * unitWeight);

            await run(
                `UPDATE inventory_batches
                 SET remaining_quantity = ?, remaining_weight = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [Math.max(0, currentQuantity - quantityToRemove), Math.max(0, currentWeight - weightToRemove), batch.id]
            );
        }

        if (mode === "weight") {
            const activeBatches = await getInventoryBatches(req.params.id, { activeOnly: true });
            const totalQuantity = activeBatches.reduce((sum, batch) => sum + Number(batch.remaining_quantity ?? 0), 0);

            if (totalQuantity !== 1) {
                return res.status(400).json({ error: "Gewicht kann nur direkt angepasst werden, wenn die Gesamtmenge exakt 1 beträgt." });
            }

            const batch = batchId
                ? await get(`SELECT * FROM inventory_batches WHERE id = ? AND item_id = ?`, [batchId, req.params.id])
                : activeBatches[0];
            if (!batch) return res.status(404).json({ error: "Bestandseinheit nicht gefunden." });

            const currentWeight = Number(batch.remaining_weight ?? 0);
            const direction = action === "add" ? 1 : -1;
            const newWeight = Math.max(0, currentWeight + direction * amount);
            const newQuantity = newWeight > 0 ? 1 : 0;

            await run(
                `UPDATE inventory_batches
                 SET remaining_quantity = ?, remaining_weight = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newQuantity, newWeight, batch.id]
            );
        }

        await recalculateInventoryItem(req.params.id);

        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        const updatedBatches = await getInventoryBatches(req.params.id);
        res.json(normalizeInventoryRow(updated, updatedBatches));
    } catch (error) {
        console.error("Fehler bei PATCH /inventory/:id/adjust:", error.message);
        res.status(500).json({ error: "Fehler beim Anpassen des Inventarbestands" });
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
