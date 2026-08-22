const assert = require("assert");
const {
    normalizeWorkspaceName,
    validateWorkspaceName,
    validateWorkspaceType
} = require("../src/core/workspaces/validator");

function main() {
    assert.strictEqual(
        normalizeWorkspaceName("  Mein   Workspace  "),
        "Mein Workspace"
    );

    assert.strictEqual(validateWorkspaceName(""), "Workspace-Name ist erforderlich.");
    assert.strictEqual(validateWorkspaceName("Mein Workspace"), null);

    for (const type of ["personal", "family", "practice", "restaurant", "organization"]) {
        assert.strictEqual(validateWorkspaceType(type), null);
    }

    assert.strictEqual(validateWorkspaceType("unknown"), "Workspace-Typ ist ungültig.");

    console.log(JSON.stringify({
        ok: true,
        workspaceNameNormalization: true,
        workspaceTypeValidation: true
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
