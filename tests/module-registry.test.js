const assert = require("assert");
const { getModuleDefinitions } = require("../src/core/moduleRegistry/registry");

const modules = getModuleDefinitions();
const codes = modules.map(item => item.code);

assert.deepStrictEqual(codes, ["meal_plan", "recipes", "inventory"]);
assert(modules.every(item => item.navigation && item.navigation.href));
assert(modules.flatMap(item => item.home_actions || []).some(action => action.code === "cook_now"));
assert(modules.find(item => item.code === "inventory").required_privilege === "inventory.view");

console.log("module-registry.test.js: OK");
