const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* -------------------------------------- */
/* DATENBANK */
/* -------------------------------------- */

const dataDir = "/var/data";
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "food_calculator.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Fehler beim Öffnen der Datenbank:", err.message);
    } else {
        console.log(`✅ Erfolgreich mit SQLite verbunden unter: ${dbPath}`);
    }
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

async function ensureSchema() {
    await run(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            calories INTEGER NOT NULL,
            mealTypes TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS meal_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data TEXT NOT NULL
        )
    `);

    const recipeColumns = await all(`PRAGMA table_info(recipes)`);

    const existingColumns = recipeColumns.map((column) => column.name);

    if (!existingColumns.includes("ingredients")) {
        await run(`ALTER TABLE recipes ADD COLUMN ingredients TEXT`);
        console.log('✅ Feld "ingredients" erfolgreich hinzugefügt.');
    }

    if (!existingColumns.includes("instructions")) {
        await run(`ALTER TABLE recipes ADD COLUMN instructions TEXT`);
        console.log('✅ Feld "instructions" erfolgreich hinzugefügt.');
    }

    if (!existingColumns.includes("portions")) {
        await run(`ALTER TABLE recipes ADD COLUMN portions INTEGER`);
        console.log('✅ Feld "portions" erfolgreich hinzugefügt.');
    }

if (!existingColumns.includes("is_favorite")) {
    await run(`ALTER TABLE recipes ADD COLUMN is_favorite INTEGER DEFAULT 0`);
    console.log('✅ Feld "is_favorite" erfolgreich hinzugefügt.');
}
}

function parseMealTypes(value) {
    if (!value) return [];

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("⚠️ mealTypes konnten nicht geparsed werden:", value);
        return [];
    }
}

function normalizeRecipeRow(recipe) {
    return {
        id: recipe.id,
        name: recipe.name,
        calories: recipe.calories,
        portions: recipe.portions ?? null,
        mealTypes: parseMealTypes(recipe.mealTypes),
        ingredients: recipe.ingredients || "",
        instructions: recipe.instructions || "",
        is_favorite: recipe.is_favorite || 0
    };
}

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

/* -------------------------------------- */
/* DEBUG / HEALTH */
/* -------------------------------------- */

app.get("/check-db", async (req, res) => {
    try {
        const rows = await all(`PRAGMA table_info(recipes)`);
        res.json(rows);
    } catch (error) {
        console.error("❌ Fehler bei /check-db:", error.message);
        res.status(500).json({ error: "Fehler beim Überprüfen der Tabelle" });
    }
});

/* -------------------------------------- */
/* REZEPTE */
/* -------------------------------------- */

app.get("/recipes", async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC`);
        res.json(rows.map(normalizeRecipeRow));
    } catch (error) {
        console.error("❌ Fehler beim Laden der Rezepte:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Rezepte" });
    }
});

app.get("/recipes/:id", async (req, res) => {
    try {
        const recipe = await get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);

        if (!recipe) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        res.json(normalizeRecipeRow(recipe));
    } catch (error) {
        console.error("❌ Fehler beim Abrufen des Rezepts:", error.message);
        res.status(500).json({ error: "Fehler beim Abrufen des Rezepts" });
    }
});

app.post("/recipes", async (req, res) => {
    try {
        const { name, calories, portions, mealTypes } = req.body;

        const trimmedName = typeof name === "string" ? name.trim() : "";
        const parsedCalories = Number.parseInt(calories, 10);
        const parsedPortions = Number.parseInt(portions, 10);

        if (!trimmedName) {
            return res.status(400).json({ error: "Name ist erforderlich." });
        }

        if (!isPositiveInteger(parsedCalories)) {
            return res.status(400).json({ error: "Kalorien müssen als ganze Zahl größer 0 angegeben werden." });
        }

        if (!isPositiveInteger(parsedPortions)) {
            return res.status(400).json({ error: "Anzahl Mahlzeiten muss als ganze Zahl größer 0 angegeben werden." });
        }

        if (!Array.isArray(mealTypes) || mealTypes.length === 0) {
            return res.status(400).json({ error: "Mindestens eine Mahlzeit muss ausgewählt werden." });
        }

        const mealTypesJSON = JSON.stringify(mealTypes);

        const result = await run(
            `
            INSERT INTO recipes (name, calories, portions, mealTypes)
            VALUES (?, ?, ?, ?)
            `,
            [trimmedName, parsedCalories, parsedPortions, mealTypesJSON]
        );

        res.status(201).json({
            id: result.lastID,
            name: trimmedName,
            calories: parsedCalories,
            portions: parsedPortions,
            mealTypes
        });
    } catch (error) {
        console.error("❌ Fehler beim Speichern des Rezepts:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Rezepts" });
    }
});

