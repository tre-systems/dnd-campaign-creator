#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { trainMapIrProposalModel } = require("../src/map/map-ir-proposal-model");

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
    "  node bin/map-ir-train.js --input-dir <map-ir-dir> --out <model.json> [--limit <n>]",
  );
}

async function listMapIrFiles(inputDir) {
  const entries = await fs.readdir(path.resolve(inputDir));
  return entries
    .filter((name) => name.endsWith(".map-ir.json"))
    .sort()
    .map((name) => path.join(path.resolve(inputDir), name));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const inputDir = getArg(args, "--input-dir", null);
  const outPath = getArg(args, "--out", null);
  const limit = parseIntArg(args, "--limit", null);

  if (!inputDir) {
    throw new Error("--input-dir is required");
  }
  if (!outPath) {
    throw new Error("--out is required");
  }
  if (limit !== null && limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  const files = await listMapIrFiles(inputDir);
  if (files.length === 0) {
    throw new Error(
      `no .map-ir.json files found under ${path.resolve(inputDir)}`,
    );
  }

  const selected = limit ? files.slice(0, limit) : files;
  const mapIrs = [];

  for (const filePath of selected) {
    const payload = await fs.readFile(filePath, "utf8");
    mapIrs.push(JSON.parse(payload));
  }

  const model = trainMapIrProposalModel(mapIrs, {
    sourceDir: path.resolve(inputDir),
  });

  const modelOut = await writeTextFile(
    outPath,
    `${JSON.stringify(model, null, 2)}\n`,
  );

  console.log(`Trained proposal model from ${selected.length} maps.`);
  console.log(`Wrote model to ${modelOut}`);
  console.log(
    `Dimensions: widths=${model.dimensions.width.values.join(",")} heights=${model.dimensions.height.values.join(",")}`,
  );
  console.log(
    `Floor ratio target: ${model.metrics.floorCellRatio.mean.toFixed(3)} ± ${model.metrics.floorCellRatio.stdDev.toFixed(3)}`,
  );
  console.log(
    `Generator priors: roomMin=${model.generatorPriors.roomMinSize} roomMax=${model.generatorPriors.roomMaxSize} roomCount≈${model.generatorPriors.roomCountMean.toFixed(1)}`,
  );
}

main().catch((error) => {
  console.error(`map-ir-train failed: ${error.message}`);
  process.exitCode = 1;
});
