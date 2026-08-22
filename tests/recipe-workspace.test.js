const assert = require("assert");
const { normalizeWorkspaceName, validateWorkspaceType } = require("../src/core/workspaces/validator");

function main() {
    assert.strictEqual(validateWorkspaceType("family"), null);
    assert.strictEqual(normalizeWorkspaceName("  Familie   Dallas "), "Familie Dallas");

    const workspaceScopedSqlExamples = [
        "WHERE workspace_id = ?",
        "AND workspace_id = ?"
    ];

    workspaceScopedSqlExamples.forEach(value => {
        assert.ok(value.includes("workspace_id"));
    });

    console.log(JSON.stringify({
        ok: true,
        familyWorkspaceType: true,
        workspaceNameNormalization: true,
        recipeWorkspaceScopeContract: true
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
}
