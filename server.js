const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dbPath = "./db.json";

// API: Rezepte abrufen
app.get("/recipes", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    res.json(db.recipes);
});

// API: Rezept hinzufügen
app.post("/recipes", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    const newRecipe = req.body;
    newRecipe.id = Date.now(); // Eindeutige ID
    db.recipes.push(newRecipe);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.status(201).json(newRecipe);
});

// API: Rezept löschen
app.delete("/recipes/:id", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    db.recipes = db.recipes.filter((recipe) => recipe.id !== parseInt(req.params.id));
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.status(200).json({ message: "Rezept gelöscht" });
});

// API: Wochenpläne abrufen
app.get("/weekplans", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    res.json(db.weekplans);
});

// API: Wochenplan speichern
app.post("/weekplans", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    const newPlan = req.body;
    newPlan.id = Date.now(); // Eindeutige ID
    db.weekplans.push(newPlan);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.status(201).json(newPlan);
});

// API: Wochenplan löschen
app.delete("/weekplans/:id", (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    db.weekplans = db.weekplans.filter((plan) => plan.id !== parseInt(req.params.id));
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.status(200).json({ message: "Wochenplan gelöscht" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
