const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());

const DATA_FILE = './data.json';

// Daten lesen
function readData() {
    if (!fs.existsSync(DATA_FILE)) return { recipes: [], plans: {} };
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

// Daten schreiben
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Endpunkte
app.get('/recipes', (req, res) => {
    res.json(readData().recipes);
});

app.get('/plans', (req, res) => {
    res.json(readData().plans);
});

app.get('/plans/:name', (req, res) => {
    const data = readData();
    res.json(data.plans[req.params.name] || {});
});

app.post('/plans', (req, res) => {
    const data = readData();
    data.plans[req.body.name] = req.body.plan;
    writeData(data);
    res.status(201).json({ message: "Plan gespeichert" });
});

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});
