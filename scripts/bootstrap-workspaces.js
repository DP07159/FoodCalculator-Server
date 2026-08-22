const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const workspaceService = require("../src/core/workspaces/service");

async function main() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const results = await workspaceService.bootstrapPersonalWorkspaces();

    console.log(JSON.stringify({
        ok: true,
        users_processed: results.length,
        created: results.filter(result => result.created).length,
        existing: results.filter(result => !result.created).length,
        results
    }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({
        ok: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
