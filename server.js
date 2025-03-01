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
app.use(cors());
const bcrypt = require('bcrypt');

// ✅ Registrierung (POST /register)
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
            if (err) {
                return res.status(500).json({ error: "❌ Fehler bei der Registrierung" });
            }
            res.status(201).json({ message: "✅ Registrierung erfolgreich!", userId: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: "❌ Fehler beim Hashing des Passworts" });
    }
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
