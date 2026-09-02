const { run, get, all } = require("../../database/database");

async function countActivePlatformAdmins() {
    const row = await get(
        `SELECT COUNT(DISTINCT upr.user_id) AS count
         FROM user_platform_roles upr
         INNER JOIN roles r ON r.id = upr.role_id
         INNER JOIN users u ON u.id = upr.user_id
         WHERE r.code = 'platform_admin'
           AND r.scope = 'platform'
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND datetime(upr.valid_from) <= datetime('now')
           AND (upr.valid_until IS NULL OR datetime(upr.valid_until) > datetime('now'))`
    );
    return Number(row?.count) || 0;
}

function findPlatformAdminRole() {
    return get(
        `SELECT *
         FROM roles
         WHERE code = 'platform_admin'
           AND scope = 'platform'
         LIMIT 1`
    );
}

async function grantPlatformAdmin({ userId, roleId, assignedByUserId }) {
    const existing = await get(
        `SELECT id
         FROM user_platform_roles
         WHERE user_id = ? AND role_id = ?
         LIMIT 1`,
        [userId, roleId]
    );

    if (existing) {
        await run(
            `UPDATE user_platform_roles
             SET assigned_by_user_id = ?,
                 valid_from = CURRENT_TIMESTAMP,
                 valid_until = NULL
             WHERE id = ?`,
            [assignedByUserId, existing.id]
        );
        return existing;
    }

    const result = await run(
        `INSERT INTO user_platform_roles (
            user_id, role_id, assigned_by_user_id, valid_from
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, roleId, assignedByUserId]
    );

    return { id: result.lastID };
}

async function isPlatformAdmin(userId) {
    const row = await get(
        `SELECT 1 AS allowed
         FROM user_platform_roles upr
         INNER JOIN roles r ON r.id = upr.role_id
         INNER JOIN users u ON u.id = upr.user_id
         WHERE upr.user_id = ?
           AND r.code = 'platform_admin'
           AND r.scope = 'platform'
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND datetime(upr.valid_from) <= datetime('now')
           AND (upr.valid_until IS NULL OR datetime(upr.valid_until) > datetime('now'))
         LIMIT 1`,
        [userId]
    );
    return Boolean(row);
}

async function listUsers({ search = "", status = "", limit = 100 } = {}) {
    const params = [];
    const clauses = ["u.deleted_at IS NULL"];

    if (search) {
        clauses.push("(lower(u.email) LIKE lower(?) OR lower(u.display_name) LIKE lower(?))");
        const pattern = `%${search}%`;
        params.push(pattern, pattern);
    }

    if (status) {
        clauses.push("u.status = ?");
        params.push(status);
    }

    params.push(limit);

    return all(
        `SELECT
            u.id,
            u.public_id,
            u.email,
            u.display_name,
            u.status,
            u.locale,
            u.created_at,
            u.updated_at,
            EXISTS (
                SELECT 1
                FROM user_platform_roles upr
                INNER JOIN roles r ON r.id = upr.role_id
                WHERE upr.user_id = u.id
                  AND r.code = 'platform_admin'
                  AND r.scope = 'platform'
                  AND datetime(upr.valid_from) <= datetime('now')
                  AND (upr.valid_until IS NULL OR datetime(upr.valid_until) > datetime('now'))
            ) AS is_platform_admin,
            (
                SELECT COUNT(*)
                FROM workspace_memberships wm
                WHERE wm.user_id = u.id
                  AND wm.status = 'active'
            ) AS active_memberships
         FROM users u
         WHERE ${clauses.join(" AND ")}
         ORDER BY u.display_name COLLATE NOCASE ASC, u.id ASC
         LIMIT ?`,
        params
    );
}

function findUserByPublicId(publicId) {
    return get(
        `SELECT *
         FROM users
         WHERE public_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [publicId]
    );
}

async function listUserMemberships(userId) {
    return all(
        `SELECT
            wm.id AS membership_id,
            wm.status AS membership_status,
            wm.is_owner,
            wm.joined_at,
            w.id AS workspace_id,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name,
            w.workspace_type,
            w.status AS workspace_status
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ?
           AND w.archived_at IS NULL
         ORDER BY
            CASE WHEN w.workspace_type = 'personal' THEN 0 ELSE 1 END,
            w.name COLLATE NOCASE ASC`,
        [userId]
    );
}

async function listMembershipRoles(membershipId) {
    return all(
        `SELECT r.code, r.name, r.scope
         FROM membership_roles mr
         INNER JOIN roles r ON r.id = mr.role_id
         WHERE mr.membership_id = ?
           AND (mr.valid_from IS NULL OR datetime(mr.valid_from) <= datetime('now'))
           AND (mr.valid_until IS NULL OR datetime(mr.valid_until) > datetime('now'))
         ORDER BY r.code ASC`,
        [membershipId]
    );
}

