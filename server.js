const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Daten im Arbeitsspeicher (kein JSON-File notwendig)
let recipes = [];

// API: Alle Rezepte abrufen
app.get("/api/recipes", (req, res) => {
    res.json(recipes);
});

// API: Rezept hinzufügen
app.post("/api/recipes", (req, res) => {
    const newRecipe = req.body;
    recipes.push(newRecipe);
    res.status(201).send("Rezept hinzugefügt.");
});

// API: Rezept löschen
app.delete("/api/recipes/:index", (req, res) => {
    const index = parseInt(req.params.index);
    if (index >= 0 && index < recipes.length) {
        recipes.splice(index, 1);
        res.send("Rezept gelöscht.");
    } else {
        res.status(404).send("Rezept nicht gefunden.");
    }
});

// Server starten
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
