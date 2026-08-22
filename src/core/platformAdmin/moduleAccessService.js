const repository = require("./moduleAccessRepository");

async function getEffectiveModuleAccess({
    userId,
    workspacePublicId,
    moduleCode
}) {
    const [moduleRow, membership] = await Promise.all([
        repository.findModuleByCode(moduleCode),
        repository.findActiveMembershipByWorkspacePublicId(
            userId,
            workspacePublicId
        )
    ]);

    if (!moduleRow || moduleRow.status !== "active") {
        return {
            exists: Boolean(moduleRow),
            enabled: false,
            reason: moduleRow ? "module_disabled_globally" : "module_unknown"
        };
    }

    if (!membership) {
        return {
            exists: true,
            enabled: false,
            reason: "membership_missing"
        };
    }

    const override = await repository.findModuleAccess(
        membership.id,
        moduleRow.id
    );

    return {
        exists: true,
        enabled: override
            ? Number(override.enabled) === 1
            : Number(moduleRow.default_enabled) === 1,
        reason: override ? "membership_override" : "module_default",
        membership_id: membership.id,
        module_code: moduleRow.code
    };
}

async function isModuleEnabled(userId, workspacePublicId, moduleCode) {
    const result = await getEffectiveModuleAccess({
        userId,
        workspacePublicId,
        moduleCode
    });
    return result.enabled;
}

module.exports = {
    getEffectiveModuleAccess,
    isModuleEnabled
};
