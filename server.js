const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./database.sqlite');

app.use(express.json());
app.use(cors());

const SECRET_KEY = "supergeheimespasswort"; // Sicherer Schlüssel für Token

// **User-Registrierung**
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Benutzername & Passwort erforderlich" });

    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "Registrierung erfolgreich!" });
    });
});

// **User-Login**
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: "Ungültige Anmeldedaten" });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: "24h" });
        res.json({ message: "Login erfolgreich!", token });
    });
});

// **User authentifizieren & Daten abrufen**
function authenticateToken(req, res, next) {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ error: "Kein Token vorhanden" });

    jwt.verify(token.split(" ")[1], SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Token ungültig" });
        req.user = user;
        next();
    });
}

// **User-Daten abrufen**
app.get('/me', authenticateToken, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username });
});

app.listen(3000, () => console.log('Server läuft auf Port 3000'));
