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
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
    secret: 'deinGeheimerSchlüssel',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Falls HTTPS, setze secure: true
}));

// ✅ Registrierung (POST /register)
app.post('/register', async (req, res) => {
    console.log("📢 Registrierungs-Anfrage erhalten mit Daten:", req.body);

    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "❌ Bitte Benutzername & Passwort eingeben!" });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, existingUser) => {
        if (err) {
            console.error("❌ Datenbankfehler:", err.message);
            return res.status(500).json({ error: "❌ Fehler bei der Registrierung!" });
        }
        if (existingUser) {
            return res.status(409).json({ error: "❌ Dieser Benutzername ist bereits vergeben!" });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
                if (err) {
                    console.error("❌ Fehler beim Speichern des Users:", err.message);
                    return res.status(500).json({ error: "❌ Fehler bei der Registrierung!" });
                }
                console.log(`✅ User mit ID ${this.lastID} gespeichert!`);
                res.status(201).json({ message: "✅ Registrierung erfolgreich!" });
            });
        } catch (err) {
            console.error("❌ Fehler beim Hashing:", err.message);
            res.status(500).json({ error: "❌ Fehler beim Hashing des Passworts!" });
        }
    });
});

// ✅ Login (POST /login)
app.post('/login', (req, res) => {
    console.log("📢 Login-Anfrage erhalten:", req.body);

    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) {
            console.error("❌ Datenbankfehler:", err.message);
            return res.status(500).json({ error: "❌ Fehler beim Abrufen der Benutzerdaten!" });
        }
        if (!user) {
            return res.status(401).json({ error: "❌ Benutzername existiert nicht!" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "❌ Falsches Passwort!" });
        }

        // ✅ Nutzer in Session speichern
        req.session.userId = user.id;
        req.session.username = user.username;

        console.log("✅ Login erfolgreich für:", username);
        res.json({ 
            message: "✅ Login erfolgreich!", 
            userId: user.id,
            redirect: "/dashboard"  // Hier die Weiterleitung nach Login
        });
    });
});

// ✅ Middleware für Authentifizierung
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: "❌ Nicht eingeloggt!" });
    }
}

// ✅ Geschützte Route nach Login (Dashboard / Food Calculator)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.json({ message: `Willkommen, ${req.session.username}!`, userId: req.session.userId });
});

// ✅ Login (POST /login)
app.post('/login', (req, res) => {
    console.log("📢 Login-Anfrage erhalten:", req.body);

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "❌ Benutzername & Passwort erforderlich!" });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) {
            console.log("❌ Datenbankfehler:", err.message);
            return res.status(500).json({ error: "❌ Fehler beim Abrufen der Benutzerdaten!" });
        }
        if (!user) {
            console.log("❌ Benutzername nicht gefunden!");
            return res.status(401).json({ error: "❌ Benutzername existiert nicht!" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            console.log("❌ Falsches Passwort!");
            return res.status(401).json({ error: "❌ Falsches Passwort!" });
        }

        console.log("✅ Login erfolgreich für:", username);
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
