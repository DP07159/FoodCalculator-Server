const assert = require("assert");
const {
    normalizeWorkspacePublicIds
} = require("../src/modules/recipes/workspaceAssignmentService");

function main() {
    assert.deepStrictEqual(
        normalizeWorkspacePublicIds([
            "abc",
            "abc",
            "  def  ",
            "",
            null
        ]),
        ["abc", "def"]
    );

    assert.deepStrictEqual(
        normalizeWorkspacePublicIds("abc"),
        []
    );

    console.log(JSON.stringify({
        ok: true,
        multiWorkspaceNormalization: true,
        duplicateWorkspacePrevention: true
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
