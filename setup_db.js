const sqlite3 = require("sqlite3").verbose();

// **Datenbank initialisieren**
const db = new sqlite3.Database("./food_calculator.sqlite", (err) => {
  if (err) {
    console.error("❌ Fehler beim Öffnen der Datenbank:", err.message);
  } else {
    console.log("✅ Erfolgreich mit SQLite verbunden.");
  }
});

// **Tabelle für Rezepte erstellen**
db.run(
  `CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    mealTypes TEXT NOT NULL
  )`,
  (err) => {
    if (err) console.error("❌ Fehler beim Erstellen der Tabelle:", err.message);
    else console.log("✅ Tabelle 'recipes' erfolgreich erstellt.");
  }
);

// **Datenbank schließen**
db.close((err) => {
  if (err) console.error("❌ Fehler beim Schließen der Datenbank:", err.message);
  else console.log("✅ Datenbank erfolgreich eingerichtet.");
});
