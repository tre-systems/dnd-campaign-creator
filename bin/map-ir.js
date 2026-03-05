#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { extractMapIrFromImage } = require("../src/map/map-ir-extractor");
const { renderMapIrSvg } = require("../src/map/render-map-ir-svg");

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function parseFiniteArg(args, flag, fallback = null) {
  const raw = getArg(args, flag, null);
  if (raw === null) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return value;
}

function parseIntArg(args, flag, fallback = null) {
  const raw = getArg(args, flag, null);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be an integer`);
  }
  return value;
}

async function writeTextFile(filePath, contents) {
  const absPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, contents, "utf8");
  return absPath;
}

function printUsage() {
  console.log("Usage:");
  console.log(
    "  node bin/map-ir.js extract --input <image> --out <map-ir.json> [--diag <diagnostics.json>] [--title <title>] [--cell-size-ft <n>] [--min-grid-px <n>] [--max-grid-px <n>]",
  );
  console.log(
    "  node bin/map-ir.js render --input <map-ir.json> --out <map.svg> [--cell-size <n>]",
  );
  console.log(
    "  node bin/map-ir.js roundtrip --input <image> --ir-out <map-ir.json> --svg-out <map.svg> [extract/render options]",
  );
}

async function runExtract(args) {
  const inputPath = getArg(args, "--input", null);
  const outputPath = getArg(args, "--out", null);
  const diagnosticsPath = getArg(args, "--diag", null);

  if (!inputPath) {
    throw new Error("extract requires --input <image>");
  }
  if (!outputPath) {
    throw new Error("extract requires --out <map-ir.json>");
  }

  const result = await extractMapIrFromImage(path.resolve(inputPath), {
    title: getArg(args, "--title", null),
    cellSizeFt: parseFiniteArg(args, "--cell-size-ft", 10),
    minGridPx: parseIntArg(args, "--min-grid-px", 8),
    maxGridPx: parseIntArg(args, "--max-grid-px", 80),
    floorLuminanceThreshold: parseFiniteArg(
      args,
      "--floor-luma-threshold",
      0.78,
    ),
    floorCellRatioThreshold: parseFiniteArg(
      args,
      "--floor-cell-threshold",
      0.38,
    ),
    maxCells: parseIntArg(args, "--max-cells", 128),
    maxSize: parseIntArg(args, "--max-size", 1600),
  });

  const irOut = await writeTextFile(
    outputPath,
    `${JSON.stringify(result.mapIr, null, 2)}\n`,
  );

  console.log(`Wrote MapIR JSON to ${irOut}`);
  console.log(
    `Extracted grid ${result.mapIr.meta.width}x${result.mapIr.meta.height} cells at ~${result.diagnostics.chosenSpacing}px per cell.`,
  );
  console.log(
    `Floor cells: ${result.diagnostics.floorCellCount} (${(
      result.diagnostics.floorCellRatio * 100
    ).toFixed(1)}%)`,
  );

  if (diagnosticsPath) {
    const diagOut = await writeTextFile(
      diagnosticsPath,
      `${JSON.stringify(result.diagnostics, null, 2)}\n`,
    );
    console.log(`Wrote extraction diagnostics to ${diagOut}`);
  }

  return result.mapIr;
}

async function runRender(args, mapIrOverride = null) {
  const inputPath = getArg(args, "--input", null);
  const outputPath = getArg(args, "--out", null);

  if (!outputPath) {
    throw new Error("render requires --out <map.svg>");
  }

  let mapIr = mapIrOverride;
  if (!mapIr) {
    if (!inputPath) {
      throw new Error("render requires --input <map-ir.json>");
    }
    const payload = await fs.readFile(path.resolve(inputPath), "utf8");
    mapIr = JSON.parse(payload);
  }

  const svg = renderMapIrSvg(mapIr, {
    cellSize: parseFiniteArg(args, "--cell-size", 20),
  });

  const svgOut = await writeTextFile(outputPath, svg);
  console.log(`Wrote MapIR SVG render to ${svgOut}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const command = args[0];

  if (command === "extract") {
    await runExtract(args);
    return;
  }

  if (command === "render") {
    await runRender(args);
    return;
  }

  if (command === "roundtrip") {
    const irOut = getArg(args, "--ir-out", null);
    const svgOut = getArg(args, "--svg-out", null);
    if (!irOut) {
      throw new Error("roundtrip requires --ir-out <map-ir.json>");
    }
    if (!svgOut) {
      throw new Error("roundtrip requires --svg-out <map.svg>");
    }

    const extractArgs = [...args, "--out", irOut];
    const mapIr = await runExtract(extractArgs);
    const renderArgs = [...args, "--out", svgOut];
    await runRender(renderArgs, mapIr);
    return;
  }

  throw new Error(`unsupported command: ${command}`);
}

main().catch((error) => {
  console.error(`map-ir command failed: ${error.message}`);
  process.exitCode = 1;
});
