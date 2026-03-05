"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createMapIr } = require("./map-ir");
const {
  computeMapIrStructuralMetrics,
  trainMapIrProposalModel,
  assertValidMapIrProposalModel,
} = require("./map-ir-proposal-model");

function makeSampleMap(width, height, floorRatio, labelCount, thresholdCount) {
  const floors = [
    { x: 2, y: 2, w: 8, h: 6 },
    { x: 14, y: 2, w: 10, h: 7 },
    { x: 5, y: 12, w: 16, h: 9 },
  ];
  const walls = [
    { x1: 2, y1: 2, x2: 10, y2: 2 },
    { x1: 10, y1: 2, x2: 10, y2: 8 },
    { x1: 14, y1: 2, x2: 24, y2: 2 },
    { x1: 24, y1: 2, x2: 24, y2: 9 },
  ];

  const labels = Array.from({ length: labelCount }, (_, idx) => ({
    text: String(idx + 1),
    x: 3 + idx,
    y: 3,
  }));

  const thresholds = Array.from({ length: thresholdCount }, (_, idx) => ({
    x: 4 + idx,
    y: 8,
    type: "door",
  }));

  return createMapIr({
    meta: {
      width,
      height,
      cellSizeFt: 10,
      title: "Sample",
    },
    floors,
    walls,
    thresholds,
    labels,
    diagnostics: {
      floorCellRatio: floorRatio,
    },
  });
}

describe("map-ir-proposal-model", () => {
  it("computes structural metrics from MapIR", () => {
    const mapIr = makeSampleMap(80, 96, 0.44, 5, 2);
    const metrics = computeMapIrStructuralMetrics(mapIr);

    assert.equal(metrics.width, 80);
    assert.equal(metrics.height, 96);
    assert.equal(metrics.area, 7680);
    assert.equal(metrics.floorCellRatio, 0.44);
    assert.ok(metrics.floorsPerCell > 0);
    assert.ok(metrics.wallsPerCell > 0);
    assert.ok(metrics.thresholdsPerCell > 0);
    assert.ok(metrics.labelsPerCell > 0);
  });

  it("trains a proposal model from a corpus", () => {
    const corpus = [
      makeSampleMap(80, 96, 0.42, 4, 2),
      makeSampleMap(90, 96, 0.47, 6, 3),
      makeSampleMap(96, 96, 0.5, 8, 4),
    ];

    const model = trainMapIrProposalModel(corpus, {
      sourceDir: "/tmp/corpus",
    });

    assert.equal(model.kind, "map-ir-proposal-model");
    assert.equal(model.version, "0.1.0");
    assert.equal(model.corpus.mapCount, 3);
    assert.deepEqual(model.dimensions.width.values, [80, 90, 96]);
    assert.deepEqual(model.dimensions.height.values, [96]);
    assert.ok(model.metrics.floorCellRatio.mean > 0.4);
    assert.ok(model.metrics.floorCellRatio.mean < 0.51);
    assert.ok(model.generatorPriors.roomMinSize >= 3);
    assert.ok(
      model.generatorPriors.roomMaxSize > model.generatorPriors.roomMinSize,
    );
    assert.ok(model.generatorPriors.roomCountMean >= 8);

    assert.doesNotThrow(() => assertValidMapIrProposalModel(model));
  });

  it("rejects invalid proposal model shape", () => {
    assert.throws(() => {
      assertValidMapIrProposalModel({
        version: "0.1.0",
        kind: "wrong",
      });
    }, /kind/);
  });
});
