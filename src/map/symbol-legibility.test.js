const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const { renderSvg } = require("./render-svg");
const { CELL, createGrid } = require("./geometry");

async function renderSymbolCell(cellType) {
  const cells = createGrid(3, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      cells[y][x] = CELL.FLOOR;
    }
  }
  cells[1][1] = cellType;

  const geometry = {
    width: 3,
    height: 3,
    cells,
    rooms: [],
    corridors: [],
  };

  const svg = renderSvg(
    geometry,
    { nodes: [], edges: [], nodeMap: new Map(), adjacency: new Map() },
    { id: "test", theme: "test", level: 1 },
    {
      cellSize: 20,
      colorScheme: "blue",
      styleProfile: "blueprint-strict",
      showGrid: false,
      showLabels: false,
      showRockHatch: false,
      showCompass: false,
      showLegend: false,
      showTitleBlock: false,
      showSheetBorder: false,
      showWash: false,
      showPaperGrain: false,
    },
  );

  return sharp(Buffer.from(svg))
    .png()
    .extract({ left: 20, top: 20, width: 20, height: 20 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function normalizedDiff(a, b) {
  const dataA = a.data;
  const dataB = b.data;
  let diff = 0;

  for (let i = 0; i < dataA.length; i += 4) {
    diff += Math.abs(dataA[i] - dataB[i]);
    diff += Math.abs(dataA[i + 1] - dataB[i + 1]);
    diff += Math.abs(dataA[i + 2] - dataB[i + 2]);
  }

  const pixels = a.info.width * a.info.height;
  return diff / (pixels * 255 * 3);
}

describe("symbol legibility", () => {
  it("ensures key symbols have visible contrast against floor", async () => {
    const [baseline, door, locked, secret, stairsDown, stairsUp] =
      await Promise.all([
        renderSymbolCell(CELL.FLOOR),
        renderSymbolCell(CELL.DOOR),
        renderSymbolCell(CELL.DOOR_LOCKED),
        renderSymbolCell(CELL.DOOR_SECRET),
        renderSymbolCell(CELL.STAIRS_DOWN),
        renderSymbolCell(CELL.STAIRS_UP),
      ]);

    assert.ok(normalizedDiff(door, baseline) > 0.018, "Door too faint");
    assert.ok(normalizedDiff(locked, baseline) > 0.02, "Locked door too faint");
    assert.ok(normalizedDiff(secret, baseline) > 0.02, "Secret door too faint");
    assert.ok(
      normalizedDiff(stairsDown, baseline) > 0.02,
      "Stairs down too faint",
    );
    assert.ok(normalizedDiff(stairsUp, baseline) > 0.02, "Stairs up too faint");
  });

  it("ensures key symbols are distinguishable from one another", async () => {
    const [door, locked, secret, stairsDown, stairsUp] = await Promise.all([
      renderSymbolCell(CELL.DOOR),
      renderSymbolCell(CELL.DOOR_LOCKED),
      renderSymbolCell(CELL.DOOR_SECRET),
      renderSymbolCell(CELL.STAIRS_DOWN),
      renderSymbolCell(CELL.STAIRS_UP),
    ]);

    assert.ok(
      normalizedDiff(door, locked) > 0.01,
      "Door and locked door are too similar",
    );
    assert.ok(
      normalizedDiff(door, secret) > 0.02,
      "Door and secret door are too similar",
    );
    assert.ok(
      normalizedDiff(locked, secret) > 0.02,
      "Locked and secret door are too similar",
    );
    assert.ok(
      normalizedDiff(stairsUp, stairsDown) > 0.02,
      "Stairs up and stairs down are too similar",
    );
  });
});
