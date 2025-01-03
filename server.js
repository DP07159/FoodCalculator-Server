const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const DATA_PATH = './data.json';

// API: Alle Rezepte abrufen
app.get('/api/recipes', (req, res) => {
    fs.readFile(DATA_PATH, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Fehler beim Laden der Rezepte');
        res.json(JSON.parse(data));
    });
});

// API: Rezept hinzufügen
app.post('/api/recipes', (req, res) => {
    const newRecipe = req.body;

    fs.readFile(DATA_PATH, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Fehler beim Speichern des Rezepts');
        
        const recipes = JSON.parse(data);
        recipes.push(newRecipe);

        fs.writeFile(DATA_PATH, JSON.stringify(recipes, null, 2), (err) => {
            if (err) return res.status(500).send('Fehler beim Speichern des Rezepts');
            res.status(201).send('Rezept gespeichert');
        });
    });
});

// API: Rezept löschen
app.delete('/api/recipes/:id', (req, res) => {
    const recipeId = parseInt(req.params.id);

    fs.readFile(DATA_PATH, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Fehler beim Löschen des Rezepts');

        const recipes = JSON.parse(data);
        const filteredRecipes = recipes.filter((_, index) => index !== recipeId);

        fs.writeFile(DATA_PATH, JSON.stringify(filteredRecipes, null, 2), (err) => {
            if (err) return res.status(500).send('Fehler beim Löschen des Rezepts');
            res.send('Rezept gelöscht');
        });
    });
});

// Server starten
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend läuft auf Port ${PORT}`);
});
