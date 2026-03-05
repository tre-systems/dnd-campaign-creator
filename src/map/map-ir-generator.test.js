"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { assertValidMapIr } = require("./map-ir");
const { trainMapIrProposalModel } = require("./map-ir-proposal-model");
const {
  generateConstrainedMapIr,
  generateLearnedProposalMapIr,
  countConnectedComponents,
} = require("./map-ir-generator");

const FEATURE_TYPES = new Set([
  "pillar",
  "stairsDown",
  "stairsUp",
  "well",
  "statue",
  "trap",
  "altar",
  "chest",
  "coffin",
  "curtain",
]);

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
    assert.ok(
      mapIr.thresholds.every((threshold) =>
        ["door", "locked", "secret"].includes(threshold.type),
      ),
    );
    assert.ok(Array.isArray(mapIr.extensions?.features));
    assert.ok(mapIr.extensions.features.length > 0);
    assert.ok(
      mapIr.extensions.features.every((feature) => FEATURE_TYPES.has(feature.type)),
    );
    assert.equal(
      mapIr.diagnostics.generator.featureCount,
      mapIr.extensions.features.length,
    );
    const labelCells = new Set(
      mapIr.labels.map((label) => `${label.x},${label.y}`),
    );
    assert.ok(
      mapIr.extensions.features.every(
        (feature) => !labelCells.has(`${feature.x},${feature.y}`),
      ),
    );
    assert.ok(
      mapIr.extensions.features.some((feature) => feature.type === "stairsDown"),
    );
    assert.ok(
      mapIr.extensions.features.some((feature) => feature.type === "stairsUp"),
    );

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

  it("generates a learned proposal map from trained corpus priors", () => {
    const corpus = [
      generateConstrainedMapIr({
        seed: 100,
        width: 48,
        height: 48,
        roomCount: 14,
      }),
      generateConstrainedMapIr({
        seed: 101,
        width: 48,
        height: 48,
        roomCount: 15,
      }),
      generateConstrainedMapIr({
        seed: 102,
        width: 48,
        height: 48,
        roomCount: 16,
      }),
    ];
    const model = trainMapIrProposalModel(corpus);

    const learned = generateLearnedProposalMapIr({
      model,
      seed: 42,
      attempts: 12,
    });

    assert.doesNotThrow(() => assertValidMapIr(learned));
    assert.equal(learned.meta.source, "map-ir-generator:learned-proposal");
    assert.equal(learned.diagnostics.generator.strategy, "learned-proposal");
    assert.equal(learned.diagnostics.generator.connectedComponents, 1);
    assert.ok(Number.isFinite(learned.diagnostics.generator.proposalScore));
  });

  it("is deterministic for learned generation with same model and seed", () => {
    const corpus = [
      generateConstrainedMapIr({
        seed: 200,
        width: 52,
        height: 52,
        roomCount: 15,
      }),
      generateConstrainedMapIr({
        seed: 201,
        width: 52,
        height: 52,
        roomCount: 16,
      }),
      generateConstrainedMapIr({
        seed: 202,
        width: 52,
        height: 52,
        roomCount: 17,
      }),
    ];
    const model = trainMapIrProposalModel(corpus);

    const a = generateLearnedProposalMapIr({
      model,
      seed: 99,
      attempts: 10,
    });
    const b = generateLearnedProposalMapIr({
      model,
      seed: 99,
      attempts: 10,
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
