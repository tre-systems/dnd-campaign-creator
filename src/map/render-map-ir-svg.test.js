"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createMapIr } = require("./map-ir");
const { renderMapIrSvg } = require("./render-map-ir-svg");

function makeMapIrWithFloorRatio(floorCellRatio) {
  return createMapIr({
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
    diagnostics: {
      floorCellRatio,
    },
  });
}

function extractBackgroundFill(svg) {
  const match = svg.match(
    /<rect x="0" y="0" width="[^"]+" height="[^"]+" fill="([^"]+)" \/>/,
  );
  assert.ok(match, "expected to find map background rect");
  return match[1];
}

describe("render-map-ir-svg", () => {
  it("renders deterministic SVG for a simple MapIR", () => {
    const mapIr = makeMapIrWithFloorRatio(0.48);

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

  it("adapts default background palette by extracted floor ratio", () => {
    const sparse = makeMapIrWithFloorRatio(0.34);
    const dense = makeMapIrWithFloorRatio(0.58);

    const sparseSvg = renderMapIrSvg(sparse);
    const denseSvg = renderMapIrSvg(dense);

    const sparseBackground = extractBackgroundFill(sparseSvg);
    const denseBackground = extractBackgroundFill(denseSvg);

    assert.notEqual(sparseBackground, "#4393be");
    assert.notEqual(denseBackground, "#4393be");
    assert.notEqual(sparseBackground, denseBackground);
  });

  it("does not adapt background when explicit palette is provided", () => {
    const mapIr = makeMapIrWithFloorRatio(0.34);

    const svg = renderMapIrSvg(mapIr, {
      palette: {
        background: "#101010",
      },
    });

    const background = extractBackgroundFill(svg);
    assert.equal(background, "#101010");
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
