#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  generateConstrainedMapIr,
  generateLearnedProposalMapIr,
} = require("../src/map/map-ir-generator");
const {
  assertValidMapIrProposalModel,
} = require("../src/map/map-ir-proposal-model");
const { renderMapIrSvg } = require("../src/map/render-map-ir-svg");

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function parseIntArg(args, flag, fallback = null) {
  const raw = getArg(args, flag, null);
  if (raw === null || raw === undefined) return fallback;
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
    "  node bin/map-ir-generate.js --out-dir <json-dir> [--svg-dir <svg-dir>] [--summary <summary.json>] [--count <n>] [--seed <n>] [--width <n>] [--height <n>] [--room-count <n>] [--model <model.json>] [--attempts <n>]",
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const outDir = getArg(args, "--out-dir", null);
  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  const svgDir = getArg(args, "--svg-dir", null);
  const summaryPath = getArg(
    args,
    "--summary",
    path.join(outDir, "summary.json"),
  );

  const count = parseIntArg(args, "--count", 20);
  const seedBase = parseIntArg(args, "--seed", 1000);

  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("--count must be a positive integer");
  }

  const width = parseIntArg(args, "--width", null);
  const height = parseIntArg(args, "--height", null);
  const roomCount = parseIntArg(args, "--room-count", null);
  const attempts = parseIntArg(args, "--attempts", 32);
  if (attempts <= 0) {
    throw new Error("--attempts must be a positive integer");
  }

  const modelPath = getArg(args, "--model", null);
  let proposalModel = null;
  if (modelPath) {
    const payload = await fs.readFile(path.resolve(modelPath), "utf8");
    proposalModel = assertValidMapIrProposalModel(JSON.parse(payload));
  }

  await fs.mkdir(path.resolve(outDir), { recursive: true });
  if (svgDir) {
    await fs.mkdir(path.resolve(svgDir), { recursive: true });
  }

  const rows = [];

  for (let i = 0; i < count; i++) {
    const seed = seedBase + i;
    const id = `generated-seed${seed}`;
    const mapIr = proposalModel
      ? generateLearnedProposalMapIr({
          model: proposalModel,
          seed,
          width,
          height,
          attempts,
          title: `Learned Generated Map ${i + 1}`,
        })
      : generateConstrainedMapIr({
          seed,
          width,
          height,
          roomCount,
          title: `Generated Map ${i + 1}`,
        });

    const jsonPath = path.resolve(outDir, `${id}.map-ir.json`);
    await writeTextFile(jsonPath, `${JSON.stringify(mapIr, null, 2)}\n`);

    let svgPath = null;
    if (svgDir) {
      svgPath = path.resolve(svgDir, `${id}.svg`);
      const svg = renderMapIrSvg(mapIr, {
        cellSize: 16,
      });
      await writeTextFile(svgPath, svg);
    }

    rows.push({
      id,
      seed,
      mapIrPath: jsonPath,
      svgPath,
      width: mapIr.meta.width,
      height: mapIr.meta.height,
      floors: mapIr.floors.length,
      walls: mapIr.walls.length,
      thresholds: mapIr.thresholds.length,
      labels: mapIr.labels.length,
      connectedComponents: mapIr.diagnostics.generator.connectedComponents,
      floorCellRatio: mapIr.diagnostics.generator.floorCellRatio,
      strategy: mapIr.diagnostics.generator.strategy || "constrained",
      proposalScore: Number.isFinite(mapIr.diagnostics.generator.proposalScore)
        ? mapIr.diagnostics.generator.proposalScore
        : null,
    });

    console.log(
      `[${i + 1}/${count}] ${id} strategy=${rows[rows.length - 1].strategy} floors=${mapIr.floors.length} walls=${mapIr.walls.length} thresholds=${mapIr.thresholds.length}`,
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outDir: path.resolve(outDir),
    svgDir: svgDir ? path.resolve(svgDir) : null,
    count,
    seedBase,
    modelPath: modelPath ? path.resolve(modelPath) : null,
    attempts: proposalModel ? attempts : null,
    rows,
  };

  const summaryOut = await writeTextFile(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(`Wrote generator summary to ${summaryOut}`);
}

main().catch((error) => {
  console.error(`map-ir-generate failed: ${error.message}`);
  process.exitCode = 1;
});
