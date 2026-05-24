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

function normalizeInventoryRow(item) {
    return {
        id: item.id,
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit || "",
        weight: item.weight ?? null,
        expiry_date: item.expiry_date || "",
        storage_location: item.storage_location || "",
        notes: item.notes || "",
        created_at: item.created_at || "",
        updated_at: item.updated_at || ""
    };
}

function validateInventoryPayload(payload) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (!name) return { error: "Bezeichnung ist erforderlich." };

    return {
        value: {
            name,
            quantity: payload.quantity === "" || payload.quantity === null || payload.quantity === undefined
                ? null
                : Number(payload.quantity),
            unit: typeof payload.unit === "string" ? payload.unit.trim() : "",
            weight: payload.weight === "" || payload.weight === null || payload.weight === undefined
                ? null
                : Number(payload.weight),
            expiry_date: typeof payload.expiry_date === "string" ? payload.expiry_date : "",
            storage_location: typeof payload.storage_location === "string" ? payload.storage_location.trim() : "",
            notes: typeof payload.notes === "string" ? payload.notes.trim() : ""
        }
    };
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
        res.json(rows.map(normalizeInventoryRow));
    } catch (error) {
        console.error("Fehler bei GET /inventory:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Inventars" });
    }
});

app.get("/inventory/:id", async (req, res) => {
    try {
        const row = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        res.json(normalizeInventoryRow(row));
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
            [
                item.name,
                item.quantity,
                item.unit,
                item.weight,
                item.expiry_date,
                item.storage_location,
                item.notes
            ]
        );

        const created = await get(`SELECT * FROM inventory_items WHERE id = ?`, [result.lastID]);
        res.status(201).json(normalizeInventoryRow(created));
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

        const result = await run(
            `UPDATE inventory_items
             SET name = ?, quantity = ?, unit = ?, weight = ?, expiry_date = ?, storage_location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                item.name,
                item.quantity,
                item.unit,
                item.weight,
                item.expiry_date,
                item.storage_location,
                item.notes,
                req.params.id
            ]
        );

        if (result.changes === 0) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });

        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        res.json(normalizeInventoryRow(updated));
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
        const unitWeight = Number(req.body?.unitWeight);

        if (!action) return res.status(400).json({ error: "Aktion muss 'add' oder 'remove' sein." });
        if (!mode) return res.status(400).json({ error: "Anpassungsart muss 'quantity' oder 'weight' sein." });
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Anpassungswert muss größer 0 sein." });

        const existing = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        if (!existing) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });

        const direction = action === "add" ? 1 : -1;
        const currentQuantity = existing.quantity === null || existing.quantity === undefined ? 0 : Number(existing.quantity);
        const currentWeight = existing.weight === null || existing.weight === undefined ? 0 : Number(existing.weight);

        let newQuantity = currentQuantity;
        let newWeight = currentWeight;

        if (mode === "weight") {
            if (currentQuantity !== 1) {
                return res.status(400).json({ error: "Gewicht kann nur direkt angepasst werden, wenn die Menge 1 beträgt." });
            }

            newWeight = Math.max(0, currentWeight + (direction * amount));
            newQuantity = 1;
        }

        if (mode === "quantity") {
            if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
                return res.status(400).json({ error: "Gewicht je Einheit muss größer 0 sein." });
            }

            newQuantity = Math.max(0, currentQuantity + (direction * amount));
            newWeight = Math.max(0, currentWeight + (direction * amount * unitWeight));
        }

        await run(
            `UPDATE inventory_items
             SET quantity = ?, weight = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newQuantity, newWeight, req.params.id]
        );

        const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [req.params.id]);
        res.json(normalizeInventoryRow(updated));
    } catch (error) {
        console.error("Fehler bei PATCH /inventory/:id/adjust:", error.message);
        res.status(500).json({ error: "Fehler beim Anpassen des Inventarbestands" });
    }
});

app.delete("/inventory/:id", async (req, res) => {
    try {
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
