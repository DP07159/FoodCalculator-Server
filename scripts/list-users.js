const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const provisioningService = require("../src/core/identity/provisioningService");

async function main() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const users = await provisioningService.listManagedUsers();
    console.log(JSON.stringify({ ok: true, count: users.length, users }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
