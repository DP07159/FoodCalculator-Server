const sqlite3 = require("sqlite3").verbose();

// **Datenbank öffnen**
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) {
    console.error("❌ Fehler beim Öffnen der Datenbank:", err.message);
  } else {
    console.log("✅ Erfolgreich mit der SQLite-Datenbank verbunden.");
  }
});

// **mealTypes-Spalte hinzufügen, falls sie nicht existiert**
db.run(
  "ALTER TABLE recipes ADD COLUMN mealTypes TEXT",
  [],
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.error("❌ Fehler beim Hinzufügen der Spalte:", err.message);
    } else {
      console.log("✅ Spalte 'mealTypes' existiert oder wurde erfolgreich hinzugefügt.");
    }
  }
);

// **mealTypes-Strings in JSON umwandeln**
db.run(
  `UPDATE recipes SET mealTypes = json(mealTypes) WHERE json_valid(mealTypes)`,
  [],
  (err) => {
    if (err) {
      console.error("❌ Fehler beim Umwandeln von mealTypes in JSON:", err.message);
    } else {
      console.log("✅ mealTypes erfolgreich in JSON umgewandelt.");
    }
  }
);

// **Datenbank schließen**
db.close((err) => {
  if (err) {
    console.error("❌ Fehler beim Schließen der Datenbank:", err.message);
  } else {
    console.log("✅ SQLite-Datenbank erfolgreich aktualisiert.");
  }
});
