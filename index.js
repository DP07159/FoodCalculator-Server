const express = require("express");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Datei-Pfade für JSON-Dateien
const recipesFile = "recipes.json";
const plansFile = "plans.json";

// Helper-Funktion: Daten aus Datei laden
function loadData(filePath) {
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  }
  return [];
}

// Helper-Funktion: Daten in Datei speichern
function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// Initialdaten laden
let recipes = loadData(recipesFile);
let plans = loadData(plansFile);

// Endpunkte für Rezepte
app.get("/recipes", (req, res) => {
  res.json(recipes);
});

app.post("/recipes", (req, res) => {
  const newRecipe = { id: Date.now(), ...req.body };
  recipes.push(newRecipe);
  saveData(recipesFile, recipes);
  res.json(newRecipe);
});

app.delete("/recipes/:id", (req, res) => {
  const recipeId = parseInt(req.params.id);
  recipes = recipes.filter((recipe) => recipe.id !== recipeId);
  saveData(recipesFile, recipes);
  res.sendStatus(204);
});

// Endpunkte für Wochenpläne
app.get("/plans", (req, res) => {
  res.json(plans);
});

app.post("/plans", (req, res) => {
  const { name, plan } = req.body;
  plans[name] = plan;
  saveData(plansFile, plans);
  res.sendStatus(200);
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
