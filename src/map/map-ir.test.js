"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  MAP_IR_VERSION,
  validateMapIr,
  assertValidMapIr,
  createMapIr,
} = require("./map-ir");

describe("map-ir", () => {
  it("validates a well-formed MapIR object", () => {
    const mapIr = {
      version: MAP_IR_VERSION,
      meta: {
        width: 12,
        height: 10,
        cellSizeFt: 10,
      },
      floors: [{ x: 1, y: 1, w: 5, h: 4 }],
      walls: [
        { x1: 1, y1: 1, x2: 6, y2: 1 },
        { x1: 6, y1: 1, x2: 6, y2: 5 },
      ],
      thresholds: [{ x: 6, y: 3, type: "door" }],
      labels: [{ text: "1", x: 2, y: 2 }],
    };

    const result = validateMapIr(mapIr);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects unsupported versions and invalid wall geometry", () => {
    const mapIr = {
      version: "99.9.9",
      meta: {
        width: 8,
        height: 8,
      },
      floors: [{ x: 0, y: 0, w: 4, h: 4 }],
      walls: [{ x1: 0, y1: 0, x2: 3, y2: 2 }],
    };

    const result = validateMapIr(mapIr);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.path === "version"));
    assert.ok(
      result.errors.some((error) => error.path === "walls[0]"),
      "expected diagonal wall validation error",
    );
  });

  it("creates and validates defaults from partial input", () => {
    const created = createMapIr({
      meta: { width: 6, height: 4 },
      floors: [{ x: 1, y: 1, w: 2, h: 2 }],
      walls: [{ x1: 1, y1: 1, x2: 3, y2: 1 }],
    });

    assert.equal(created.version, MAP_IR_VERSION);
    assert.equal(created.meta.cellSizeFt, 10);
    assert.deepEqual(created.thresholds, []);
    assert.deepEqual(created.labels, []);
    assert.doesNotThrow(() => assertValidMapIr(created));
  });

  it("throws from assertValidMapIr when invalid", () => {
    assert.throws(() => {
      assertValidMapIr({
        meta: { width: 0, height: 0 },
        floors: [],
        walls: [],
      });
    }, /Invalid MapIR/);
  });
});
