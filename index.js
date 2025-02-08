const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Verbindung zur SQLite-Datenbank herstellen
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Fehler beim Öffnen der SQLite-Datenbank:", err);
  } else {
    console.log("Verbunden mit SQLite-Datenbank.");
  }
});

// Tabellen für Rezepte und Pläne erstellen (falls nicht vorhanden)
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories INTEGER NOT NULL,
      mealTypes TEXT NOT NULL
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS plans (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`
  );

  console.log("Tabellen wurden überprüft und erstellt.");
});

// API-Endpoint: Alle Rezepte abrufen
app.get("/recipes", (req, res) => {
  db.all("SELECT * FROM recipes", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API-Endpoint: Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const { name, calories, mealTypes } = req.body;
  const mealTypesString = JSON.stringify(mealTypes);

  db.run(
    "INSERT INTO recipes (name, calories, mealTypes) VALUES (?, ?, ?)",
    [name, calories, mealTypesString],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: this.lastID, name, calories, mealTypes });
    }
  );
});

// API-Endpoint: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
  const recipeId = req.params.id;

  db.run("DELETE FROM recipes WHERE id = ?", recipeId, function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(204).send();
  });
});

// API-Endpoint: Alle Pläne abrufen
app.get("/plans", (req, res) => {
  db.all("SELECT * FROM plans", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const plans = {};
    rows.forEach((row) => {
      plans[row.name] = JSON.parse(row.data);
    });
    res.json(plans);
  });
});

// API-Endpoint: Plan speichern
app.post("/plans", (req, res) => {
  const { name, plan } = req.body;
  const planString = JSON.stringify(plan);

  db.run(
    "INSERT OR REPLACE INTO plans (name, data) VALUES (?, ?)",
    [name, planString],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).send();
    }
  );
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
