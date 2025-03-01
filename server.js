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

// Register Route
const bcrypt = require('bcrypt');

app.post('/register', async (req, res) => {
    console.log("📢 Registrierungs-Anfrage erhalten mit Daten:", req.body);

    const { username, password } = req.body;

    if (!username || !password) {
        console.log("❌ Fehler: Benutzername oder Passwort fehlt!", req.body);
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log("🔑 Passwort erfolgreich gehasht:", hashedPassword);

        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
            if (err) {
                console.log("❌ Fehler beim Speichern des Users:", err.message);
                return res.status(500).json({ error: "❌ Fehler bei der Registrierung" });
            }
            console.log(`✅ User mit ID ${this.lastID} gespeichert!`);
            res.status(201).json({ message: "✅ Registrierung erfolgreich!", userId: this.lastID });
        });
    } catch (err) {
        console.log("❌ Fehler beim Hashing:", err.message);
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
