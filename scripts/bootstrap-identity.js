const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const identityService = require("../src/core/identity/service");

function readArgs(argv) {
    const values = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;
        const key = arg.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
        values[key] = value;
    }
    return values;
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const payload = {
        email: args.email || process.env.INITIAL_USER_EMAIL,
        display_name: args.name || process.env.INITIAL_USER_DISPLAY_NAME,
        password: args.password || process.env.INITIAL_USER_PASSWORD,
        locale: args.locale || process.env.INITIAL_USER_LOCALE || "de-DE"
    };

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await identityService.bootstrapInitialUser(payload);
    if (result.error) throw new Error(result.error);

    console.log(JSON.stringify({
        ok: true,
        message: "Initialer Benutzer wurde angelegt. Rollen und Workspace-Zuordnung folgen in den nächsten Sprints.",
        user: result.user
    }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
