const crypto = require("crypto");
const { openDatabase, configureDatabase, resolveDatabasePath } = require("../lib/database");
const { runMigrations } = require("../lib/migrationRunner");

async function main() {
    const databasePath = resolveDatabasePath();
    const connection = openDatabase(databasePath);
    const runId = crypto.randomUUID();

    try {
        await configureDatabase(connection);
        const result = await runMigrations(connection);
        await connection.run(
            `INSERT INTO migration_runs (run_id, database_path, status, finished_at, report_json)
             VALUES (?, ?, 'succeeded', CURRENT_TIMESTAMP, ?)`,
            [runId, databasePath, JSON.stringify(result)]
        );
        console.log(JSON.stringify({ ok: true, databasePath, ...result }, null, 2));
    } catch (error) {
        console.error(JSON.stringify({ ok: false, databasePath, error: error.message }, null, 2));
        process.exitCode = 1;
    } finally {
        await connection.close().catch(() => {});
    }
}

main();
