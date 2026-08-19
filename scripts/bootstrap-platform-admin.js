const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const service = require("../src/core/platformAdmin/service");

async function main() {
    const email = String(
        process.env.FC_PLATFORM_ADMIN_EMAIL || ""
    ).trim();

    if (!email) {
        throw new Error("FC_PLATFORM_ADMIN_EMAIL ist erforderlich.");
    }

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await service.bootstrapFirstPlatformAdmin(email);

    if (result.error) {
        throw new Error(result.error);
    }

    console.log(JSON.stringify({
        ok: true,
        ...result
    }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({
        ok: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
