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

// ✅ TEST-ROUTE, um zu sehen, ob das Backend läuft
app.get('/test', (req, res) => {
    res.json({ message: "✅ API funktioniert!" });
});

// ✅ SERVER STARTEN
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
