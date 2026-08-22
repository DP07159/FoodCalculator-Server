const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const authorizationService = require("../src/core/authorization/service");

async function main() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const results = await authorizationService.bootstrapOwnerAuthorization();

    console.log(JSON.stringify({
        ok: true,
        owner_memberships_processed: results.length,
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
