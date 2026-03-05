"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { assertValidMapIr } = require("./map-ir");
const {
  generateConstrainedMapIr,
  countConnectedComponents,
} = require("./map-ir-generator");

describe("map-ir-generator", () => {
  it("generates a valid constrained MapIR", () => {
    const mapIr = generateConstrainedMapIr({
      seed: 1337,
      width: 48,
      height: 48,
      roomCount: 12,
    });

    assert.doesNotThrow(() => assertValidMapIr(mapIr));
    assert.equal(mapIr.meta.width, 48);
    assert.equal(mapIr.meta.height, 48);
    assert.ok(mapIr.floors.length > 0);
    assert.ok(mapIr.walls.length > 0);
    assert.ok(mapIr.labels.length >= 8);
    assert.ok(mapIr.thresholds.length > 0);

    const components = mapIr.diagnostics.generator.connectedComponents;
    assert.equal(components, 1);
  });

  it("is deterministic for identical seeds and options", () => {
    const a = generateConstrainedMapIr({
      seed: 42,
      width: 40,
      height: 40,
      roomCount: 10,
    });
    const b = generateConstrainedMapIr({
      seed: 42,
      width: 40,
      height: 40,
      roomCount: 10,
    });

    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("counts connected floor components", () => {
    const cells = [
      [true, true, false, false],
      [true, true, false, true],
      [false, false, false, true],
    ];

    assert.equal(countConnectedComponents(cells), 2);
  });
});
