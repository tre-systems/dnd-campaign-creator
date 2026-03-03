#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const {
  METRIC_KEYS,
  computeMetrics,
  aggregateMetrics,
  metricDelta,
  computeAlignmentScore,
  deriveRecommendations,
} = require("../src/map/style-audit");

const DEFAULT_REFERENCE_DIR = path.resolve("docs/map-review/references/paratime");
const DEFAULT_SNAPSHOT_DIR = path.resolve("docs/map-review/snapshots");
const DEFAULT_SIZE = 512;

const LABELS = {
  luminanceMean: "Luminance Mean",
  luminanceStd: "Luminance Std",
  saturationMean: "Saturation Mean",
  blueCast: "Blue Cast",
  inkCoverage: "Ink Coverage",
  edgeDensity: "Edge Density",
  orthogonalEdgeRatio: "Orthogonal Edge Ratio",
  textureDensity: "Texture Density",
};

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return fallback;
  }
  return args[idx + 1];
}

async function existsDir(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function listReferenceImages(refDir) {
  const entries = await fs.readdir(refDir);
  return entries
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .map((name) => path.join(refDir, name))
    .sort();
}

async function listSnapshotImages(snapshotDir) {
  const metadataPath = path.join(snapshotDir, "metadata.json");
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    if (Array.isArray(metadata.snapshots)) {
      return metadata.snapshots
        .map((item) => item && item.png)
        .filter((name) => typeof name === "string")
        .map((name) => path.join(snapshotDir, name));
    }
  } catch {
    // Fall back to scanning directory directly.
  }

  const entries = await fs.readdir(snapshotDir);
  return entries
    .filter((name) => /-strict\.png$/i.test(name))
    .map((name) => path.join(snapshotDir, name))
    .sort();
}

async function readMetricsForImage(imagePath, size) {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const metrics = computeMetrics(data, info.width, info.height, info.channels);
  return metrics;
}

function formatNumber(value) {
  return value.toFixed(3).padStart(9, " ");
}

function printMetricTable(sampleMean, referenceMean, delta) {
  console.log("\nMetric                    Sample      Ref      Delta");
  console.log("-------------------------------------------------------");
  for (const key of METRIC_KEYS) {
    const label = (LABELS[key] || key).padEnd(24, " ");
    console.log(
      `${label}${formatNumber(sampleMean[key])}${formatNumber(referenceMean[key])}${formatNumber(delta[key])}`,
    );
  }
}

async function maybeWriteJson(jsonPath, report) {
  if (!jsonPath) return;
  const outPath = path.resolve(jsonPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nWrote style audit report to ${outPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const referencesDir = path.resolve(
    getArg(args, "--references", DEFAULT_REFERENCE_DIR),
  );
  const snapshotsDir = path.resolve(
    getArg(args, "--samples", DEFAULT_SNAPSHOT_DIR),
  );
  const sizeArg = getArg(args, "--size", String(DEFAULT_SIZE));
  const jsonPath = getArg(args, "--json", null);
  const size = Number.parseInt(sizeArg, 10);

  if (!Number.isFinite(size) || size < 128 || size > 2048) {
    throw new Error("--size must be an integer between 128 and 2048");
  }

  const [hasReferences, hasSnapshots] = await Promise.all([
    existsDir(referencesDir),
    existsDir(snapshotsDir),
  ]);

  if (!hasReferences) {
    throw new Error(
      `Reference directory not found: ${referencesDir}. Download references first.`,
    );
  }
  if (!hasSnapshots) {
    throw new Error(`Snapshot directory not found: ${snapshotsDir}`);
  }

  const [referenceImages, sampleImages] = await Promise.all([
    listReferenceImages(referencesDir),
    listSnapshotImages(snapshotsDir),
  ]);

  if (referenceImages.length === 0) {
    throw new Error(
      `No reference images found in ${referencesDir}. Expected .png/.jpg/.webp files.`,
    );
  }
  if (sampleImages.length === 0) {
    throw new Error(
      `No sample snapshot images found in ${snapshotsDir}. Run map:snapshots:update first.`,
    );
  }

  const referenceMetrics = await Promise.all(
    referenceImages.map((p) => readMetricsForImage(p, size)),
  );
  const sampleMetrics = await Promise.all(
    sampleImages.map((p) => readMetricsForImage(p, size)),
  );

  const referenceMean = aggregateMetrics(referenceMetrics);
  const sampleMean = aggregateMetrics(sampleMetrics);
  const delta = metricDelta(sampleMean, referenceMean);
  const score = computeAlignmentScore(delta);
  const recommendations = deriveRecommendations(sampleMean, referenceMean, delta);

  console.log("Map Style Audit");
  console.log(`- References: ${referenceImages.length} (${referencesDir})`);
  console.log(`- Samples: ${sampleImages.length} (${snapshotsDir})`);
  console.log(`- Normalized resolution: ${size}x${size}`);

  printMetricTable(sampleMean, referenceMean, delta);

  console.log(`\nStyle alignment score: ${score.toFixed(1)} / 100`);

  if (recommendations.length > 0) {
    console.log("\nPriority recommendations:");
    for (const note of recommendations) {
      console.log(`- ${note}`);
    }
  } else {
    console.log(
      "\nNo major style-metric gaps detected. Continue targeted visual review for composition and symbol semantics.",
    );
  }

  await maybeWriteJson(jsonPath, {
    generatedAt: new Date().toISOString(),
    referencesDir,
    snapshotsDir,
    normalizedSize: size,
    referenceCount: referenceImages.length,
    sampleCount: sampleImages.length,
    referenceImages,
    sampleImages,
    referenceMean,
    sampleMean,
    delta,
    styleAlignmentScore: score,
    recommendations,
  });
}

main().catch((error) => {
  console.error(`map:style:audit failed: ${error.message}`);
  process.exit(1);
});

