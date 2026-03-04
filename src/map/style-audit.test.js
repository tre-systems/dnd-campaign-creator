"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeMetrics,
  aggregateMetrics,
  metricDelta,
  evaluateAlignmentGate,
  computeAlignmentScore,
  deriveRecommendations,
} = require("./style-audit");

function buildImage(width, height, pixelFn) {
  const channels = 4;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const [r, g, b, a = 255] = pixelFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return data;
}

describe("style-audit", () => {
  it("computes stable low-edge metrics for solid color fields", () => {
    const raw = buildImage(16, 16, () => [40, 96, 180, 255]);
    const metrics = computeMetrics(raw, 16, 16, 4);

    assert.ok(metrics.blueCast > 0.5, "Expected clear blue cast");
    assert.ok(metrics.edgeDensity < 0.001, "Solid image should have no edges");
    assert.ok(
      metrics.textureDensity < 0.001,
      "Solid image should have no texture",
    );
  });

  it("detects higher structural detail in dense grid patterns", () => {
    const raw = buildImage(20, 20, (x, y) => {
      const on = x % 3 === 0 || y % 3 === 0;
      return on ? [20, 20, 20, 255] : [230, 230, 230, 255];
    });

    const metrics = computeMetrics(raw, 20, 20, 4);
    assert.ok(metrics.edgeDensity > 0.6, "Grid pattern should be edge-dense");
    assert.ok(
      metrics.textureDensity > 0.35,
      "Grid pattern should have strong local texture contrast",
    );
  });

  it("shows stronger orthogonal bias for vertical stripes", () => {
    const raw = buildImage(24, 24, (x) => {
      const dark = x % 4 < 2;
      return dark ? [35, 60, 120, 255] : [220, 235, 245, 255];
    });

    const metrics = computeMetrics(raw, 24, 24, 4);
    assert.ok(metrics.edgeDensity > 0.05, "Striped image should contain edges");
    assert.ok(
      metrics.orthogonalEdgeRatio > 0.85,
      "Vertical stripes should score strongly orthogonal",
    );
  });

  it("aggregates, deltas, and scores metric sets", () => {
    const sample = aggregateMetrics([
      {
        luminanceMean: 0.4,
        luminanceStd: 0.2,
        saturationMean: 0.3,
        blueCast: 0.2,
        inkCoverage: 0.18,
        edgeDensity: 0.22,
        orthogonalEdgeRatio: 0.7,
        textureDensity: 0.24,
      },
      {
        luminanceMean: 0.5,
        luminanceStd: 0.24,
        saturationMean: 0.26,
        blueCast: 0.18,
        inkCoverage: 0.2,
        edgeDensity: 0.2,
        orthogonalEdgeRatio: 0.76,
        textureDensity: 0.26,
      },
    ]);

    const reference = {
      luminanceMean: 0.46,
      luminanceStd: 0.23,
      saturationMean: 0.28,
      blueCast: 0.19,
      inkCoverage: 0.19,
      edgeDensity: 0.21,
      orthogonalEdgeRatio: 0.73,
      textureDensity: 0.25,
    };

    const delta = metricDelta(sample, reference);
    const score = computeAlignmentScore(delta);
    const notes = deriveRecommendations(sample, reference, delta);

    assert.ok(score > 70, "Near-reference metrics should score well");
    assert.ok(Array.isArray(notes), "Recommendations should return a list");
    assert.equal(Object.keys(delta).length, 8);
  });

  it("evaluates gate score and metric delta thresholds", () => {
    const delta = {
      luminanceMean: -0.08,
      luminanceStd: 0.01,
      saturationMean: 0.04,
      blueCast: 0.01,
      inkCoverage: 0.02,
      edgeDensity: -0.01,
      orthogonalEdgeRatio: 0.12,
      textureDensity: 0.01,
    };

    const failures = evaluateAlignmentGate(42.9, delta, {
      minScore: 45,
      maxAbsDelta: {
        luminanceMean: 0.06,
        orthogonalEdgeRatio: 0.1,
      },
    });

    assert.equal(failures.length, 3);
    assert.ok(
      failures.some((failure) => failure.type === "minScore"),
      "Expected minScore failure",
    );
    assert.ok(
      failures.some(
        (failure) =>
          failure.type === "maxAbsDelta" && failure.metric === "luminanceMean",
      ),
      "Expected luminanceMean delta failure",
    );
    assert.ok(
      failures.some(
        (failure) =>
          failure.type === "maxAbsDelta" &&
          failure.metric === "orthogonalEdgeRatio",
      ),
      "Expected orthogonalEdgeRatio delta failure",
    );
  });

  it("rejects unknown metrics in gate thresholds", () => {
    const delta = {
      luminanceMean: 0,
      luminanceStd: 0,
      saturationMean: 0,
      blueCast: 0,
      inkCoverage: 0,
      edgeDensity: 0,
      orthogonalEdgeRatio: 0,
      textureDensity: 0,
    };

    assert.throws(
      () =>
        evaluateAlignmentGate(60, delta, {
          maxAbsDelta: {
            madeUpMetric: 1,
          },
        }),
      /not a known metric/,
    );
  });
});
