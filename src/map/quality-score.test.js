"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeCompositeScore,
  aggregateMapMetrics,
  evaluateQualityGate,
} = require("./quality-score");

describe("quality-score", () => {
  it("normalizes composite weights when scoring", () => {
    const score = computeCompositeScore(
      {
        style: 40,
        content: 100,
        semantics: 100,
      },
      {
        style: 4,
        content: 3,
        semantics: 3,
      },
    );

    assert.equal(score, 76);
  });

  it("aggregates map metrics into corpus coverage ratios", () => {
    const aggregate = aggregateMapMetrics([
      {
        roomCount: 10,
        nonRectRooms: 4,
        circleRooms: 1,
        caveRooms: 1,
        shapeCounts: { rect: 6, circle: 1, cave: 1, chamfered: 2 },
        featureCounts: {
          door: 3,
          lockedDoor: 1,
          secretDoor: 1,
          stairsUp: 1,
          stairsDown: 1,
          columns: 2,
        },
        distinctFeatureTags: ["door", "lockedDoor", "secretDoor"],
        featureTagCount: 3,
        playableCellCount: 120,
        featureCellCount: 9,
        doorTotal: 5,
        doorValid: 5,
        entryCount: 1,
        entriesWithTransition: 1,
        exitCount: 1,
        exitsWithTransition: 1,
        hasEdgeType: { door: true, locked: true, secret: true },
        hasDoorSymbol: { door: true, locked: true, secret: true },
        widthClassCounts: { tight: 1, standard: 3, wide: 1 },
        gatedEdgeTotal: 3,
        gatedEdgePlaced: 3,
        gatedEdgeSymbolMatched: 3,
        cycleCount: 2,
        disjointPaths: 2,
      },
      {
        roomCount: 8,
        nonRectRooms: 1,
        circleRooms: 0,
        caveRooms: 0,
        shapeCounts: { rect: 7, notched: 1 },
        featureCounts: {
          door: 2,
          lockedDoor: 0,
          secretDoor: 0,
          stairsUp: 1,
          stairsDown: 1,
          columns: 1,
        },
        distinctFeatureTags: ["door"],
        featureTagCount: 1,
        playableCellCount: 90,
        featureCellCount: 4,
        doorTotal: 2,
        doorValid: 1,
        entryCount: 1,
        entriesWithTransition: 1,
        exitCount: 1,
        exitsWithTransition: 1,
        hasEdgeType: { door: true, locked: false, secret: false },
        hasDoorSymbol: { door: true, locked: false, secret: false },
        widthClassCounts: { tight: 0, standard: 2, wide: 0 },
        gatedEdgeTotal: 1,
        gatedEdgePlaced: 1,
        gatedEdgeSymbolMatched: 1,
        cycleCount: 0,
        disjointPaths: 1,
      },
    ]);

    assert.equal(aggregate.mapCount, 2);
    assert.equal(aggregate.mapsWithCaves, 1);
    assert.equal(Number(aggregate.nonRectRoomFraction.toFixed(3)), 0.278);
    assert.equal(Number(aggregate.doorValidityRatio.toFixed(3)), 0.857);
    assert.equal(Number(aggregate.loopCoverage.toFixed(3)), 0.5);
    assert.equal(Number(aggregate.disjointPathCoverage.toFixed(3)), 0.5);
    assert.equal(Number(aggregate.edgeSymbolCoverage.locked.toFixed(3)), 1);
    assert.equal(aggregate.corridorWidthVariety, 3);
    assert.equal(Number(aggregate.featureCellDensity.toFixed(3)), 0.062);
    assert.equal(Number(aggregate.gatedEdgeSymbolMatchCoverage.toFixed(3)), 1);
  });

  it("evaluates style/content/semantics quality gates", () => {
    const spec = {
      qualityGate: {
        weights: { style: 0.4, content: 0.3, semantics: 0.3 },
        minCompositeScore: 70,
        style: {
          minScore: 40,
          maxAbsDelta: {
            luminanceMean: 0.12,
            saturationMean: 0.08,
          },
        },
        content: {
          minDistinctFeatureTypes: 2,
          minCorridorWidthVariety: 2,
          minFeatureCellDensity: 0.05,
          maxFeatureCellDensity: 0.12,
          requiredFeatureTags: ["door", "stairsUp"],
        },
        semantics: {
          minDoorValidityRatio: 0.9,
          minEntryTransitionCoverage: 1,
          minExitTransitionCoverage: 1,
          minLoopCoverage: 1,
          minDisjointPathCoverage: 1,
          minGatedEdgePlacementCoverage: 1,
          minGatedEdgeSymbolMatchCoverage: 0.95,
          minEdgeSymbolCoverage: {
            door: 1,
            locked: 1,
            secret: 1,
          },
        },
      },
    };

    const report = {
      style: {
        score: 45,
        delta: {
          luminanceMean: -0.08,
          luminanceStd: 0,
          saturationMean: 0.04,
          blueCast: 0,
          inkCoverage: 0,
          edgeDensity: 0,
          orthogonalEdgeRatio: 0,
          textureDensity: 0,
        },
      },
      content: {
        distinctFeatureTags: ["door", "stairsUp", "stairsDown"],
        corridorWidthVariety: 3,
        featureCellDensity: 0.08,
      },
      semantics: {
        doorValidityRatio: 1,
        entryTransitionCoverage: 1,
        exitTransitionCoverage: 1,
        loopCoverage: 1,
        disjointPathCoverage: 1,
        gatedEdgePlacementCoverage: 1,
        gatedEdgeSymbolMatchCoverage: 1,
        edgeSymbolCoverage: {
          door: 1,
          locked: 1,
          secret: 1,
        },
      },
    };

    const gate = evaluateQualityGate(report, spec);
    assert.equal(gate.passed, true);
    assert.ok(gate.compositeScore >= 70);
  });

  it("reports failures for unmet gate checks", () => {
    const spec = {
      qualityGate: {
        minCompositeScore: 80,
        style: {
          minScore: 50,
          maxAbsDelta: {
            luminanceMean: 0.04,
          },
        },
        content: {
          maxFeatureCellDensity: 0.08,
          requiredFeatureTags: ["door", "water"],
        },
        semantics: {
          minDoorValidityRatio: 1,
          minEntryTransitionCoverage: 1,
          minExitTransitionCoverage: 1,
          minLoopCoverage: 1,
          minDisjointPathCoverage: 1,
          minGatedEdgeSymbolMatchCoverage: 1,
        },
      },
    };

    const report = {
      style: {
        score: 40,
        delta: {
          luminanceMean: -0.08,
          luminanceStd: 0,
          saturationMean: 0,
          blueCast: 0,
          inkCoverage: 0,
          edgeDensity: 0,
          orthogonalEdgeRatio: 0,
          textureDensity: 0,
        },
      },
      content: {
        distinctFeatureTags: ["door"],
        featureCellDensity: 0.2,
      },
      semantics: {
        doorValidityRatio: 0.8,
        entryTransitionCoverage: 1,
        exitTransitionCoverage: 1,
        loopCoverage: 0.5,
        disjointPathCoverage: 0.5,
        gatedEdgeSymbolMatchCoverage: 0.7,
        edgeSymbolCoverage: {
          door: 1,
          locked: 1,
          secret: 1,
        },
      },
    };

    const gate = evaluateQualityGate(report, spec);
    assert.equal(gate.passed, false);
    assert.ok(
      gate.failures.some((failure) => failure.includes("style score")),
      "expected style minScore failure",
    );
    assert.ok(
      gate.failures.some((failure) =>
        failure.includes("missing required water"),
      ),
      "expected required feature failure",
    );
    assert.ok(
      gate.failures.some((failure) => failure.includes("minLoopCoverage")),
      "expected semantic failure",
    );
    assert.ok(
      gate.failures.some((failure) =>
        failure.includes("maxFeatureCellDensity"),
      ),
      "expected content density max failure",
    );
    assert.ok(
      gate.failures.some((failure) =>
        failure.includes("minGatedEdgeSymbolMatchCoverage"),
      ),
      "expected gated edge symbol-match failure",
    );
  });
});
