const assert = require("assert");
const validator = require("../src/modules/wallet/validator");
const metadata = require("../src/modules/wallet/sourceMetadata");
const { getModuleDefinitions } = require("../src/core/moduleRegistry/registry");

assert.ok(getModuleDefinitions().some(moduleDefinition => moduleDefinition.code === "wallet"));
assert.strictEqual(validator.validateCreate({ source_url: "https://instagram.com/p/example" }).value.source_type, "link");
assert.ok(validator.validateCreate({ source_url: "notaurl" }).error);
assert.strictEqual(validator.validateCreate({ note: "Merken" }).value.source_type, "note");
assert.strictEqual(validator.validateCreate({ source_url: "https://example.com", source_image_url: "https://example.com/a.jpg" }).value.source_image_url, "https://example.com/a.jpg");
assert.ok(validator.validatePreview({ source_url: "https://example.com" }).value);
assert.ok(validator.validatePreview({ source_url: "file:///tmp/test" }).error);
assert.strictEqual(metadata.isPrivateIp("127.0.0.1"), true);
assert.strictEqual(metadata.isPrivateIp("192.168.1.1"), true);
assert.strictEqual(metadata.isPrivateIp("8.8.8.8"), false);
console.log("wallet-module.test.js: ok");
