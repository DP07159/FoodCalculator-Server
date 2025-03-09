const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();  // ← FEHLTE VIELLEICHT!
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

const router = express.Router();
const db = new sqlite3.Database("food_calculator.sqlite");
const SECRET_KEY = "deinGeheimerSchluessel"; // Später in ENV-Variablen speichern!

// Registrierung
router.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    // Prüfen, ob Benutzer bereits existiert
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
        if (row) return res.status(400).json({ error: "E-Mail bereits registriert" });

        // Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10);

        // Neuen Benutzer speichern
        db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", 
               [username, email, hashedPassword], (err) => {
            if (err) return res.status(500).json({ error: "Fehler bei der Registrierung" });
            res.status(201).json({ message: "Benutzer erfolgreich registriert" });
        });
    });
});

// Login
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (!user) return res.status(400).json({ error: "Ungültige E-Mail oder Passwort" });

        // Passwort vergleichen
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Ungültige E-Mail oder Passwort" });

        // JWT-Token erstellen
        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: "2h" });

        res.json({ message: "Login erfolgreich", token });
    });
});

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Nicht autorisiert" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Ungültiges Token" });
        req.user = decoded; // Benutzerinfo in Request speichern
        next();
    });
};

app.get('/check-db', async (req, res) => {
    db.all('PRAGMA table_info(recipes);', (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Fehler beim Überprüfen der Tabelle' });
            return;
        }
        res.json(rows);
    });
});

// ✅ SERVER STARTEN
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
