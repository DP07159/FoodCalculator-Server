const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(cors());

// Daten aus der Datei lesen
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Fehler beim Lesen der Datei:', error);
        return { recipes: [], plans: {} };
    }
}

// Daten in die Datei schreiben
function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Fehler beim Schreiben der Datei:', error);
    }
}

// API-Endpunkte

// Alle Rezepte abrufen
app.get('/recipes', (req, res) => {
    const data = readData();
    res.json(data.recipes);
});

// Neues Rezept hinzufügen
app.post('/recipes', (req, res) => {
    const data = readData();
    const newRecipe = req.body;

    if (!newRecipe.name || !newRecipe.calories || !newRecipe.mealTypes) {
        return res.status(400).json({ message: 'Name, Kalorien und Mahlzeiten-Typen sind erforderlich' });
    }

    data.recipes.push(newRecipe);
    writeData(data);

    res.status(201).json({ message: 'Rezept erfolgreich hinzugefügt' });
});

// Rezept löschen
app.delete('/recipes/:name', (req, res) => {
    const data = readData();
    const recipeName = req.params.name;

    const updatedRecipes = data.recipes.filter((recipe) => recipe.name !== recipeName);
    if (updatedRecipes.length === data.recipes.length) {
        return res.status(404).json({ message: 'Rezept nicht gefunden' });
    }

    data.recipes = updatedRecipes;
    writeData(data);

    res.json({ message: `Rezept "${recipeName}" erfolgreich gelöscht` });
});

// Alle Pläne abrufen
app.get('/plans', (req, res) => {
    const data = readData();
    res.json(data.plans);
});

// Plan speichern
app.post('/plans', (req, res) => {
    const data = readData();
    const { name, plan } = req.body;

    if (!name || !plan) {
        return res.status(400).json({ message: 'Name und Plan sind erforderlich' });
    }

    data.plans[name] = plan;
    writeData(data);

    res.status(201).json({ message: `Plan "${name}" erfolgreich gespeichert` });
});

// Plan abrufen
app.get('/plans/:name', (req, res) => {
    const data = readData();
    const plan = data.plans[req.params.name];
    if (plan) {
        res.json(plan);
    } else {
        res.status(404).json({ message: 'Plan nicht gefunden' });
    }
});

// Plan löschen
app.delete('/plans/:name', (req, res) => {
    const data = readData();
    const planName = req.params.name;

    if (!data.plans[planName]) {
        return res.status(404).json({ message: 'Plan nicht gefunden' });
    }

    delete data.plans[planName];
    writeData(data);

    res.json({ message: `Plan "${planName}" erfolgreich gelöscht` });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
