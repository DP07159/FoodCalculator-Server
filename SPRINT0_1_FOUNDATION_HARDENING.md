# Food Calculator – Sprint 0.1 Foundation Hardening

## Verbindliche Festlegung Benutzer-IDs

Für die V2-Plattform gilt:

- `users.id`: interne relationale ID (`INTEGER PRIMARY KEY`)
- `users.public_id`: externe, nicht erratbare UUID (`TEXT UNIQUE NOT NULL`)
- Fremdschlüssel innerhalb der SQLite-Datenbank referenzieren die interne `id`.
- Öffentliche APIs verwenden nach Möglichkeit ausschließlich `public_id`.

Damit wird der detaillierte Tabellenentwurf aus dem Lastenheft V2.1 als technische Ausführungsregel verwendet.

## Einheitliche Datenbankschicht

Kanonische Datenbankschicht:

`src/database/database.js`

Sie wird sowohl von der laufenden Anwendung als auch von Migration-, Backup-, Restore- und Smoke-Test-Werkzeugen verwendet. `lib/database.js` bleibt nur als kompatibler Re-Export bestehen.

## Datenbankpfad

1. `DB_PATH`, falls gesetzt
2. Render: `/var/data/food_calculator.sqlite`
3. lokal: `data/food_calculator.sqlite`

## Startverhalten

Beim Serverstart werden in dieser Reihenfolge ausgeführt:

1. SQLite-Sicherheits-/Integritätspragmas (`foreign_keys`, WAL, `busy_timeout`)
2. versionierte Migrationen
3. bestehende rückwärtskompatible V1-Schema-Initialisierung
4. Start des HTTP-Servers

Versionierte Migrationen sind idempotent und werden über `schema_migrations` protokolliert.

## Befehle

- `npm run smoke`
- `npm run migrate`
- `npm run backup`
- `npm run restore:test -- <backup.sqlite>`
- `npm run test:ingredients`
- `npm start`
