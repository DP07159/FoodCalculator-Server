const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Pfade für die JSON-Dateien
const recipesFile = "./recipes.json";
const plansFile = "./plans.json";

// Globale Variablen für Daten
let recipes = [];
let plans = {};

// JSON-Daten beim Serverstart laden
if (fs.existsSync(recipesFile)) {
  const data = fs.readFileSync(recipesFile);
  recipes = JSON.parse(data);
  console.log("Rezepte erfolgreich geladen.");
}

if (fs.existsSync(plansFile)) {
  const data = fs.readFileSync(plansFile);
  plans = JSON.parse(data);
  console.log("Pläne erfolgreich geladen.");
}

// Funktion: Rezepte in JSON-Datei speichern
function saveRecipes() {
  fs.writeFileSync(recipesFile, JSON.stringify(recipes, null, 2));
  console.log("Rezepte erfolgreich gespeichert.");
}

// Funktion: Pläne in JSON-Datei speichern
function savePlans() {
  fs.writeFileSync(plansFile, JSON.stringify(plans, null, 2));
  console.log("Pläne erfolgreich gespeichert.");
}

// API-Endpoint: Alle Rezepte abrufen
app.get("/recipes", (req, res) => {
  res.json(recipes);
});

// API-Endpoint: Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const newRecipe = req.body;
  newRecipe.id = Date.now(); // Eindeutige ID generieren
  recipes.push(newRecipe);
  saveRecipes(); // In JSON-Datei speichern
  res.status(201).json(newRecipe);
});

// API-Endpoint: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
  const recipeId = parseInt(req.params.id);
  recipes = recipes.filter((recipe) => recipe.id !== recipeId);
  saveRecipes(); // In JSON-Datei speichern
  res.status(204).send();
});

// API-Endpoint: Alle Pläne abrufen
app.get("/plans", (req, res) => {
  res.json(plans);
});

// API-Endpoint: Plan speichern
app.post("/plans", (req, res) => {
  const { name, plan } = req.body;
  plans[name] = plan;
  savePlans(); // In JSON-Datei speichern
  res.status(201).send();
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
