const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const provisioningService = require("../src/core/identity/provisioningService");

async function main() {
    const email = process.env.FC_USER_EMAIL || "";
    const status = process.env.FC_USER_STATUS || "";

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await provisioningService.setManagedUserStatus({ email, status });
    if (result.error) throw new Error(result.error);

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