app.put("/recipes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, calories, portions, ingredients, instructions } = req.body;

        const trimmedName = typeof name === "string" ? name.trim() : "";
        const parsedCalories = Number.parseInt(calories, 10);
        const parsedPortions =
            portions === null || portions === undefined || portions === ""
                ? null
                : Number.parseInt(portions, 10);

        if (!trimmedName) {
            return res.status(400).json({ error: "Name ist erforderlich." });
        }

        if (!isPositiveInteger(parsedCalories)) {
            return res.status(400).json({ error: "Kalorien müssen als ganze Zahl größer 0 angegeben werden." });
        }

        if (parsedPortions !== null && !isPositiveInteger(parsedPortions)) {
            return res.status(400).json({ error: "Portionen müssen leer oder eine ganze Zahl größer 0 sein." });
        }

        const result = await run(
            `
            UPDATE recipes
            SET name = ?, calories = ?, portions = ?, ingredients = ?, instructions = ?
            WHERE id = ?
            `,
            [
                trimmedName,
                parsedCalories,
                parsedPortions,
                ingredients || "",
                instructions || "",
                id
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        res.status(200).json({ message: "Rezept erfolgreich aktualisiert" });
    } catch (error) {
        console.error("❌ Fehler beim Aktualisieren des Rezepts:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Rezepts" });
    }
});

app.patch("/recipes/:id/favorite", async (req, res) => {
    try {
        const { id } = req.params;
        const { is_favorite } = req.body;

        const favoriteValue = Number(is_favorite) === 1 ? 1 : 0;

        const result = await run(
            `
            UPDATE recipes
            SET is_favorite = ?
            WHERE id = ?
            `,
            [favoriteValue, id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        res.status(200).json({
            message: "Favoritenstatus erfolgreich aktualisiert",
            id,
            is_favorite: favoriteValue
        });
    } catch (error) {
        console.error("❌ Fehler beim Aktualisieren des Favoritenstatus:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Favoritenstatus" });
    }
});

app.delete("/recipes/:id", async (req, res) => {
    try {
        const result = await run(`DELETE FROM recipes WHERE id = ?`, [req.params.id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        res.status(200).json({ message: "Rezept erfolgreich gelöscht" });
    } catch (error) {
        console.error("❌ Fehler beim Löschen des Rezepts:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Rezepts" });
    }
});

/* -------------------------------------- */
/* WOCHENPLÄNE */
/* -------------------------------------- */

app.get("/meal_plans", async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM meal_plans ORDER BY id DESC`);
        res.json(rows);
    } catch (error) {
        console.error("❌ Fehler beim Laden der Wochenpläne:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Wochenpläne" });
    }
});

app.get("/meal_plans/:id", async (req, res) => {
    try {
        const row = await get(`SELECT * FROM meal_plans WHERE id = ?`, [req.params.id]);

        if (!row) {
            return res.status(404).json({ error: "Plan nicht gefunden" });
        }

        let parsedData = [];
        try {
            parsedData = JSON.parse(row.data);
        } catch (parseError) {
            console.error("❌ Fehler beim JSON-Parsing des Plans:", parseError.message);
            return res.status(500).json({ error: "Fehler beim Verarbeiten des Plans" });
        }

        res.json({
            id: row.id,
            name: row.name,
            data: parsedData
        });
    } catch (error) {
        console.error("❌ Fehler beim Laden des Plans:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Plans" });
    }
});

app.post("/meal_plans", async (req, res) => {
    try {
        const { name, data } = req.body;
        const trimmedName = typeof name === "string" ? name.trim() : "";

        if (!trimmedName || !Array.isArray(data)) {
            return res.status(400).json({ error: "Name und Daten sind erforderlich." });
        }

        const result = await run(
            `INSERT INTO meal_plans (name, data) VALUES (?, ?)`,
            [trimmedName, JSON.stringify(data)]
        );

        res.status(201).json({
            id: result.lastID,
            name: trimmedName,
            data
        });
    } catch (error) {
        console.error("❌ Fehler beim Speichern des Wochenplans:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Wochenplans" });
    }
});

app.put("/meal_plans/:id", async (req, res) => {
    try {
        const { name, data } = req.body;
        const trimmedName = typeof name === "string" ? name.trim() : "";

        if (!trimmedName || !Array.isArray(data)) {
            return res.status(400).json({ error: "Name und Daten sind erforderlich." });
        }

        const result = await run(
            `UPDATE meal_plans SET name = ?, data = ? WHERE id = ?`,
            [trimmedName, JSON.stringify(data), req.params.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        }

        res.status(200).json({ message: "Wochenplan erfolgreich aktualisiert" });
    } catch (error) {
        console.error("❌ Fehler beim Aktualisieren des Wochenplans:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Wochenplans" });
    }
});

app.delete("/meal_plans/:id", async (req, res) => {
    try {
        const result = await run(`DELETE FROM meal_plans WHERE id = ?`, [req.params.id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        }

        res.status(200).json({ message: "Wochenplan erfolgreich gelöscht" });
    } catch (error) {
        console.error("❌ Fehler beim Löschen des Wochenplans:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Wochenplans" });
    }
});

/* -------------------------------------- */
/* SERVER START */
/* -------------------------------------- */

ensureSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server läuft auf Port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("❌ Fehler beim Initialisieren der Datenbank:", error.message);
        process.exit(1);
    });