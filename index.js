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
function loadRecipes() {
  if (fs.existsSync(recipesFile)) {
    try {
      const data = fs.readFileSync(recipesFile, "utf-8");
      recipes = JSON.parse(data);
      console.log("Rezepte erfolgreich geladen.");
    } catch (err) {
      console.error("Fehler beim Laden der Rezepte:", err);
    }
  } else {
    console.log("Rezepte-Datei nicht gefunden. Erstelle neue Datei.");
    fs.writeFileSync(recipesFile, JSON.stringify([], null, 2));
  }
}

function loadPlans() {
  if (fs.existsSync(plansFile)) {
    try {
      const data = fs.readFileSync(plansFile, "utf-8");
      plans = JSON.parse(data);
      console.log("Pläne erfolgreich geladen.");
    } catch (err) {
      console.error("Fehler beim Laden der Pläne:", err);
    }
  } else {
    console.log("Pläne-Datei nicht gefunden. Erstelle neue Datei.");
    fs.writeFileSync(plansFile, JSON.stringify({}, null, 2));
  }
}

// JSON-Daten in Dateien speichern
function saveRecipes() {
  try {
    fs.writeFileSync(recipesFile, JSON.stringify(recipes, null, 2));
    console.log("Rezepte erfolgreich gespeichert.");
  } catch (err) {
    console.error("Fehler beim Speichern der Rezepte:", err);
  }
}

function savePlans() {
  try {
    fs.writeFileSync(plansFile, JSON.stringify(plans, null, 2));
    console.log("Pläne erfolgreich gespeichert.");
  } catch (err) {
    console.error("Fehler beim Speichern der Pläne:", err);
  }
}

// Beim Start Rezepte und Pläne laden
loadRecipes();
loadPlans();

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
