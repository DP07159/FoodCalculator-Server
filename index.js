const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// **Datenbank initialisieren**
const db = new sqlite3.Database("./food_calculator.sqlite", (err) => {
  if (err) console.error("❌ Fehler beim Öffnen der Datenbank:", err.message);
  else console.log("✅ Erfolgreich mit SQLite verbunden.");
});

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

// **API-Route testen**
app.get("/", (req, res) => {
  res.send("✅ Backend läuft!");
});

// **GET: Alle Rezepte abrufen**
app.get("/recipes", (req, res) => {
  db.all("SELECT * FROM recipes", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const formattedRecipes = rows.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      calories: recipe.calories,
      mealTypes: JSON.parse(recipe.mealTypes) || []
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

// **DELETE: Rezept löschen**
app.delete("/recipes/:id", (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM recipes WHERE id = ?", [id], function (err) {
    if (err) {
      console.error("❌ Fehler beim Löschen des Rezepts:", err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`✅ Rezept mit ID ${id} erfolgreich gelöscht`);
    res.status(200).json({ message: "Rezept erfolgreich gelöscht" });
  });
});

// **GET: Alle Wochenpläne abrufen**
app.get("/meal_plans", (req, res) => {
  db.all("SELECT * FROM meal_plans", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const formattedPlans = rows.map(plan => ({
      id: plan.id,
      name: plan.name,
      data: JSON.parse(plan.data)
    }));

    res.json(formattedPlans);
  });
});

// **POST: Neuen Wochenplan speichern**
app.post("/meal_plans", (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) {
    return res.status(400).json({ error: "Name und Daten sind erforderlich!" });
  }

  const jsonData = JSON.stringify(data);
  db.run("INSERT INTO meal_plans (name, data) VALUES (?, ?)", [name, jsonData], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    res.status(201).json({ id: this.lastID, name, data });
  });
});

// **GET: Einzelnen Wochenplan abrufen**
app.get("/meal_plans/:id", (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM meal_plans WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) return res.status(404).json({ error: "Plan nicht gefunden" });

    res.json({ id: row.id, name: row.name, data: JSON.parse(row.data) });
  });
});

// **Server starten**
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
