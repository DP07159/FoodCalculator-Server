const authorizationService = require("../authorization/service");
const { getModuleDefinitions } = require("./registry");

async function getPlatformContext(userId, workspacePublicId) {
    const effective = await authorizationService.getEffectiveAuthorization(userId, workspacePublicId);
    if (!effective) return null;

    const entitlementByCode = new Map((effective.modules || []).map(moduleRow => [moduleRow.code, moduleRow]));
    const privilegeCodes = new Set((effective.privileges || []).map(privilege => privilege.code));

    const modules = getModuleDefinitions().map(definition => {
        const entitlement = entitlementByCode.get(definition.code);
        const moduleEnabled = entitlement ? entitlement.enabled === true : false;
        const privilegeGranted = !definition.required_privilege || privilegeCodes.has(definition.required_privilege);

        return {
            ...definition,
            enabled: moduleEnabled && privilegeGranted,
            module_enabled: moduleEnabled,
            privilege_granted: privilegeGranted,
            entitlement_source: entitlement?.source || "not_registered",
            unavailable_reason: !moduleEnabled
                ? "module_not_enabled"
                : !privilegeGranted
                    ? "missing_privilege"
                    : null
        };
    });

    return {
        membership: effective.membership,
        roles: effective.roles,
        capabilities: effective.capabilities,
        privileges: effective.privileges,
        modules
    };
}

module.exports = { getPlatformContext };
