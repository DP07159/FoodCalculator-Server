const express = require("express");
const fs = require("fs");
const cors = require("cors");
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Pfade zu den JSON-Dateien
const RECIPES_FILE = __dirname + "/recipes.json";
const PLANS_FILE = __dirname + "/plans.json";

// Hilfsfunktion: Datei lesen
function readFile(filePath, callback) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return callback(err, null);
    try {
      const parsedData = JSON.parse(data || "[]");
      callback(null, parsedData);
    } catch (parseError) {
      callback(parseError, null);
    }
  });
}

// Hilfsfunktion: Datei schreiben
function writeFile(filePath, data, callback) {
  fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8", callback);
}

// API: Rezepte abrufen
app.get("/recipes", (req, res) => {
  readFile(RECIPES_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });
    res.json(data);
  });
});

// API: Neues Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const newRecipe = req.body;

  readFile(RECIPES_FILE, (err, recipes) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });

    newRecipe.id = recipes.length ? recipes[recipes.length - 1].id + 1 : 1;
    recipes.push(newRecipe);

    writeFile(RECIPES_FILE, recipes, (writeErr) => {
      if (writeErr) return res.status(500).json({ error: "Failed to save recipe" });
      res.status(201).json(newRecipe);
    });
  });
});

// API: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
  const recipeId = parseInt(req.params.id);

  readFile(RECIPES_FILE, (err, recipes) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });

    const updatedRecipes = recipes.filter((recipe) => recipe.id !== recipeId);

    writeFile(RECIPES_FILE, updatedRecipes, (writeErr) => {
      if (writeErr) return res.status(500).json({ error: "Failed to delete recipe" });
      res.status(204).end();
    });
  });
});

// API: Wochenpläne abrufen
app.get("/plans", (req, res) => {
  readFile(PLANS_FILE, (err, plans) => {
    if (err) return res.status(500).json({ error: "Failed to load plans" });
    res.json(plans);
  });
});

// API: Neuen Wochenplan speichern
app.post("/plans", (req, res) => {
  const { name, plan } = req.body;

  readFile(PLANS_FILE, (err, plans) => {
    if (err) return res.status(500).json({ error: "Failed to load plans" });

    plans[name] = plan;

    writeFile(PLANS_FILE, plans, (writeErr) => {
      if (writeErr) return res.status(500).json({ error: "Failed to save plan" });
      res.status(201).json({ message: "Plan saved successfully" });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
