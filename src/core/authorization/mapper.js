function mapEffectiveAuthorization({
    membership,
    roles,
    capabilities,
    privileges,
    modules = []
}) {
    return {
        membership: {
            status: membership.status,
            is_owner: Number(membership.is_owner) === 1
        },
        roles: roles.map(role => ({
            code: role.code,
            name: role.name,
            scope: role.scope
        })),
        capabilities: capabilities.map(capability => ({
            code: capability.code,
            name: capability.name,
            module_code: capability.module_code,
            description: capability.description || ""
        })),
        modules: modules.map(moduleRow => ({
            code: moduleRow.code,
            name: moduleRow.name,
            description: moduleRow.description || "",
            enabled: moduleRow.enabled === true,
            source: moduleRow.source || ""
        })),
        privileges: privileges.map(privilege => ({
            code: privilege.code,
            module_code: privilege.module_code,
            resource: privilege.resource,
            action: privilege.action,
            description: privilege.description || ""
        }))
    };
}

module.exports = { mapEffectiveAuthorization };
