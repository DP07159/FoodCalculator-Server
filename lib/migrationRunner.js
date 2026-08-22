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


function parseEnsureColumnDirectives(sql) {
    return String(sql || "")
        .split(/\r?\n/)
        .map(line => line.match(/^\s*--\s*@ensure-column\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*$/))
        .filter(Boolean)
        .map(match => ({
            tableName: match[1],
            columnName: match[2],
            definition: match[3]
        }));
}

async function tableExists(connection, tableName) {
    const row = await connection.get(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name = ?
         LIMIT 1`,
        [tableName]
    );
    return Boolean(row);
}

async function ensureColumnForMigration(connection, directive) {
    const exists = await tableExists(connection, directive.tableName);

    // Bei einer frischen Smoke-Test-DB kann die Legacy-Tabelle noch fehlen.
    // In diesem Fall darf die SQL-Migration sie anschließend vollständig anlegen.
    if (!exists) {
        return;
    }

    const columns = await connection.all(
        `PRAGMA table_info("${directive.tableName}")`
    );

    if (columns.some(column => column.name === directive.columnName)) {
        return;
    }

    await connection.run(
        `ALTER TABLE "${directive.tableName}"
         ADD COLUMN "${directive.columnName}" ${directive.definition}`
    );
}

async function applyEnsureColumnDirectives(connection, sql) {
    const directives = parseEnsureColumnDirectives(sql);

    for (const directive of directives) {
        await ensureColumnForMigration(connection, directive);
    }
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
            await applyEnsureColumnDirectives(connection, migration.sql);
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
