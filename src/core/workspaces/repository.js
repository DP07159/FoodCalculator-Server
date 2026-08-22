const { run, get, all } = require("../../database/database");

async function findPersonalWorkspaceByOwnerUserId(userId) {
    return get(
        `SELECT *
         FROM workspaces
         WHERE owner_user_id = ?
           AND workspace_type = 'personal'
           AND archived_at IS NULL
         LIMIT 1`,
        [userId]
    );
}

async function createWorkspace({
    publicId,
    name,
    workspaceType,
    ownerUserId = null
}) {
    const result = await run(
        `INSERT INTO workspaces (
            public_id,
            name,
            workspace_type,
            status,
            owner_user_id
         )
         VALUES (?, ?, ?, 'active', ?)`,
        [publicId, name, workspaceType, ownerUserId]
    );

    return get(`SELECT * FROM workspaces WHERE id = ?`, [result.lastID]);
}

async function createMembership({
    workspaceId,
    userId,
    status = "active",
    isOwner = false
}) {
    await run(
        `INSERT INTO workspace_memberships (
            workspace_id,
            user_id,
            status,
            is_owner,
            joined_at
         )
         VALUES (?, ?, ?, ?, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END)
         ON CONFLICT(workspace_id, user_id)
         DO UPDATE SET
            status = excluded.status,
            is_owner = excluded.is_owner,
            joined_at = COALESCE(workspace_memberships.joined_at, excluded.joined_at),
            updated_at = CURRENT_TIMESTAMP`,
        [workspaceId, userId, status, isOwner ? 1 : 0, status]
    );

    return get(
        `SELECT *
         FROM workspace_memberships
         WHERE workspace_id = ? AND user_id = ?`,
        [workspaceId, userId]
    );
}

async function listActiveWorkspacesForUser(userId) {
    return all(
        `SELECT
            w.*,
            wm.status AS membership_status,
            wm.is_owner
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ?
           AND wm.status = 'active'
           AND w.status = 'active'
           AND w.archived_at IS NULL
         ORDER BY
            CASE WHEN w.workspace_type = 'personal' THEN 0 ELSE 1 END,
            w.name COLLATE NOCASE ASC`,
        [userId]
    );
}

async function findActiveWorkspaceForUserByPublicId(userId, publicId) {
    return get(
        `SELECT
            w.*,
            wm.status AS membership_status,
            wm.is_owner
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ?
           AND w.public_id = ?
           AND wm.status = 'active'
           AND w.status = 'active'
           AND w.archived_at IS NULL
         LIMIT 1`,
        [userId, publicId]
    );
}

async function findActivePersonalWorkspaceForUser(userId) {
    return get(
        `SELECT
            w.*,
            wm.status AS membership_status,
            wm.is_owner
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ?
           AND wm.status = 'active'
           AND w.status = 'active'
           AND w.workspace_type = 'personal'
           AND w.archived_at IS NULL
         ORDER BY w.id ASC
         LIMIT 1`,
        [userId]
    );
}

async function listActiveUsers() {
    return all(
        `SELECT id, public_id, email, display_name, status, locale
         FROM users
         WHERE status = 'active'
           AND deleted_at IS NULL
         ORDER BY id ASC`
    );
}

module.exports = {
    findPersonalWorkspaceByOwnerUserId,
    createWorkspace,
    createMembership,
    listActiveWorkspacesForUser,
    findActiveWorkspaceForUserByPublicId,
    findActivePersonalWorkspaceForUser,
    listActiveUsers
};
