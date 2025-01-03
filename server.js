// Abhängigkeiten importieren
const express = require('express');
const cors = require('cors'); // Für Cross-Origin Resource Sharing
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // Port-Variable für Render oder lokal

// Middleware aktivieren
app.use(cors()); // Erlaubt externe Anfragen (z. B. von GitHub Pages)
app.use(express.json()); // Verarbeitet eingehende JSON-Daten

// Pfad zur Datei, in der die Daten gespeichert werden
const DATA_FILE = path.join(__dirname, 'data.json');

// Funktion zum Lesen der Daten aus der Datei
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        // Datei erstellen, falls sie nicht existiert
        writeData({ recipes: [], plans: {} });
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// Funktion zum Schreiben von Daten in die Datei
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// API-Endpunkte

// **GET /recipes**: Liefert alle Rezepte
app.get('/recipes', (req, res) => {
    const data = readData();
    res.json(data.recipes);
});

// **POST /recipes**: Fügt ein neues Rezept hinzu
app.post('/recipes', (req, res) => {
    const data = readData();
    const newRecipe = req.body;

    if (!newRecipe.name || !newRecipe.calories || !newRecipe.mealTypes) {
        return res.status(400).json({ message: 'Name, Kalorien und Mahlzeittypen sind erforderlich' });
    }

    // Rezept zur Liste hinzufügen
    data.recipes.push(newRecipe);
    writeData(data);

    res.status(201).json({ message: 'Rezept erfolgreich hinzugefügt' });
});

// **DELETE /recipes/:name**: Löscht ein Rezept anhand seines Namens
app.delete('/recipes/:name', (req, res) => {
    const data = readData();
    const recipeName = req.params.name;

    // Prüfen, ob das Rezept existiert
    const recipeIndex = data.recipes.findIndex((recipe) => recipe.name === recipeName);
    if (recipeIndex === -1) {
        return res.status(404).json({ message: 'Rezept nicht gefunden' });
    }

    // Rezept löschen
    data.recipes.splice(recipeIndex, 1);
    writeData(data);

    res.status(200).json({ message: `Rezept "${recipeName}" erfolgreich gelöscht` });
});

// **GET /plans/:name**: Liefert einen spezifischen Wochenplan
app.get('/plans/:name', (req, res) => {
    const data = readData();
    const plan = data.plans[req.params.name];
    if (plan) {
        res.json(plan);
    } else {
        res.status(404).json({ message: 'Plan nicht gefunden' });
    }
});

// **POST /plans**: Speichert einen neuen Wochenplan
app.post('/plans', (req, res) => {
    const data = readData();
    const { name, plan } = req.body;

    if (!name || !plan) {
        return res.status(400).json({ message: 'Name und Plan sind erforderlich' });
    }

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

    app.get('/plans/:name', (req, res) => {
    const data = readData();
    const plan = data.plans[req.params.name];
    if (plan) {
        res.json(plan);
    } else {
        res.status(404).json({ message: 'Plan nicht gefunden' });
    }
});

    // Plan speichern
    data.plans[name] = plan;
    writeData(data);

    res.status(201).json({ message: `Plan "${name}" erfolgreich gespeichert` });
});

// Server starten
app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});