async function listMembershipCapabilities(membershipId) {
    return all(
        `SELECT DISTINCT c.code, c.name, c.module_code, c.description
         FROM membership_capabilities mc
         INNER JOIN capabilities c ON c.id = mc.capability_id
         WHERE mc.membership_id = ?
           AND mc.revoked_at IS NULL
           AND (mc.valid_from IS NULL OR datetime(mc.valid_from) <= datetime('now'))
           AND (mc.valid_until IS NULL OR datetime(mc.valid_until) > datetime('now'))
         ORDER BY c.module_code ASC, c.code ASC`,
        [membershipId]
    );
}

async function listModulesForMembership(membershipId) {
    return all(
        `SELECT
            pm.code,
            pm.name,
            pm.description,
            pm.status,
            pm.default_enabled,
            mma.enabled AS override_enabled,
            CASE
                WHEN pm.status <> 'active' THEN 0
                WHEN mma.enabled IS NOT NULL THEN mma.enabled
                ELSE pm.default_enabled
            END AS effective_enabled
         FROM platform_modules pm
         LEFT JOIN membership_module_access mma
                ON mma.module_id = pm.id
               AND mma.membership_id = ?
         ORDER BY pm.name COLLATE NOCASE ASC`,
        [membershipId]
    );
}

function findMembershipForAdministration(membershipId) {
    return get(
        `SELECT
            wm.*,
            u.public_id AS user_public_id,
            u.email,
            u.display_name,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name,
            w.workspace_type
         FROM workspace_memberships wm
         INNER JOIN users u ON u.id = wm.user_id
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.id = ?
           AND u.deleted_at IS NULL
           AND w.archived_at IS NULL
         LIMIT 1`,
        [membershipId]
    );
}


function listAssignableWorkspaces() {
    return all(
        `SELECT
            w.id,
            w.public_id,
            w.name,
            w.workspace_type,
            w.status,
            w.owner_user_id,
            u.display_name AS owner_display_name,
            u.email AS owner_email
         FROM workspaces w
         LEFT JOIN users u ON u.id = w.owner_user_id
         WHERE w.archived_at IS NULL
           AND w.status = 'active'
         ORDER BY w.name COLLATE NOCASE ASC, w.id ASC`
    );
}

function findWorkspaceByPublicId(publicId) {
    return get(
        `SELECT *
         FROM workspaces
         WHERE public_id = ?
           AND archived_at IS NULL
           AND status = 'active'
         LIMIT 1`,
        [publicId]
    );
}

async function upsertWorkspaceMembership({ workspaceId, userId }) {
    await run(
        `INSERT INTO workspace_memberships (
            workspace_id, user_id, status, is_owner, joined_at, updated_at
         ) VALUES (?, ?, 'active', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(workspace_id, user_id)
         DO UPDATE SET
            status = 'active',
            joined_at = COALESCE(workspace_memberships.joined_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP`,
        [workspaceId, userId]
    );

    return get(
        `SELECT *
         FROM workspace_memberships
         WHERE workspace_id = ? AND user_id = ?
         LIMIT 1`,
        [workspaceId, userId]
    );
}

async function endWorkspaceMembership(membershipId) {
    return run(
        `UPDATE workspace_memberships
         SET status = 'left',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND is_owner = 0`,
        [membershipId]
    );
}

async function listCatalog() {
    const [roles, capabilities, modules] = await Promise.all([
        all(
            `SELECT code, name, scope
             FROM roles
             WHERE scope = 'workspace'
             ORDER BY code ASC`
        ),
        all(
            `SELECT code, name, module_code, description
             FROM capabilities
             ORDER BY module_code ASC, code ASC`
        ),
        all(
            `SELECT code, name, description, default_enabled, status
             FROM platform_modules
             ORDER BY name COLLATE NOCASE ASC`
        )
    ]);

    return { roles, capabilities, modules };
}

module.exports = {
    countActivePlatformAdmins,
    findPlatformAdminRole,
    grantPlatformAdmin,
    isPlatformAdmin,
    listUsers,
    findUserByPublicId,
    listUserMemberships,
    listMembershipRoles,
    listMembershipCapabilities,
    listModulesForMembership,
    findMembershipForAdministration,
    listCatalog,
    listAssignableWorkspaces,
    findWorkspaceByPublicId,
    upsertWorkspaceMembership,
    endWorkspaceMembership
};
