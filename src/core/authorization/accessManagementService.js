const database = require("../../database/database");
const repository = require("./repository");
const {
    validateTargetPayload,
    validateRoleChangePayload,
    validateCapabilityChangePayload
} = require("./accessManagementValidator");
const { getEffectiveAuthorization } = require("./service");

async function resolveMembership(email, workspacePublicId = "") {
    const membership = await repository.findManagedMembershipByUserEmail(
        email,
        workspacePublicId
    );

    if (!membership) {
        throw new Error("Workspace-Mitgliedschaft wurde nicht gefunden.");
    }

    return membership;
}

async function getManagedAccess(payload = {}) {
    const validation = validateTargetPayload(payload);
    if (validation.error) return { error: validation.error };

    const membership = await resolveMembership(
        validation.value.email,
        validation.value.workspacePublicId
    );

    const [effective, catalog] = await Promise.all([
        getEffectiveAuthorization(
            membership.user_id,
            membership.workspace_public_id
        ),
        repository.listAuthorizationCatalog()
    ]);

    return {
        user: {
            public_id: membership.user_public_id,
            email: membership.email,
            display_name: membership.display_name
        },
        workspace: {
            public_id: membership.workspace_public_id,
            name: membership.workspace_name,
            workspace_type: membership.workspace_type
        },
        membership: {
            id: membership.id,
            status: membership.status,
            is_owner: Number(membership.is_owner) === 1
        },
        effective,
        catalog
    };
}

async function setManagedRole(payload = {}) {
    const validation = validateRoleChangePayload(payload);
    if (validation.error) return { error: validation.error };

    const membership = await resolveMembership(
        validation.value.email,
        validation.value.workspacePublicId
    );

    const actor = await repository.findActiveUserByEmail(
        validation.value.actorEmail
    );
    if (!actor) {
        return { error: "Actor-Benutzer wurde nicht gefunden oder ist nicht aktiv." };
    }

    const role = await repository.findRoleByCode(validation.value.roleCode);
    if (!role) {
        return { error: "Rolle wurde nicht gefunden." };
    }

    if (role.scope !== "workspace") {
        return {
            error: "Platform-Rollen können nicht über die Workspace-Rollenverwaltung zugewiesen werden."
        };
    }

    // Persönliche Workspace-Owner behalten den organisatorischen Tenant-Admin-Kontext.
    // Einschränkungen für Testzwecke erfolgen über Capabilities, nicht durch Entzug der Owner-Rolle.
    if (
        membership.workspace_type === "personal" &&
        Number(membership.is_owner) === 1 &&
        role.code !== "tenant_admin"
    ) {
        return {
            error: "Der Owner eines persönlichen Workspace muss die Rolle tenant_admin behalten. Rechte bitte über Capabilities einschränken."
        };
    }

    await database.run("BEGIN");

    try {
        await repository.endActiveWorkspaceRoles(membership.id);
        await repository.revokeRoleDefaultCapabilities(membership.id);

        await repository.activateRole({
            membershipId: membership.id,
            roleId: role.id,
            assignedByUserId: actor.id
        });

        const defaults = await repository.listDefaultCapabilitiesForRole(role.id);

        for (const capability of defaults) {
            await repository.assignCapability({
                membershipId: membership.id,
                capabilityId: capability.id,
                assignedByUserId: actor.id,
                source: "role_default"
            });
        }

        await database.run("COMMIT");
    } catch (error) {
        await database.run("ROLLBACK").catch(() => {});
        throw error;
    }

    return getManagedAccess({
        email: validation.value.email,
        workspacePublicId: membership.workspace_public_id
    });
}

async function grantManagedCapability(payload = {}) {
    const validation = validateCapabilityChangePayload(payload);
    if (validation.error) return { error: validation.error };

    const membership = await resolveMembership(
        validation.value.email,
        validation.value.workspacePublicId
    );

    const actor = await repository.findActiveUserByEmail(
        validation.value.actorEmail
    );
    if (!actor) {
        return { error: "Actor-Benutzer wurde nicht gefunden oder ist nicht aktiv." };
    }

    const capability = await repository.findCapabilityByCode(
        validation.value.capabilityCode
    );
    if (!capability) {
        return { error: "Capability wurde nicht gefunden." };
    }

    await repository.assignCapability({
        membershipId: membership.id,
        capabilityId: capability.id,
        assignedByUserId: actor.id,
        source: "manual"
    });

    return getManagedAccess({
        email: validation.value.email,
        workspacePublicId: membership.workspace_public_id
    });
}

async function revokeManagedCapability(payload = {}) {
    const validation = validateCapabilityChangePayload(payload);
    if (validation.error) return { error: validation.error };

    const membership = await resolveMembership(
        validation.value.email,
        validation.value.workspacePublicId
    );

    const actor = await repository.findActiveUserByEmail(
        validation.value.actorEmail
    );
    if (!actor) {
        return { error: "Actor-Benutzer wurde nicht gefunden oder ist nicht aktiv." };
    }

    const capability = await repository.findCapabilityByCode(
        validation.value.capabilityCode
    );
    if (!capability) {
        return { error: "Capability wurde nicht gefunden." };
    }

    await repository.revokeCapability({
        membershipId: membership.id,
        capabilityId: capability.id
    });

    return getManagedAccess({
        email: validation.value.email,
        workspacePublicId: membership.workspace_public_id
    });
}

module.exports = {
    getManagedAccess,
    setManagedRole,
    grantManagedCapability,
    revokeManagedCapability
};
