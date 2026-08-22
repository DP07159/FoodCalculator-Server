const crypto = require("crypto");
const database = require("../../database/database");
const repository = require("./repository");
const identityService = require("./service");
const workspaceService = require("../workspaces/service");
const authorizationService = require("../authorization/service");
const { mapUser } = require("./mapper");
const {
    validateProvisionUserPayload,
    validateUserStatusPayload
} = require("./provisioningValidator");

async function provisionTestUser(payload = {}) {
    const validation = validateProvisionUserPayload(payload);
    if (validation.error) return { error: validation.error };

    const existing = await repository.findUserByEmail(validation.value.email);
    if (existing) {
        return { error: "Für diese E-Mail-Adresse existiert bereits ein Benutzer." };
    }

    const { email, displayName, password, locale, workspaceName } = validation.value;
    const passwordHash = await identityService.hashPassword(password);

    await database.run("BEGIN");

    try {
        const user = await repository.createUser({
            publicId: crypto.randomUUID(),
            email,
            displayName,
            status: "active",
            locale
        });

        await repository.createPasswordCredential(user.id, passwordHash);

        const workspaceResult = await workspaceService.ensurePersonalWorkspaceForUser(
            user,
            { name: workspaceName }
        );

        const authorization = await authorizationService.assignRoleWithDefaults({
            membershipId: workspaceResult.membership.id,
            roleCode: "tenant_admin",
            assignedByUserId: user.id
        });

        await database.run("COMMIT");

        return {
            user: mapUser(user),
            workspace: workspaceResult.workspace,
            membership: {
                status: workspaceResult.membership.status,
                is_owner: workspaceResult.membership.is_owner
            },
            role: authorization.role,
            capabilities: authorization.capabilities
        };
    } catch (error) {
        await database.run("ROLLBACK").catch(() => {});
        throw error;
    }
}

async function listManagedUsers() {
    const rows = await repository.listUsersForAdministration();

    return rows.map(row => ({
        public_id: row.public_id,
        email: row.email,
        display_name: row.display_name,
        status: row.status,
        locale: row.locale,
        personal_workspace: row.workspace_public_id ? {
            public_id: row.workspace_public_id,
            name: row.workspace_name,
            membership_status: row.membership_status,
            is_owner: Number(row.is_owner) === 1
        } : null,
        roles: String(row.role_codes || "")
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
            .sort(),
        created_at: row.created_at,
        updated_at: row.updated_at
    }));
}

async function setManagedUserStatus(payload = {}) {
    const validation = validateUserStatusPayload(payload);
    if (validation.error) return { error: validation.error };

    const user = await repository.findUserByEmail(validation.value.email);
    if (!user || user.deleted_at) {
        return { error: "Benutzer wurde nicht gefunden." };
    }

    await repository.updateUserStatus(user.id, validation.value.status);

    let sessionsRevoked = false;
    if (validation.value.status === "suspended") {
        await repository.revokeAllSessions(user.id);
        sessionsRevoked = true;
    }

    const updated = await repository.findUserById(user.id);

    return {
        user: mapUser(updated),
        sessions_revoked: sessionsRevoked
    };
}

module.exports = {
    provisionTestUser,
    listManagedUsers,
    setManagedUserStatus
};
