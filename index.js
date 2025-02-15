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
  let { name, calories, mealTypes } = req.body;

  if (!Array.isArray(mealTypes)) mealTypes = [mealTypes];
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
app.delete("/recipe/:id", (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM recipes WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: "Rezept gelöscht", id });
  });
});

// **Server starten**
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
