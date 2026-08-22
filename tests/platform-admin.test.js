const assert = require("assert");
const {
    validateUserStatus,
    validateBoolean,
    normalizeCode
} = require("../src/core/platformAdmin/validator");

function main() {
    for (const status of ["pending", "active", "suspended"]) {
        assert.strictEqual(
            validateUserStatus(status).error,
            undefined
        );
    }

    assert.ok(validateUserStatus("deleted").error);
    assert.strictEqual(validateBoolean(true).value, true);
    assert.strictEqual(validateBoolean(false).value, false);
    assert.ok(validateBoolean("true").error);
    assert.strictEqual(normalizeCode(" inventory "), "inventory");

    console.log(JSON.stringify({
        ok: true,
        userStatusValidation: true,
        moduleToggleValidation: true,
        codeNormalization: true
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(JSON.stringify({
        ok: false,
        error: error.message
    }, null, 2));
    process.exit(1);
}
