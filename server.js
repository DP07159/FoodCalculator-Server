const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('❌ Fehler beim Verbinden mit SQLite:', err.message);
    } else {
        console.log('✅ Erfolgreich mit SQLite verbunden (users.db)');
    }
});

// ✅ User-Tabelle erstellen (falls nicht existiert)
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
)`);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
const bcrypt = require('bcrypt');

// Register Route
app.post('/register', (req, res) => {
    console.log("📢 Registrierungs-Anfrage erhalten. RAW-Body:", req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
        console.log("❌ FEHLER: Der Server empfängt KEINE Daten!");
        return res.status(400).json({ error: "❌ Der Server empfängt KEINE Daten!" });
    }

    const { username, password } = req.body;

    if (!username || !password) {
        console.log("❌ Fehler: Benutzername oder Passwort fehlt!", req.body);
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    res.json({ message: "✅ Registrierungstests erfolgreich!", receivedData: req.body });
});

// ✅ Login (POST /login)
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: "❌ Benutzer nicht gefunden!" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "❌ Falsches Passwort!" });
        }

        res.json({ message: "✅ Login erfolgreich!", userId: user.id });
    });
});

// ✅ TEST-ROUTE, um zu sehen, ob das Backend läuft
app.get('/test', (req, res) => {
    res.json({ message: "✅ API funktioniert!" });
});

// ✅ SERVER STARTEN
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
