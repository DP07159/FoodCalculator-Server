const express = require("express");
const fs = require("fs");
const cors = require("cors");
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rezeptdatenbank-Pfad
const RECIPES_FILE = __dirname + "/recipes.json";

// API: Rezepte abrufen
app.get("/recipes", (req, res) => {
  fs.readFile(RECIPES_FILE, (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Failed to load recipes" });
    }
    res.json(JSON.parse(data));
  });
});

// API: Neues Rezept hinzufügen
app.post("/recipes", (req, res) => {
  const newRecipe = req.body;

  // Rezepte laden
  fs.readFile(RECIPES_FILE, (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Failed to load recipes" });
    }

    const recipes = JSON.parse(data);

    // Neues Rezept mit einer eindeutigen ID hinzufügen
    newRecipe.id = recipes.length ? recipes[recipes.length - 1].id + 1 : 1;
    recipes.push(newRecipe);

    // Rezepte speichern
    fs.writeFile(RECIPES_FILE, JSON.stringify(recipes, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to save recipe" });
      }
      res.json(newRecipe);
    });
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
