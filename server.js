console.log("🚀 Server gestartet...");

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./database.sqlite');

app.use(express.json());
app.use(cors());

const SECRET_KEY = "supergeheimespasswort"; // ⚠ Sichere dies in einer .env-Datei für ein echtes Projekt!

// **🔑 Registrierung mit Passwort-Hashing**
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    // 🔍 Passwortprüfung (muss mit Regex aus script.js übereinstimmen)
    const passwordRegex = /^(?=.*[A-Z])(?=.*\W).{6,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: "❌ Passwort zu schwach!" });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function (err) {
        if (err) return res.status(500).json({ error: "❌ Fehler beim Speichern in die Datenbank!" });

        // 🚀 Automatisches Login nach Registrierung
        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
        res.status(201).json({ token });
    });
});

// **🔑 Login**
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: "❌ Ungültige Anmeldedaten!" });
        }

        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
        res.json({ token });
    });
});

// **🌍 Server starten**
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));

app._router.stack.forEach(layer => {
    if (layer.route) {
        console.log("🔹 Route:", layer.route.path);
    }
});
