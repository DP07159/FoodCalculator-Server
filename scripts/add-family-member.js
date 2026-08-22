const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const service = require("../src/core/workspaces/sharedWorkspaceService");

async function main() {
    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const result = await service.addFamilyMember({
        workspacePublicId: process.env.FC_WORKSPACE_ID || "",
        memberEmail: process.env.FC_MEMBER_EMAIL || "",
        actorEmail: process.env.FC_ACTOR_EMAIL || "",
        roleCode: process.env.FC_ROLE_CODE || "family_user"
    });

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
