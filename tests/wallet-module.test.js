const assert = require("assert");
const validator = require("../src/modules/wallet/validator");
const { getModuleDefinitions } = require("../src/core/moduleRegistry/registry");

assert.ok(getModuleDefinitions().some(moduleDefinition => moduleDefinition.code === "wallet"));
assert.strictEqual(validator.validateCreate({ source_url: "https://instagram.com/p/example" }).value.source_type, "link");
assert.ok(validator.validateCreate({ source_url: "notaurl" }).error);
assert.strictEqual(validator.validateCreate({ note: "Merken" }).value.source_type, "note");
console.log("wallet-module.test.js: ok");
