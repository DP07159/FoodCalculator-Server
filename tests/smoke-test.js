const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase, configureDatabase } = require("../lib/database");
const { runMigrations } = require("../lib/migrationRunner");

async function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodcalc-smoke-"));
    const databasePath = path.join(tempDir, "smoke.sqlite");
    const connection = openDatabase(databasePath);

    try {
        await configureDatabase(connection);
        const firstRun = await runMigrations(connection);
        const secondRun = await runMigrations(connection);
        const foreignKeys = await connection.get("PRAGMA foreign_keys");
        const integrity = await connection.get("PRAGMA integrity_check");
        const migrations = await connection.all("SELECT version, filename FROM schema_migrations ORDER BY version");

        if (Number(foreignKeys.foreign_keys) !== 1) throw new Error("Foreign Keys sind nicht aktiv.");
        if (integrity.integrity_check !== "ok") throw new Error("SQLite Integrity Check ist fehlgeschlagen.");
        if (firstRun.appliedNow.length !== firstRun.totalKnown) {
            throw new Error(
                `Beim ersten Lauf wurden ${firstRun.appliedNow.length} von ${firstRun.totalKnown} Migrationen angewendet.`
            );
        }
        if (secondRun.appliedNow.length !== 0) throw new Error("Migration Runner ist nicht idempotent.");

        console.log(JSON.stringify({ ok: true, foreignKeys: true, integrity: "ok", firstRun, secondRun, migrations }, null, 2));
    } finally {
        await connection.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
