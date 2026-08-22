const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const service = require("../src/modules/recipes/workspaceMigrationService");

async function main() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await service.assignLegacyRecipesToPersonalWorkspace(
        process.env.FC_OWNER_EMAIL || ""
    );

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
