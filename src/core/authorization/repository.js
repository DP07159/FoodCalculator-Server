const { run, get, all } = require("../../database/database");

async function findActiveMembership(userId, workspacePublicId) {
    return get(
        `SELECT
            wm.*,
            w.public_id AS workspace_public_id,
            w.status AS workspace_status
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ?
           AND w.public_id = ?
           AND wm.status = 'active'
           AND w.status = 'active'
           AND w.archived_at IS NULL
         LIMIT 1`,
        [userId, workspacePublicId]
    );
}

async function findRoleByCode(code) {
    return get(`SELECT * FROM roles WHERE code = ?`, [code]);
}

async function findCapabilityByCode(code) {
    return get(`SELECT * FROM capabilities WHERE code = ?`, [code]);
}

async function assignRole({
    membershipId,
    roleId,
    assignedByUserId
}) {
    await run(
        `INSERT INTO membership_roles (
            membership_id,
            role_id,
            assigned_by_user_id,
            valid_from
         )
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(membership_id, role_id) DO NOTHING`,
        [membershipId, roleId, assignedByUserId]
    );
}

async function listDefaultCapabilitiesForRole(roleId) {
    return all(
        `SELECT c.*
         FROM role_default_capabilities rdc
         INNER JOIN capabilities c ON c.id = rdc.capability_id
         WHERE rdc.role_id = ?
         ORDER BY c.code ASC`,
        [roleId]
    );
}

