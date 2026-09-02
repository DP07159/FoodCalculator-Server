const crypto = require("crypto");
const database = require("../../database/database");
const identityRepository = require("../identity/repository");
const identityService = require("../identity/service");
const authorizationService = require("../authorization/service");
const authorizationRepository = require("../authorization/repository");
const accessManagementService = require("../authorization/accessManagementService");
const moduleAccessRepository = require("./moduleAccessRepository");
const repository = require("./repository");
const {
    validateUserStatus,
    validateBoolean,
    normalizeCode
} = require("./validator");
const { normalizeEmail, validateEmail } = require("../identity/validator");


function generateSetupPassword() {
    return `${crypto.randomBytes(9).toString("base64url")}A7!`;
}

function normalizeWorkspaceAssignments(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
        const workspacePublicId = String(item?.workspace_public_id || "").trim();
        const roleCode = normalizeCode(item?.role_code || "standard_user");
        if (!workspacePublicId || seen.has(workspacePublicId)) continue;
        seen.add(workspacePublicId);
        result.push({ workspacePublicId, roleCode });
    }
    return result;
}

async function createManagedUser(payload = {}, actorUser) {
    const email = normalizeEmail(payload.email);
    const displayName = String(payload.display_name || "").replace(/\s+/g, " ").trim();
    const platformRole = normalizeCode(payload.platform_role || "user");
    const assignments = normalizeWorkspaceAssignments(payload.workspace_assignments);

    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
    if (!displayName) return { error: "Name ist erforderlich." };
    if (displayName.length > 120) return { error: "Name ist zu lang." };
    if (!["user", "platform_admin"].includes(platformRole)) {
        return { error: "Plattformrolle ist ungültig." };
    }
    if (await identityRepository.findUserByEmail(email)) {
        return { error: "Für diese E-Mail-Adresse existiert bereits ein Benutzer." };
    }

    for (const assignment of assignments) {
        const workspace = await repository.findWorkspaceByPublicId(assignment.workspacePublicId);
        if (!workspace) return { error: `Workspace ${assignment.workspacePublicId} wurde nicht gefunden.` };
        const role = (await repository.listCatalog()).roles.find(item => item.code === assignment.roleCode);
        if (!role) return { error: `Workspace-Rolle ${assignment.roleCode} wurde nicht gefunden.` };
    }

    const setupPassword = generateSetupPassword();
    const passwordHash = await identityService.hashPassword(setupPassword);

    await database.run("BEGIN");
    try {
        const user = await identityRepository.createUser({
            publicId: crypto.randomUUID(),
            email,
            displayName,
            status: "active",
            locale: "de-DE"
        });
        await identityRepository.createPasswordCredential(user.id, passwordHash);

        if (platformRole === "platform_admin") {
            const role = await repository.findPlatformAdminRole();
            await repository.grantPlatformAdmin({
                userId: user.id,
                roleId: role.id,
                assignedByUserId: actorUser.id
            });
        }

        for (const assignment of assignments) {
            const workspace = await repository.findWorkspaceByPublicId(assignment.workspacePublicId);
            const membership = await repository.upsertWorkspaceMembership({
                workspaceId: workspace.id,
                userId: user.id
            });
            await authorizationService.assignRoleWithDefaults({
                membershipId: membership.id,
                roleCode: assignment.roleCode,
                assignedByUserId: actorUser.id
            });
        }

        await database.run("COMMIT");
        return {
            value: {
                user: {
                    public_id: user.public_id,
                    email: user.email,
                    display_name: user.display_name,
                    status: user.status,
                    is_platform_admin: platformRole === "platform_admin"
                },
                setup_password: setupPassword,
                workspace_assignments: assignments.length
            }
        };
    } catch (error) {
        await database.run("ROLLBACK").catch(() => {});
        throw error;
    }
}

async function listWorkspaces() {
    const rows = await repository.listAssignableWorkspaces();
    return rows.map(row => ({
        public_id: row.public_id,
        name: row.name,
        workspace_type: row.workspace_type,
        status: row.status,
        owner: row.owner_user_id ? {
            display_name: row.owner_display_name,
            email: row.owner_email
        } : null
    }));
}

