const assert = require("assert");
const { mapEffectiveAuthorization } = require("../src/core/authorization/mapper");

function main() {
    const mapped = mapEffectiveAuthorization({
        membership: { status: "active", is_owner: 1 },
        roles: [{ code: "tenant_admin", name: "Mandantenadministrator", scope: "workspace" }],
        capabilities: [{ code: "inventory_viewer", name: "Inventar Viewer", module_code: "inventory", description: "" }],
        privileges: [{ code: "inventory.view", module_code: "inventory", resource: "inventory", action: "view", description: "" }]
    });

    assert.strictEqual(mapped.membership.status, "active");
    assert.strictEqual(mapped.membership.is_owner, true);
    assert.deepStrictEqual(mapped.roles.map(item => item.code), ["tenant_admin"]);
    assert.deepStrictEqual(mapped.capabilities.map(item => item.code), ["inventory_viewer"]);
    assert.deepStrictEqual(mapped.privileges.map(item => item.code), ["inventory.view"]);

    console.log(JSON.stringify({
        ok: true,
        effectivePermissionMapping: true,
        denyByAbsenceModel: true
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
