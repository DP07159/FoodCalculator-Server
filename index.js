const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3"); // SQLite-Datenbank

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// SQLite-Datenbank einrichten
const db = new Database("data.db"); // SQLite-Datenbank wird automatisch erstellt

// Tabellen erstellen, falls sie nicht existieren
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    mealTypes TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan TEXT NOT NULL
  );
`);

// API-Endpoint: Alle Rezepte abrufen
app.get("/recipes", (req, res) => {
  const recipes = db.prepare("SELECT * FROM recipes").all();
  res.json(recipes);
});

// API-Endpoint: Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const { name, calories, mealTypes } = req.body;
  const stmt = db.prepare("INSERT INTO recipes (name, calories, mealTypes) VALUES (?, ?, ?)");
  const result = stmt.run(name, calories, JSON.stringify(mealTypes));
  const newRecipe = { id: result.lastInsertRowid, name, calories, mealTypes };
  res.status(201).json(newRecipe);
});

// API-Endpoint: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
  res.status(204).send();
});

// API-Endpoint: Alle Pläne abrufen
app.get("/plans", (req, res) => {
  const plans = db.prepare("SELECT * FROM plans").all();
  const formattedPlans = {};
  plans.forEach((plan) => {
    formattedPlans[plan.name] = JSON.parse(plan.plan);
  });
  res.json(formattedPlans);
});

// API-Endpoint: Plan speichern
app.post("/plans", (req, res) => {
  const { name, plan } = req.body;
  const stmt = db.prepare("INSERT INTO plans (name, plan) VALUES (?, ?)");
  stmt.run(name, JSON.stringify(plan));
  res.status(201).send();
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