async function addUserMembership({ publicId, workspacePublicId, roleCode, actorUser }) {
    const user = await repository.findUserByPublicId(publicId);
    if (!user) return { notFound: true };

    const workspace = await repository.findWorkspaceByPublicId(workspacePublicId);
    if (!workspace) return { error: "Workspace wurde nicht gefunden." };

    const code = normalizeCode(roleCode || "standard_user");
    const catalog = await repository.listCatalog();
    if (!catalog.roles.some(role => role.code === code)) {
        return { error: "Workspace-Rolle wurde nicht gefunden." };
    }

    const membership = await repository.upsertWorkspaceMembership({
        workspaceId: workspace.id,
        userId: user.id
    });

    const roleResult = await accessManagementService.setManagedRole({
        email: user.email,
        workspacePublicId: workspace.public_id,
        roleCode: code,
        actorEmail: actorUser.email
    });
    if (roleResult?.error) return { error: roleResult.error };

    return { value: await getUserDetail(publicId) };
}

async function removeUserMembership({ publicId, membershipId }) {
    const user = await repository.findUserByPublicId(publicId);
    if (!user) return { notFound: true };

    const membership = await repository.findMembershipForAdministration(membershipId);
    if (!membership || membership.user_id !== user.id) return { notFound: true };
    if (Number(membership.is_owner) === 1) {
        return { error: "Owner-Mitgliedschaften können nicht entfernt werden." };
    }

    await repository.endWorkspaceMembership(membership.id);
    return { value: await getUserDetail(publicId) };
}


