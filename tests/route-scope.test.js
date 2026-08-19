const fs = require("fs");
const assert = require("assert");

function checkRouteFile(path, moduleCode) {
    const source = fs.readFileSync(path, "utf8");

    assert.ok(
        !source.includes("router.use(requireAuthentication)"),
        `${path}: global requireAuthentication must not be present`
    );

    assert.ok(
        !source.includes("router.use(requireWorkspaceContext)"),
        `${path}: global requireWorkspaceContext must not be present`
    );

    assert.ok(
        !source.includes(`router.use(requireModuleEnabled("${moduleCode}"))`),
        `${path}: global module gate must not be present`
    );

    assert.ok(
        source.includes("requireAuthentication,"),
        `${path}: route-specific auth middleware missing`
    );

    assert.ok(
        source.includes("requireWorkspaceContext,"),
        `${path}: route-specific workspace middleware missing`
    );

    assert.ok(
        source.includes(`requireModuleEnabled("${moduleCode}")`),
        `${path}: route-specific module gate missing`
    );
}

checkRouteFile(
    "src/modules/inventory/routes.js",
    "inventory"
);

checkRouteFile(
    "src/modules/mealPlans/routes.js",
    "meal_plan"
);

console.log(JSON.stringify({
    ok: true,
    inventoryRouteScope: true,
    mealPlanRouteScope: true,
    authLoginNotGloballyIntercepted: true
}, null, 2));
