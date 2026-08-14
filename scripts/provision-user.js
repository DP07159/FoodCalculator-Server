const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const provisioningService = require("../src/core/identity/provisioningService");

async function main() {
    const email = process.env.FC_USER_EMAIL || "";
    const displayName = process.env.FC_USER_NAME || "";
    const password = process.env.FC_USER_PASSWORD || "";
    const locale = process.env.FC_USER_LOCALE || "de-DE";
    const workspaceName = process.env.FC_USER_WORKSPACE || "Persönlicher Workspace";

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await provisioningService.provisionTestUser({
        email,
        display_name: displayName,
        password,
        locale,
        workspace_name: workspaceName
    });

    if (result.error) throw new Error(result.error);

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
