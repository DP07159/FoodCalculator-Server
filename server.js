// Abhängigkeiten importieren
const express = require('express');
const cors = require('cors'); // Für CORS
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // Nutze den Port von Render oder Standard-Port 3000

// Middleware aktivieren
app.use(cors()); // Erlaubt Anfragen von externen Quellen
app.use(express.json()); // Zum Verarbeiten von JSON-Daten

// Pfad zur JSON-Datei, in der Rezepte und Pläne gespeichert werden
const DATA_FILE = path.join(__dirname, 'data.json');

// Funktion zum Lesen der Daten aus der Datei
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        // Falls Datei nicht existiert, erstelle eine mit Standardwerten
        writeData({ recipes: [], plans: {} });
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// Funktion zum Schreiben von Daten in die Datei
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Routen

// Rezepte abrufen
app.get('/recipes', (req, res) => {
    const data = readData();
    res.json(data.recipes);
});

// Alle gespeicherten Wochenpläne abrufen
app.get('/plans', (req, res) => {
    const data = readData();
    res.json(data.plans);
});

// Einzelnen Wochenplan abrufen
app.get('/plans/:name', (req, res) => {
    const data = readData();
    const plan = data.plans[req.params.name];
    if (plan) {
        res.json(plan);
    } else {
        res.status(404).json({ message: 'Plan nicht gefunden' });
    }
});

// Neuen Wochenplan speichern
app.post('/plans', (req, res) => {
    const data = readData();
    const { name, plan } = req.body;

    if (!name || !plan) {
        return res.status(400).json({ message: 'Name und Plan sind erforderlich' });
    }

    data.plans[name] = plan;
    writeData(data);
    res.status(201).json({ message: 'Plan gespeichert' });
});

// Server starten
app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});
