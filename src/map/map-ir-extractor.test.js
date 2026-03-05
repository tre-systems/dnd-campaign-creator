"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  extractMapIrFromRaw,
  detectGridSpacing,
  detectGridPhase,
  chooseGridSpacing,
  deriveWallSegments,
  extractHighConfidenceDoorThresholds,
} = require("./map-ir-extractor");

function makeSyntheticBlueprintRaw(gridWidth, gridHeight, cellSize) {
  const width = gridWidth * cellSize + 1;
  const height = gridHeight * cellSize + 1;
  const channels = 4;
  const raw = Buffer.alloc(width * height * channels);

  // Medium blueprint blue background.
  const bg = { r: 67, g: 146, b: 189, a: 255 };
  const floor = { r: 252, g: 253, b: 254, a: 255 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      raw[idx] = bg.r;
      raw[idx + 1] = bg.g;
      raw[idx + 2] = bg.b;
      raw[idx + 3] = bg.a;
    }
  }

  // Fill most cells with white interiors, leaving grid lines blue.
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const carve =
        gx >= 1 && gx <= gridWidth - 2 && gy >= 1 && gy <= gridHeight - 2;
      if (!carve) continue;

      const x0 = gx * cellSize + 1;
      const y0 = gy * cellSize + 1;
      const x1 = (gx + 1) * cellSize - 1;
      const y1 = (gy + 1) * cellSize - 1;

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = (y * width + x) * channels;
          raw[idx] = floor.r;
          raw[idx + 1] = floor.g;
          raw[idx + 2] = floor.b;
          raw[idx + 3] = floor.a;
        }
      }
    }
  }

  return {
    raw,
    width,
    height,
    channels,
  };
}

describe("map-ir-extractor", () => {
  it("detects spacing and phase from periodic profile", () => {
    const profile = new Float32Array(120);
    for (let i = 0; i < profile.length; i++) {
      profile[i] = i % 12 === 0 ? 1 : 0.2;
    }

    const spacing = detectGridSpacing(profile, 6, 30);
    assert.ok(spacing, "expected spacing detection result");
    assert.equal(spacing.spacing, 12);

    const phase = detectGridPhase(profile, spacing.spacing);
    assert.equal(phase, 0);
  });

  it("prefers smaller harmonic spacing when axis detections diverge", () => {
    const chosen = chooseGridSpacing(
      { spacing: 17, confidence: 0.61 },
      { spacing: 8, confidence: 0.64 },
      6,
      24,
    );
    assert.equal(chosen, 8);
  });

  it("extracts a valid MapIR from synthetic blueprint pixels", () => {
    const synthetic = makeSyntheticBlueprintRaw(12, 10, 10);

    const result = extractMapIrFromRaw(
      synthetic.raw,
      synthetic.width,
      synthetic.height,
      synthetic.channels,
      {
        minGridPx: 6,
        maxGridPx: 20,
        maxCells: 32,
      },
    );

    assert.ok(result.mapIr.meta.width >= 8);
    assert.ok(result.mapIr.meta.height >= 6);
    assert.ok(result.mapIr.floors.length > 0);
    assert.ok(result.mapIr.walls.length > 0);
    assert.ok(result.diagnostics.chosenSpacing >= 8);
    assert.ok(result.diagnostics.chosenSpacing <= 12);
  });

  it("derives boundary wall segments from floor occupancy", () => {
    const cells = [
      [false, false, false, false],
      [false, true, true, false],
      [false, true, true, false],
      [false, false, false, false],
    ];

    const walls = deriveWallSegments(cells);

    assert.ok(walls.length >= 4);
    assert.ok(
      walls.some((w) => w.y1 === 1 && w.y2 === 1 && w.x1 === 1 && w.x2 === 3),
      "expected top wall segment",
    );
    assert.ok(
      walls.some((w) => w.x1 === 1 && w.x2 === 1 && w.y1 === 1 && w.y2 === 3),
      "expected left wall segment",
    );
  });

  it("extracts high-confidence door thresholds from articulation choke cells", () => {
    const cells = [
      [false, false, false, false, false, false],
      [false, true, true, true, false, false],
      [false, false, false, false, false, false],
    ];

    const width = 40;
    const height = 40;
    const luma = new Float32Array(width * height).fill(0.95);
    // Mark the choke cell as darker to emulate door ink.
    for (let y = 10; y < 18; y++) {
      for (let x = 20; x < 28; x++) {
        luma[y * width + x] = 0.62;
      }
    }

    const thresholds = extractHighConfidenceDoorThresholds(
      cells,
      luma,
      width,
      height,
      {
        startX: 0,
        startY: 0,
        spacing: 10,
        gridWidth: 6,
        gridHeight: 3,
      },
      {
        minDoorDarkness: 0.2,
      },
    );

    assert.ok(thresholds.length > 0);
    assert.ok(
      thresholds.some((threshold) => threshold.x === 2 && threshold.y === 1),
    );
  });
});
