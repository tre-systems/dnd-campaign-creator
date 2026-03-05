"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createMapIr } = require("./map-ir");
const { renderMapIrSvg } = require("./render-map-ir-svg");

describe("render-map-ir-svg", () => {
  it("renders deterministic SVG for a simple MapIR", () => {
    const mapIr = createMapIr({
      meta: {
        width: 10,
        height: 8,
        cellSizeFt: 10,
        title: "Test Room",
      },
      floors: [{ x: 1, y: 1, w: 4, h: 3 }],
      walls: [
        { x1: 1, y1: 1, x2: 5, y2: 1 },
        { x1: 5, y1: 1, x2: 5, y2: 4 },
      ],
      thresholds: [{ x: 5, y: 2, type: "door" }],
      labels: [{ text: "1", x: 2, y: 2 }],
    });

    const svg = renderMapIrSvg(mapIr, {
      cellSize: 24,
    });

    assert.match(svg, /<svg/);
    assert.match(svg, /MapIR render: Test Room/);
    assert.match(svg, /class="floors"/);
    assert.match(svg, /class="walls"/);
    assert.match(svg, /class="labels"/);
    assert.match(svg, />1<\/text>/);
  });

  it("throws when map IR is invalid", () => {
    assert.throws(() => {
      renderMapIrSvg({
        meta: { width: 10, height: 10 },
        floors: [],
      });
    }, /Invalid MapIR/);
  });
});
