const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./food_calculator.sqlite');

// Prüfen, ob die Felder bereits existieren, und dann hinzufügen
db.serialize(() => {
    db.run(`ALTER TABLE recipes ADD COLUMN ingredients TEXT`, (err) => {
        if (err) {
            console.log('Das Feld "ingredients" existiert bereits.');
        } else {
            console.log('Feld "ingredients" wurde erfolgreich hinzugefügt.');
        }
    });

    db.run(`ALTER TABLE recipes ADD COLUMN instructions TEXT`, (err) => {
        if (err) {
            console.log('Das Feld "instructions" existiert bereits.');
        } else {
            console.log('Feld "instructions" wurde erfolgreich hinzugefügt.');
        }
    });

    db.close();
});
