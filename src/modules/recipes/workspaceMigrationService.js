const database = require("../../database/database");
const identityRepository = require("../../core/identity/repository");
const workspaceRepository = require("../../core/workspaces/repository");

async function assignLegacyRecipesToPersonalWorkspace(ownerEmail) {
    const owner = await identityRepository.findUserByEmail(ownerEmail);

    if (!owner || owner.status !== "active" || owner.deleted_at) {
        throw new Error("Aktiver Owner-Benutzer wurde nicht gefunden.");
    }

    const workspace = await workspaceRepository.findPersonalWorkspaceByOwnerUserId(owner.id);

    if (!workspace) {
        throw new Error("Persönlicher Workspace des Owners wurde nicht gefunden.");
    }

    const before = await database.get(
        `SELECT COUNT(*) AS count
         FROM recipes
         WHERE workspace_id IS NULL`
    );

    const result = await database.run(
        `UPDATE recipes
         SET workspace_id = ?,
             owner_user_id = COALESCE(owner_user_id, ?),
             visibility = COALESCE(NULLIF(visibility, ''), 'workspace'),
             version = CASE WHEN version IS NULL OR version < 1 THEN 1 ELSE version END,
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id IS NULL`,
        [workspace.id, owner.id]
    );

    const after = await database.get(
        `SELECT COUNT(*) AS count
         FROM recipes
         WHERE workspace_id IS NULL`
    );

    return {
        owner: {
            public_id: owner.public_id,
            email: owner.email,
            display_name: owner.display_name
        },
        workspace: {
            public_id: workspace.public_id,
            name: workspace.name,
            workspace_type: workspace.workspace_type
        },
        unassigned_before: Number(before?.count) || 0,
        assigned_now: Number(result?.changes) || 0,
        unassigned_after: Number(after?.count) || 0
    };
}

module.exports = {
    assignLegacyRecipesToPersonalWorkspace
};