function mapUserRow(row) {
    return {
        public_id: row.public_id,
        email: row.email,
        display_name: row.display_name,
        status: row.status,
        locale: row.locale,
        is_platform_admin: Number(row.is_platform_admin) === 1,
        active_memberships: Number(row.active_memberships) || 0,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

async function bootstrapFirstPlatformAdmin(email) {
    const existingCount = await repository.countActivePlatformAdmins();
    if (existingCount > 0) {
        return {
            error: "Bootstrap ist gesperrt: Es existiert bereits mindestens ein aktiver Platform Admin."
        };
    }

    const user = await identityRepository.findUserByEmail(email);
    if (!user || user.status !== "active" || user.deleted_at) {
        return {
            error: "Aktiver Benutzer wurde nicht gefunden."
        };
    }

    const role = await repository.findPlatformAdminRole();
    if (!role) {
        throw new Error("Systemrolle platform_admin fehlt.");
    }

    await repository.grantPlatformAdmin({
        userId: user.id,
        roleId: role.id,
        assignedByUserId: user.id
    });

    return {
        user: {
            public_id: user.public_id,
            email: user.email,
            display_name: user.display_name
        },
        role: "platform_admin"
    };
}

async function listUsers(query = {}) {
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();
    const limit = Math.min(
        Math.max(Number(query.limit) || 100, 1),
        250
    );

    const rows = await repository.listUsers({
        search,
        status,
        limit
    });

    return rows.map(mapUserRow);
}

async function getUserDetail(publicId) {
    const user = await repository.findUserByPublicId(publicId);
    if (!user) return null;

    const memberships = await repository.listUserMemberships(user.id);

    const detailedMemberships = [];

    for (const membership of memberships) {
        const [roles, capabilities, modules] = await Promise.all([
            repository.listMembershipRoles(membership.membership_id),
            repository.listMembershipCapabilities(membership.membership_id),
            repository.listModulesForMembership(membership.membership_id)
        ]);

        detailedMemberships.push({
            id: membership.membership_id,
            status: membership.membership_status,
            is_owner: Number(membership.is_owner) === 1,
            joined_at: membership.joined_at,
            workspace: {
                public_id: membership.workspace_public_id,
                name: membership.workspace_name,
                workspace_type: membership.workspace_type,
                status: membership.workspace_status
            },
            roles,
            capabilities,
            modules: modules.map(moduleRow => ({
                code: moduleRow.code,
                name: moduleRow.name,
                description: moduleRow.description,
                effective_enabled:
                    Number(moduleRow.effective_enabled) === 1,
                override_enabled:
                    moduleRow.override_enabled === null ||
                    moduleRow.override_enabled === undefined
                        ? null
                        : Number(moduleRow.override_enabled) === 1,
                default_enabled:
                    Number(moduleRow.default_enabled) === 1,
                status: moduleRow.status
            }))
        });
    }

    const isPlatformAdmin = await repository.isPlatformAdmin(user.id);

    return {
        user: {
            public_id: user.public_id,
            email: user.email,
            display_name: user.display_name,
            status: user.status,
            locale: user.locale,
            is_platform_admin: isPlatformAdmin,
            created_at: user.created_at,
            updated_at: user.updated_at
        },
        memberships: detailedMemberships
    };
}

async function setUserStatus(publicId, statusValue) {
    const validation = validateUserStatus(statusValue);
    if (validation.error) return validation;

    const user = await repository.findUserByPublicId(publicId);
    if (!user) return { notFound: true };

    await identityRepository.updateUserStatus(
        user.id,
        validation.value
    );

    let sessionsRevoked = false;

    if (validation.value !== "active") {
        await identityRepository.revokeAllSessions(user.id);
        sessionsRevoked = true;
    }

    return {
        value: {
            public_id: user.public_id,
            status: validation.value,
            sessions_revoked: sessionsRevoked
        }
    };
}

async function revokeUserSessions(publicId) {
    const user = await repository.findUserByPublicId(publicId);
    if (!user) return { notFound: true };

    const result = await identityRepository.revokeAllSessions(user.id);

    return {
        value: {
            public_id: user.public_id,
            sessions_revoked: Number(result?.changes) || 0
        }
    };
}

async function getCatalog() {
    return repository.listCatalog();
}

async function setMembershipRole({
    membershipId,
    roleCode,
    actorUser
}) {
    const membership = await repository.findMembershipForAdministration(
        membershipId
    );

    if (!membership) return { notFound: true };

    const code = normalizeCode(roleCode);
    if (!code) return { error: "Rollen-Code ist erforderlich." };

    const result = await accessManagementService.setManagedRole({
        email: membership.email,
        workspacePublicId: membership.workspace_public_id,
        roleCode: code,
        actorEmail: actorUser.email
    });

    if (result.error) return { error: result.error };

    return { value: result };
}

async function setMembershipCapability({
    membershipId,
    capabilityCode,
    enabled,
    actorUser
}) {
    const membership = await repository.findMembershipForAdministration(
        membershipId
    );

    if (!membership) return { notFound: true };

    const boolValidation = validateBoolean(enabled);
    if (boolValidation.error) return boolValidation;

    const code = normalizeCode(capabilityCode);
    if (!code) return { error: "Capability-Code ist erforderlich." };

    const payload = {
        email: membership.email,
        workspacePublicId: membership.workspace_public_id,
        capabilityCode: code,
        actorEmail: actorUser.email
    };

    const result = enabled
        ? await accessManagementService.grantManagedCapability(payload)
        : await accessManagementService.revokeManagedCapability(payload);

    if (result.error) return { error: result.error };

    return { value: result };
}

async function setMembershipModule({
    membershipId,
    moduleCode,
    enabled,
    actorUser
}) {
    const membership = await repository.findMembershipForAdministration(
        membershipId
    );

    if (!membership) return { notFound: true };

    const boolValidation = validateBoolean(enabled);
    if (boolValidation.error) return boolValidation;

    const moduleRow = await moduleAccessRepository.findModuleByCode(
        normalizeCode(moduleCode)
    );

    if (!moduleRow) {
        return { error: "Modul wurde nicht gefunden." };
    }

    await moduleAccessRepository.setModuleAccess({
        membershipId: membership.id,
        moduleId: moduleRow.id,
        enabled,
        assignedByUserId: actorUser.id
    });

    const modules = await repository.listModulesForMembership(
        membership.id
    );

    const updated = modules.find(row => row.code === moduleRow.code);

    return {
        value: {
            membership_id: membership.id,
            workspace: {
                public_id: membership.workspace_public_id,
                name: membership.workspace_name
            },
            module: {
                code: updated.code,
                name: updated.name,
                enabled: Number(updated.effective_enabled) === 1,
                override_enabled:
                    updated.override_enabled === null ||
                    updated.override_enabled === undefined
                        ? null
                        : Number(updated.override_enabled) === 1
            }
        }
    };
}

module.exports = {
    bootstrapFirstPlatformAdmin,
    listUsers,
    getUserDetail,
    setUserStatus,
    revokeUserSessions,
    getCatalog,
    setMembershipRole,
    setMembershipCapability,
    setMembershipModule,
    createManagedUser,
    listWorkspaces,
    addUserMembership,
    removeUserMembership
};
