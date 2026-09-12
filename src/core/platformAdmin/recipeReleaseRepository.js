const { run, get, all } = require("../../database/database");

function listRecipesWithReleaseState() {
    return all(
        `SELECT
            r.id,
            r.name,
            r.visibility,
            r.created_at,
            r.updated_at,
            r.owner_user_id,
            u.display_name AS owner_display_name,
            u.email AS owner_email,
            w.id AS origin_workspace_id,
            w.public_id AS origin_workspace_public_id,
            w.name AS origin_workspace_name,
            w.workspace_type AS origin_workspace_type,
            prr.mode AS platform_release_mode
         FROM recipes r
         LEFT JOIN users u ON u.id = r.owner_user_id
         LEFT JOIN workspaces w ON w.id = r.workspace_id
         LEFT JOIN platform_recipe_releases prr ON prr.recipe_id = r.id
         WHERE COALESCE(r.visibility, 'workspace') <> 'archived'
         ORDER BY r.name COLLATE NOCASE ASC, r.id ASC`
    );
}

function findRecipe(recipeId) {
    return get(
        `SELECT r.*, w.public_id AS origin_workspace_public_id, w.name AS origin_workspace_name
         FROM recipes r
         LEFT JOIN workspaces w ON w.id = r.workspace_id
         WHERE r.id = ?
           AND COALESCE(r.visibility, 'workspace') <> 'archived'
         LIMIT 1`,
        [recipeId]
    );
}

function listSelectedReleaseWorkspaces(recipeId) {
    return all(
        `SELECT w.id, w.public_id, w.name, w.workspace_type
         FROM platform_recipe_release_workspaces prw
         INNER JOIN workspaces w ON w.id = prw.workspace_id
         WHERE prw.recipe_id = ?
           AND w.archived_at IS NULL
           AND w.status = 'active'
         ORDER BY w.name COLLATE NOCASE ASC`,
        [recipeId]
    );
}

function listActiveWorkspaces() {
    return all(
        `SELECT id, public_id, name, workspace_type, owner_user_id
         FROM workspaces
         WHERE archived_at IS NULL
           AND status = 'active'
         ORDER BY name COLLATE NOCASE ASC, id ASC`
    );
}

function findActiveWorkspacesByPublicIds(publicIds) {
    if (!publicIds.length) return Promise.resolve([]);
    const placeholders = publicIds.map(() => "?").join(",");
    return all(
        `SELECT id, public_id, name, workspace_type
         FROM workspaces
         WHERE public_id IN (${placeholders})
           AND archived_at IS NULL
           AND status = 'active'`,
        publicIds
    );
}

async function upsertRelease(recipeId, mode, actorUserId) {
    return run(
        `INSERT INTO platform_recipe_releases (
            recipe_id, mode, updated_by_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(recipe_id)
         DO UPDATE SET
            mode = excluded.mode,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = CURRENT_TIMESTAMP`,
        [recipeId, mode, actorUserId]
    );
}

function deleteRelease(recipeId) {
    return run(`DELETE FROM platform_recipe_releases WHERE recipe_id = ?`, [recipeId]);
}

function clearSelectedReleaseWorkspaces(recipeId) {
    return run(`DELETE FROM platform_recipe_release_workspaces WHERE recipe_id = ?`, [recipeId]);
}

async function addSelectedReleaseWorkspace(recipeId, workspaceId) {
    return run(
        `INSERT OR IGNORE INTO platform_recipe_release_workspaces (recipe_id, workspace_id)
         VALUES (?, ?)`,
        [recipeId, workspaceId]
    );
}

function listPlatformGrants(recipeId) {
    return all(
        `SELECT recipe_id, workspace_id
         FROM platform_recipe_assignment_grants
         WHERE recipe_id = ?`,
        [recipeId]
    );
}

async function ensurePlatformAssignment({ recipeId, workspaceId, actorUserId }) {
    const existing = await get(
        `SELECT id FROM recipe_workspace_assignments
         WHERE recipe_id = ? AND workspace_id = ? LIMIT 1`,
        [recipeId, workspaceId]
    );

    if (existing) return { created: false };

    await run(
        `INSERT INTO recipe_workspace_assignments (
            recipe_id, workspace_id, assigned_by_user_id, created_at
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [recipeId, workspaceId, actorUserId || null]
    );
    await run(
        `INSERT OR IGNORE INTO platform_recipe_assignment_grants (recipe_id, workspace_id)
         VALUES (?, ?)`,
        [recipeId, workspaceId]
    );
    return { created: true };
}

async function removePlatformAssignment(recipeId, workspaceId) {
    const grant = await get(
        `SELECT 1 AS granted
         FROM platform_recipe_assignment_grants
         WHERE recipe_id = ? AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
    if (!grant) return { removed: false };

    await run(
        `DELETE FROM recipe_workspace_favorites
         WHERE recipe_id = ? AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
    await run(
        `DELETE FROM recipe_workspace_assignments
         WHERE recipe_id = ? AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
    await run(
        `DELETE FROM platform_recipe_assignment_grants
         WHERE recipe_id = ? AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
    return { removed: true };
}

async function syncGlobalReleasesToWorkspace(workspaceId) {
    const globals = await all(
        `SELECT recipe_id FROM platform_recipe_releases WHERE mode = 'global'`
    );
    for (const item of globals) {
        await ensurePlatformAssignment({
            recipeId: item.recipe_id,
            workspaceId,
            actorUserId: null
        });
    }
}

module.exports = {
    listRecipesWithReleaseState,
    findRecipe,
    listSelectedReleaseWorkspaces,
    listActiveWorkspaces,
    findActiveWorkspacesByPublicIds,
    upsertRelease,
    deleteRelease,
    clearSelectedReleaseWorkspaces,
    addSelectedReleaseWorkspace,
    listPlatformGrants,
    ensurePlatformAssignment,
    removePlatformAssignment,
    syncGlobalReleasesToWorkspace
};
