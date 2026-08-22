const { normalizeEmail, validateEmail } = require("../identity/validator");

function validateTargetPayload(payload = {}) {
    const email = normalizeEmail(payload.email);
    const workspacePublicId = String(payload.workspacePublicId || "").trim();

    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };

    return {
        value: {
            email,
            workspacePublicId
        }
    };
}

function validateRoleChangePayload(payload = {}) {
    const target = validateTargetPayload(payload);
    if (target.error) return target;

    const roleCode = String(payload.roleCode || "").trim();
    const actorEmail = normalizeEmail(payload.actorEmail);

    if (!roleCode) return { error: "Rollen-Code ist erforderlich." };

    const actorError = validateEmail(actorEmail);
    if (actorError) return { error: "Gültige Actor-E-Mail ist erforderlich." };

    return {
        value: {
            ...target.value,
            roleCode,
            actorEmail
        }
    };
}

function validateCapabilityChangePayload(payload = {}) {
    const target = validateTargetPayload(payload);
    if (target.error) return target;

    const capabilityCode = String(payload.capabilityCode || "").trim();
    const actorEmail = normalizeEmail(payload.actorEmail);

    if (!capabilityCode) return { error: "Capability-Code ist erforderlich." };

    const actorError = validateEmail(actorEmail);
    if (actorError) return { error: "Gültige Actor-E-Mail ist erforderlich." };

    return {
        value: {
            ...target.value,
            capabilityCode,
            actorEmail
        }
    };
}

module.exports = {
    validateTargetPayload,
    validateRoleChangePayload,
    validateCapabilityChangePayload
};
