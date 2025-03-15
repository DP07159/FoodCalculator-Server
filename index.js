const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// **Persistente SQLite-Datenbank**
const dbPath = path.join("/var/data", "food_calculator.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("❌ Fehler beim Öffnen der Datenbank:", err.message);
    else console.log(`✅ Erfolgreich mit SQLite verbunden unter: ${dbPath}`);
});

// ✅ Datenbank-Erweiterung für neue Felder (einmalig ausführen)
db.serialize(() => {
    db.all(`PRAGMA table_info(recipes);`, (err, rows) => {
        const existingColumns = rows.map(row => row.name);

        if (!existingColumns.includes('ingredients')) {
            db.run(`ALTER TABLE recipes ADD COLUMN ingredients TEXT`, (err) => {
                if (!err) console.log('✅ Feld "ingredients" erfolgreich hinzugefügt.');
            });
        }

        if (!existingColumns.includes('instructions')) {
            db.run(`ALTER TABLE recipes ADD COLUMN instructions TEXT`, (err) => {
                if (!err) console.log('✅ Feld "instructions" erfolgreich hinzugefügt.');
            });
        }

        if (!existingColumns.includes('portions')) {
            db.run(`ALTER TABLE recipes ADD COLUMN portions INTEGER`, (err) => {
                if (!err) console.log('✅ Feld "portions" erfolgreich hinzugefügt.');
            });
        }
    });
});

// ✅ Test-Endpunkt zur Überprüfung der Datenbankstruktur
app.get('/check-db', async (req, res) => {
    db.all('PRAGMA table_info(recipes);', (err, rows) => {
        if (err) {
            console.error("❌ Fehler bei der Datenbankabfrage:", err.message);
            res.status(500).json({ error: 'Fehler beim Überprüfen der Tabelle' });
            return;
        }
        console.log("Tabellenstruktur:", rows);
        res.json(rows);
    });
});

app.use(express.json());
app.use(cors());

// **Rezepte-Tabelle erstellen**
db.run(
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories INTEGER NOT NULL,
      mealTypes TEXT NOT NULL
    )`
);

// **Wochenplan-Tabelle erstellen**
db.run(
    `CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      data TEXT NOT NULL
    )`
);

// **GET: Alle Rezepte abrufen**
app.get("/recipes", (req, res) => {
    db.all("SELECT * FROM recipes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const formattedRecipes = rows.map((recipe) => ({
            id: recipe.id,
            name: recipe.name,
            calories: recipe.calories,
            mealTypes: JSON.parse(recipe.mealTypes)
        }));

        res.json(formattedRecipes);
    });
});

// **POST: Neues Rezept hinzufügen**
app.post("/recipes", (req, res) => {
    const { name, calories, mealTypes } = req.body;
    if (!name || !calories || !mealTypes) {
        return res.status(400).json({ error: "Alle Felder sind erforderlich!" });
    }

    const mealTypesJSON = JSON.stringify(mealTypes);
    db.run(
        "INSERT INTO recipes (name, calories, mealTypes) VALUES (?, ?, ?)",
        [name, calories, mealTypesJSON],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, name, calories, mealTypes });
        }
    );
});

// ✅ GET: Einzelnes Rezept abrufen (inkl. Zutaten, Anleitung und Portionen)
app.get("/recipes/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM recipes WHERE id = ?", [id], (err, recipe) => {
        if (err) {
            console.error("❌ Fehler beim Abrufen des Rezepts:", err.message);
            return res.status(500).json({ error: "Fehler beim Abrufen des Rezepts" });
        }

        if (!recipe) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        res.json(recipe);
    });
});

// ✅ PUT: Rezept aktualisieren (inkl. Zutaten, Anleitung und Portionen)
app.put("/recipes/:id", (req, res) => {
    const { id } = req.params;
    const { name, calories, ingredients, instructions, portions } = req.body;

    if (!name || !calories) {
        return res.status(400).json({ error: "Name und Kalorien sind erforderlich!" });
    }

    db.run(
        "UPDATE recipes SET name = ?, calories = ?, ingredients = ?, instructions = ?, portions = ? WHERE id = ?",
        [name, calories, ingredients, instructions, portions, id],
        function (err) {
            if (err) {
                console.error("❌ Fehler beim Aktualisieren des Rezepts:", err.message);
                return res.status(500).json({ error: "Fehler beim Aktualisieren des Rezepts" });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: "Rezept nicht gefunden" });
            }

            console.log(`✅ Rezept mit ID ${id} erfolgreich aktualisiert`);
            res.status(200).json({ message: "Rezept erfolgreich aktualisiert" });
        }
    );
});

// **GET: Alle Wochenpläne abrufen**
app.get("/meal_plans", (req, res) => {
    db.all("SELECT * FROM meal_plans", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json(rows);
    });
});

// **POST: Wochenplan speichern**
app.post("/meal_plans", (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) {
        return res.status(400).json({ error: "Name und Daten sind erforderlich!" });
    }

    const jsonData = JSON.stringify(data);
    db.run(
        "INSERT INTO meal_plans (name, data) VALUES (?, ?)",
        [name, jsonData],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, name, data });
        }
    );
});

// **DELETE: Rezept löschen**
app.delete("/recipes/:id", (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM recipes WHERE id = ?", [id], function (err) {
        if (err) {
            console.error("❌ Fehler beim Löschen des Rezepts:", err.message);
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        console.log(`✅ Rezept mit ID ${id} erfolgreich gelöscht`);
        res.status(200).json({ message: "Rezept erfolgreich gelöscht" });
    });
});

// **Server starten**
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));


