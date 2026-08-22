const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const service = require("../src/core/authorization/accessManagementService");

async function main() {
    const email = process.env.FC_TARGET_EMAIL || "";
    const workspacePublicId = process.env.FC_WORKSPACE_ID || "";

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await service.getManagedAccess({
        email,
        workspacePublicId
    });

    if (result.error) throw new Error(result.error);

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
