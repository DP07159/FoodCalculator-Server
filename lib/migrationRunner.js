const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9_-]+\.sql$/i;

function checksum(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureMigrationTable(connection) {
    await connection.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            checksum TEXT NOT NULL,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            duration_ms INTEGER NOT NULL
        )
    `);
}

function readMigrationFiles(migrationsDir) {
    return fs.readdirSync(migrationsDir)
        .filter(file => MIGRATION_FILE_PATTERN.test(file))
        .sort()
        .map(filename => {
            const fullPath = path.join(migrationsDir, filename);
            const sql = fs.readFileSync(fullPath, "utf8");
            return {
                version: filename.slice(0, 4),
                filename,
                sql,
                checksum: checksum(sql)
            };
        });
}

async function runMigrations(connection, options = {}) {
    const migrationsDir = options.migrationsDir || path.join(__dirname, "..", "migrations");
    await ensureMigrationTable(connection);

    const appliedRows = await connection.all("SELECT version, filename, checksum FROM schema_migrations ORDER BY version");
    const appliedByVersion = new Map(appliedRows.map(row => [row.version, row]));
    const files = readMigrationFiles(migrationsDir);
    const appliedNow = [];

    for (const migration of files) {
        const existing = appliedByVersion.get(migration.version);
        if (existing) {
            if (existing.filename !== migration.filename || existing.checksum !== migration.checksum) {
                throw new Error(`Migration ${migration.version} wurde nachträglich verändert (${migration.filename}).`);
            }
            continue;
        }

        const startedAt = Date.now();
        await connection.exec("BEGIN IMMEDIATE TRANSACTION;");
        try {
            await connection.exec(migration.sql);
            await connection.run(
                `INSERT INTO schema_migrations (version, filename, checksum, duration_ms)
                 VALUES (?, ?, ?, ?)`,
                [migration.version, migration.filename, migration.checksum, Date.now() - startedAt]
            );
            await connection.exec("COMMIT;");
            appliedNow.push(migration.filename);
        } catch (error) {
            await connection.exec("ROLLBACK;");
            throw new Error(`Migration ${migration.filename} fehlgeschlagen: ${error.message}`);
        }
    }

    return { appliedNow, totalKnown: files.length };
}

module.exports = { runMigrations, readMigrationFiles };
