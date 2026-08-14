const assert = require("assert");
const {
    validateProvisionUserPayload,
    validateUserStatusPayload
} = require("../src/core/identity/provisioningValidator");

function main() {
    const valid = validateProvisionUserPayload({
        email: " Test.User@Example.com ",
        display_name: "  Test   User  ",
        password: "123456789012",
        locale: "de-DE",
        workspace_name: "  Test   Workspace "
    });

    assert.ok(!valid.error);
    assert.strictEqual(valid.value.email, "test.user@example.com");
    assert.strictEqual(valid.value.displayName, "Test User");
    assert.strictEqual(valid.value.workspaceName, "Test Workspace");

    assert.ok(validateProvisionUserPayload({
        email: "invalid",
        display_name: "Test",
        password: "123456789012"
    }).error);

    assert.ok(validateProvisionUserPayload({
        email: "test@example.com",
        display_name: "Test",
        password: "short"
    }).error);

    assert.deepStrictEqual(
        validateUserStatusPayload({ email: "test@example.com", status: "active" }).value,
        { email: "test@example.com", status: "active" }
    );

    assert.ok(validateUserStatusPayload({
        email: "test@example.com",
        status: "deleted"
    }).error);

    console.log(JSON.stringify({
        ok: true,
        provisioningValidation: true,
        statusValidation: true
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
}
