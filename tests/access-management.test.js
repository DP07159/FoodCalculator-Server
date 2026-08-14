const assert = require("assert");
const {
    validateTargetPayload,
    validateRoleChangePayload,
    validateCapabilityChangePayload
} = require("../src/core/authorization/accessManagementValidator");

function main() {
    assert.strictEqual(
        validateTargetPayload({ email: "" }).error,
        "E-Mail-Adresse ist erforderlich."
    );

    assert.strictEqual(
        validateRoleChangePayload({
            email: "test@example.com",
            roleCode: "",
            actorEmail: "admin@example.com"
        }).error,
        "Rollen-Code ist erforderlich."
    );

    assert.strictEqual(
        validateCapabilityChangePayload({
            email: "test@example.com",
            capabilityCode: "",
            actorEmail: "admin@example.com"
        }).error,
        "Capability-Code ist erforderlich."
    );

    assert.strictEqual(
        validateRoleChangePayload({
            email: "test@example.com",
            roleCode: "standard_user",
            actorEmail: "admin@example.com"
        }).error,
        undefined
    );

    console.log(JSON.stringify({
        ok: true,
        targetValidation: true,
        roleChangeValidation: true,
        capabilityChangeValidation: true
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
}
