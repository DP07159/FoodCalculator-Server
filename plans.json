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

// API: Rezepte abrufen
app.get("/recipes", (req, res) => {
  fs.readFile(RECIPES_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });
    res.json(JSON.parse(data));
  });
});

// API: Neues Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const newRecipe = req.body;

  fs.readFile(RECIPES_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });

    const recipes = JSON.parse(data);
    newRecipe.id = recipes.length ? recipes[recipes.length - 1].id + 1 : 1;
    recipes.push(newRecipe);

    fs.writeFile(RECIPES_FILE, JSON.stringify(recipes, null, 2), (err) => {
      if (err) return res.status(500).json({ error: "Failed to save recipe" });
      res.json(newRecipe);
    });
  });
});

// API: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
  const recipeId = parseInt(req.params.id);

  fs.readFile(RECIPES_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load recipes" });

    const recipes = JSON.parse(data);
    const updatedRecipes = recipes.filter((recipe) => recipe.id !== recipeId);

    fs.writeFile(RECIPES_FILE, JSON.stringify(updatedRecipes, null, 2), (err) => {
      if (err) return res.status(500).json({ error: "Failed to delete recipe" });
      res.status(204).end();
    });
  });
});

// API: Wochenpläne abrufen
app.get("/plans", (req, res) => {
  fs.readFile(PLANS_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load plans" });
    res.json(JSON.parse(data));
  });
});

// API: Neuen Wochenplan speichern
app.post("/plans", (req, res) => {
  const { name, plan } = req.body;

  fs.readFile(PLANS_FILE, (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to load plans" });

    const plans = JSON.parse(data);
    plans[name] = plan;

    fs.writeFile(PLANS_FILE, JSON.stringify(plans, null, 2), (err) => {
      if (err) return res.status(500).json({ error: "Failed to save plan" });
      res.status(201).json({ message: "Plan saved successfully" });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