async function assignCapability({
    membershipId,
    capabilityId,
    assignedByUserId,
    source
}) {
    const existing = await get(
        `SELECT id
         FROM membership_capabilities
         WHERE membership_id = ?
           AND capability_id = ?
           AND revoked_at IS NULL
         LIMIT 1`,
        [membershipId, capabilityId]
    );

    if (existing) return existing;

    const result = await run(
        `INSERT INTO membership_capabilities (
            membership_id,
            capability_id,
            assigned_by_user_id,
            source,
            valid_from
         )
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [membershipId, capabilityId, assignedByUserId, source]
    );

    return { id: result.lastID };
}

async function listEffectiveRoles(membershipId) {
    return all(
        `SELECT r.code, r.name, r.scope
         FROM membership_roles mr
         INNER JOIN roles r ON r.id = mr.role_id
         WHERE mr.membership_id = ?
           AND (mr.valid_from IS NULL OR mr.valid_from <= CURRENT_TIMESTAMP)
           AND (mr.valid_until IS NULL OR mr.valid_until > CURRENT_TIMESTAMP)
         ORDER BY r.code ASC`,
        [membershipId]
    );
}

async function listEffectiveCapabilities(membershipId) {
    return all(
        `SELECT DISTINCT
            c.id,
            c.code,
            c.name,
            c.module_code,
            c.description
         FROM membership_capabilities mc
         INNER JOIN capabilities c ON c.id = mc.capability_id
         WHERE mc.membership_id = ?
           AND mc.revoked_at IS NULL
           AND (mc.valid_from IS NULL OR mc.valid_from <= CURRENT_TIMESTAMP)
           AND (mc.valid_until IS NULL OR mc.valid_until > CURRENT_TIMESTAMP)
         ORDER BY c.code ASC`,
        [membershipId]
    );
}

async function listEffectivePrivileges(membershipId) {
    return all(
        `SELECT DISTINCT
            p.code,
            p.module_code,
            p.resource,
            p.action,
            p.description
         FROM membership_capabilities mc
         INNER JOIN capability_privileges cp ON cp.capability_id = mc.capability_id
         INNER JOIN privileges p ON p.id = cp.privilege_id
         WHERE mc.membership_id = ?
           AND mc.revoked_at IS NULL
           AND (mc.valid_from IS NULL OR mc.valid_from <= CURRENT_TIMESTAMP)
           AND (mc.valid_until IS NULL OR mc.valid_until > CURRENT_TIMESTAMP)
         ORDER BY p.code ASC`,
        [membershipId]
    );
}

async function listOwnerMemberships() {
    return all(
        `SELECT
            wm.id AS membership_id,
            wm.user_id,
            wm.workspace_id,
            u.public_id AS user_public_id,
            u.email,
            u.display_name,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name
         FROM workspace_memberships wm
         INNER JOIN users u ON u.id = wm.user_id
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.status = 'active'
           AND wm.is_owner = 1
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND w.status = 'active'
           AND w.archived_at IS NULL
         ORDER BY wm.id ASC`
    );
}


async function findManagedMembershipByUserEmail(email, workspacePublicId = "") {
    const requestedWorkspace = String(workspacePublicId || "").trim();

    if (requestedWorkspace) {
        return get(
            `SELECT
                wm.*,
                u.email,
                u.display_name,
                u.public_id AS user_public_id,
                w.public_id AS workspace_public_id,
                w.name AS workspace_name,
                w.workspace_type
             FROM workspace_memberships wm
             INNER JOIN users u ON u.id = wm.user_id
             INNER JOIN workspaces w ON w.id = wm.workspace_id
             WHERE lower(u.email) = lower(?)
               AND w.public_id = ?
               AND u.deleted_at IS NULL
             LIMIT 1`,
            [email, requestedWorkspace]
        );
    }

    return get(
        `SELECT
            wm.*,
            u.email,
            u.display_name,
            u.public_id AS user_public_id,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name,
            w.workspace_type
         FROM workspace_memberships wm
         INNER JOIN users u ON u.id = wm.user_id
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE lower(u.email) = lower(?)
           AND w.workspace_type = 'personal'
           AND w.owner_user_id = u.id
           AND w.archived_at IS NULL
           AND u.deleted_at IS NULL
         ORDER BY wm.id ASC
         LIMIT 1`,
        [email]
    );
}

async function listAuthorizationCatalog() {
    const [roles, capabilities] = await Promise.all([
        all(
            `SELECT code, name, scope
             FROM roles
             ORDER BY scope ASC, code ASC`
        ),
        all(
            `SELECT code, name, module_code, description
             FROM capabilities
             ORDER BY module_code ASC, code ASC`
        )
    ]);

    return { roles, capabilities };
}

async function endActiveWorkspaceRoles(membershipId) {
    return run(
        `UPDATE membership_roles
         SET valid_until = CURRENT_TIMESTAMP
         WHERE membership_id = ?
           AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
           AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`,
        [membershipId]
    );
}

async function activateRole({
    membershipId,
    roleId,
    assignedByUserId
}) {
    const existing = await get(
        `SELECT id
         FROM membership_roles
         WHERE membership_id = ?
           AND role_id = ?
         LIMIT 1`,
        [membershipId, roleId]
    );

    if (existing) {
        await run(
            `UPDATE membership_roles
             SET assigned_by_user_id = ?,
                 valid_from = CURRENT_TIMESTAMP,
                 valid_until = NULL
             WHERE id = ?`,
            [assignedByUserId, existing.id]
        );
        return existing;
    }

    const result = await run(
        `INSERT INTO membership_roles (
            membership_id,
            role_id,
            assigned_by_user_id,
            valid_from,
            valid_until
         )
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
        [membershipId, roleId, assignedByUserId]
    );

    return { id: result.lastID };
}

async function revokeRoleDefaultCapabilities(membershipId) {
    return run(
        `UPDATE membership_capabilities
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE membership_id = ?
           AND source = 'role_default'
           AND revoked_at IS NULL`,
        [membershipId]
    );
}

async function revokeCapability({
    membershipId,
    capabilityId
}) {
    return run(
        `UPDATE membership_capabilities
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE membership_id = ?
           AND capability_id = ?
           AND revoked_at IS NULL`,
        [membershipId, capabilityId]
    );
}

async function findActiveUserByEmail(email) {
    return get(
        `SELECT *
         FROM users
         WHERE lower(email) = lower(?)
           AND status = 'active'
           AND deleted_at IS NULL
         LIMIT 1`,
        [email]
    );
}

module.exports = {
    findActiveMembership,
    findRoleByCode,
    findCapabilityByCode,
    assignRole,
    listDefaultCapabilitiesForRole,
    assignCapability,
    listEffectiveRoles,
    listEffectiveCapabilities,
    listEffectivePrivileges,
    listOwnerMemberships,
    findManagedMembershipByUserEmail,
    listAuthorizationCatalog,
    endActiveWorkspaceRoles,
    activateRole,
    revokeRoleDefaultCapabilities,
    revokeCapability,
    findActiveUserByEmail
};
