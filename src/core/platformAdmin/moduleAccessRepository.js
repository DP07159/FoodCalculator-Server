const { run, get } = require("../../database/database");

function findModuleByCode(moduleCode) {
    return get(
        `SELECT *
         FROM platform_modules
         WHERE code = ?
         LIMIT 1`,
        [moduleCode]
    );
}

function findActiveMembershipByWorkspacePublicId(userId, workspacePublicId) {
    return get(
        `SELECT wm.*
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

function findModuleAccess(membershipId, moduleId) {
    return get(
        `SELECT *
         FROM membership_module_access
         WHERE membership_id = ?
           AND module_id = ?
         LIMIT 1`,
        [membershipId, moduleId]
    );
}

async function setModuleAccess({
    membershipId,
    moduleId,
    enabled,
    assignedByUserId
}) {
    const existing = await findModuleAccess(membershipId, moduleId);

    if (existing) {
        await run(
            `UPDATE membership_module_access
             SET enabled = ?,
                 assigned_by_user_id = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [enabled ? 1 : 0, assignedByUserId, existing.id]
        );
        return;
    }

    await run(
        `INSERT INTO membership_module_access (
            membership_id,
            module_id,
            enabled,
            assigned_by_user_id,
            updated_at
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [membershipId, moduleId, enabled ? 1 : 0, assignedByUserId]
    );
}

module.exports = {
    findModuleByCode,
    findActiveMembershipByWorkspacePublicId,
    findModuleAccess,
    setModuleAccess
};
