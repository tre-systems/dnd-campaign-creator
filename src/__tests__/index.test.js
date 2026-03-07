const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("package entrypoint exists and exports the public API", () => {
  const packageJson = require("../../package.json");
  const mainPath = path.resolve(__dirname, "../..", packageJson.main);

  assert.ok(fs.existsSync(mainPath), "package.json main entry should exist");

  const api = require(mainPath);
  assert.equal(typeof api.combineAdventureFiles, "function");
  assert.equal(typeof api.validateMapPromptSpec, "function");
  assert.equal(typeof api.syncAdventureAssets, "function");
});
