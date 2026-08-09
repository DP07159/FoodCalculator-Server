const repository = require("./repository");
const { mapEffectiveAuthorization } = require("./mapper");

async function getEffectiveAuthorization(userId, workspacePublicId) {
    const membership = await repository.findActiveMembership(
        userId,
        workspacePublicId
    );

    if (!membership) return null;

    const [roles, capabilities, privileges] = await Promise.all([
        repository.listEffectiveRoles(membership.id),
        repository.listEffectiveCapabilities(membership.id),
        repository.listEffectivePrivileges(membership.id)
    ]);

    return mapEffectiveAuthorization({
        membership,
        roles,
        capabilities,
        privileges
    });
}

async function hasPrivilege(userId, workspacePublicId, privilegeCode) {
    const effective = await getEffectiveAuthorization(userId, workspacePublicId);
    if (!effective) return false;

    return effective.privileges.some(
        privilege => privilege.code === privilegeCode
    );
}

async function bootstrapOwnerAuthorization() {
    const ownerMemberships = await repository.listOwnerMemberships();
    const tenantAdminRole = await repository.findRoleByCode("tenant_admin");

    if (!tenantAdminRole) {
        throw new Error("Systemrolle tenant_admin fehlt.");
    }

    const defaultCapabilities =
        await repository.listDefaultCapabilitiesForRole(tenantAdminRole.id);

    const results = [];

    for (const membership of ownerMemberships) {
        await repository.assignRole({
            membershipId: membership.membership_id,
            roleId: tenantAdminRole.id,
            assignedByUserId: membership.user_id
        });

        for (const capability of defaultCapabilities) {
            await repository.assignCapability({
                membershipId: membership.membership_id,
                capabilityId: capability.id,
                assignedByUserId: membership.user_id,
                source: "role_default"
            });
        }

        results.push({
            user: {
                public_id: membership.user_public_id,
                email: membership.email,
                display_name: membership.display_name
            },
            workspace: {
                public_id: membership.workspace_public_id,
                name: membership.workspace_name
            },
            role: "tenant_admin",
            capabilities: defaultCapabilities.map(capability => capability.code)
        });
    }

    return results;
}

module.exports = {
    getEffectiveAuthorization,
    hasPrivilege,
    bootstrapOwnerAuthorization
};
