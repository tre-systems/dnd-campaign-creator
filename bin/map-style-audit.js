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
  evaluateAlignmentGate,
  computeAlignmentScore,
  deriveRecommendations,
} = require("../src/map/style-audit");

const DEFAULT_REFERENCE_DIR = path.resolve(
  "docs/map-review/references/paratime",
);
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

function parseScoreGate(scoreArg) {
  if (scoreArg === null || scoreArg === undefined) {
    return null;
  }
  const value = Number.parseFloat(scoreArg);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("--min-score must be a number between 0 and 100");
  }
  return value;
}

function parseMaxAbsDeltaGate(argValue) {
  if (!argValue) {
    return {};
  }

  const limits = {};
  const pairs = argValue.split(",");
  for (const pair of pairs) {
    const token = pair.trim();
    if (!token) continue;
    const [rawMetric, rawLimit] = token.split("=");
    const metric = rawMetric ? rawMetric.trim() : "";
    if (!metric || !rawLimit) {
      throw new Error(
        "--max-abs-delta format must be metric=value[,metric=value...]",
      );
    }
    if (!METRIC_KEYS.includes(metric)) {
      throw new Error(
        `--max-abs-delta uses unknown metric "${metric}". Known metrics: ${METRIC_KEYS.join(", ")}`,
      );
    }
    const limit = Number.parseFloat(rawLimit.trim());
    if (!Number.isFinite(limit) || limit < 0) {
      throw new Error(
        `--max-abs-delta.${metric} must be a non-negative number`,
      );
    }
    limits[metric] = limit;
  }
  return limits;
}

function assertMetricsObject(metrics, contextLabel) {
  if (!metrics || typeof metrics !== "object") {
    throw new Error(`${contextLabel} must be an object`);
  }
  for (const key of METRIC_KEYS) {
    if (!Number.isFinite(metrics[key])) {
      throw new Error(`${contextLabel}.${key} must be a finite number`);
    }
  }
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

async function loadReferenceMetrics(referenceMetricsPath) {
  const absPath = path.resolve(referenceMetricsPath);
  const parsed = JSON.parse(await fs.readFile(absPath, "utf8"));
  const referenceMean = parsed.referenceMean || parsed;
  assertMetricsObject(referenceMean, "reference metrics");

  const referenceCount = Number.isFinite(parsed.referenceCount)
    ? parsed.referenceCount
    : null;
  const normalizedSize = Number.isFinite(parsed.normalizedSize)
    ? parsed.normalizedSize
    : null;
  const referenceSource =
    typeof parsed.referenceSource === "string" ? parsed.referenceSource : null;

  return {
    referenceMean,
    referenceCount,
    normalizedSize,
    referenceSource,
    referenceMetricsPath: absPath,
  };
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

async function maybeWriteReferenceMetricsFile(
  outputPath,
  referenceMean,
  referenceCount,
  normalizedSize,
  referenceSource,
) {
  if (!outputPath) return;
  const outPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        referenceSource,
        referenceCount,
        normalizedSize,
        referenceMean,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Wrote reference metrics baseline to ${outPath}`);
}

function formatGateFailure(failure) {
  if (failure.type === "minScore") {
    return `alignment score ${failure.actual.toFixed(1)} is below required minimum ${failure.expected.toFixed(1)}`;
  }
  if (failure.type === "maxAbsDelta") {
    return `|delta.${failure.metric}| ${failure.actual.toFixed(3)} exceeds max ${failure.expected.toFixed(3)} (signed delta ${failure.signedDelta.toFixed(3)})`;
  }
  return JSON.stringify(failure);
}

async function main() {
  const args = process.argv.slice(2);
  const referencesDir = path.resolve(
    getArg(args, "--references", DEFAULT_REFERENCE_DIR),
  );
  const snapshotsDir = path.resolve(
    getArg(args, "--samples", DEFAULT_SNAPSHOT_DIR),
  );
  const referenceMetricsPath = getArg(args, "--reference-metrics", null);
  const writeReferenceMetricsPath = getArg(
    args,
    "--write-reference-metrics",
    null,
  );
  const minScore = parseScoreGate(getArg(args, "--min-score", null));
  const maxAbsDelta = parseMaxAbsDeltaGate(
    getArg(args, "--max-abs-delta", null),
  );
  const sizeArg = getArg(args, "--size", String(DEFAULT_SIZE));
  const jsonPath = getArg(args, "--json", null);
  const size = Number.parseInt(sizeArg, 10);

  if (!Number.isFinite(size) || size < 128 || size > 2048) {
    throw new Error("--size must be an integer between 128 and 2048");
  }

  const hasSnapshots = await existsDir(snapshotsDir);
  if (!hasSnapshots) {
    throw new Error(`Snapshot directory not found: ${snapshotsDir}`);
  }

  const sampleImages = await listSnapshotImages(snapshotsDir);

  if (sampleImages.length === 0) {
    throw new Error(
      `No sample snapshot images found in ${snapshotsDir}. Run map:snapshots:update first.`,
    );
  }

  let referenceImages = [];
  let referenceMean;
  let referenceCount = null;
  let referenceSource = null;
  let effectiveReferenceMetricsPath = null;

  if (referenceMetricsPath) {
    const loaded = await loadReferenceMetrics(referenceMetricsPath);
    referenceMean = loaded.referenceMean;
    referenceCount = loaded.referenceCount;
    referenceSource = loaded.referenceSource;
    effectiveReferenceMetricsPath = loaded.referenceMetricsPath;
    if (
      loaded.normalizedSize !== null &&
      Number.isFinite(loaded.normalizedSize) &&
      loaded.normalizedSize !== size
    ) {
      console.warn(
        `Warning: reference metrics normalized size ${loaded.normalizedSize} differs from requested --size ${size}.`,
      );
    }
  } else {
    const hasReferences = await existsDir(referencesDir);
    if (!hasReferences) {
      throw new Error(
        `Reference directory not found: ${referencesDir}. Download references first or use --reference-metrics.`,
      );
    }

    referenceImages = await listReferenceImages(referencesDir);
    if (referenceImages.length === 0) {
      throw new Error(
        `No reference images found in ${referencesDir}. Expected .png/.jpg/.webp files.`,
      );
    }

    const referenceMetrics = await Promise.all(
      referenceImages.map((p) => readMetricsForImage(p, size)),
    );
    referenceMean = aggregateMetrics(referenceMetrics);
    referenceCount = referenceImages.length;
    referenceSource = path.relative(process.cwd(), referencesDir) || referencesDir;
  }

  const sampleMetrics = await Promise.all(
    sampleImages.map((p) => readMetricsForImage(p, size)),
  );

  const sampleMean = aggregateMetrics(sampleMetrics);
  const delta = metricDelta(sampleMean, referenceMean);
  const score = computeAlignmentScore(delta);
  const recommendations = deriveRecommendations(
    sampleMean,
    referenceMean,
    delta,
  );

  console.log("Map Style Audit");
  if (referenceImages.length > 0) {
    console.log(`- References: ${referenceImages.length} (${referencesDir})`);
  } else {
    const referenceCountLabel =
      referenceCount === null ? "unknown" : String(referenceCount);
    console.log(
      `- Reference metrics: ${referenceCountLabel} (${effectiveReferenceMetricsPath})`,
    );
    if (referenceSource) {
      console.log(`- Reference source label: ${referenceSource}`);
    }
  }
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

  await maybeWriteReferenceMetricsFile(
    writeReferenceMetricsPath,
    referenceMean,
    referenceCount,
    size,
    referenceSource || path.relative(process.cwd(), referencesDir) || referencesDir,
  );

  await maybeWriteJson(jsonPath, {
    generatedAt: new Date().toISOString(),
    referencesDir,
    snapshotsDir,
    referenceMetricsPath: effectiveReferenceMetricsPath,
    referenceSource,
    normalizedSize: size,
    referenceCount: referenceCount ?? referenceImages.length,
    sampleCount: sampleImages.length,
    referenceImages,
    sampleImages,
    referenceMean,
    sampleMean,
    delta,
    styleAlignmentScore: score,
    recommendations,
  });

  if (minScore !== null || Object.keys(maxAbsDelta).length > 0) {
    const gateFailures = evaluateAlignmentGate(score, delta, {
      minScore,
      maxAbsDelta,
    });

    if (gateFailures.length > 0) {
      const details = gateFailures
        .map((failure) => `- ${formatGateFailure(failure)}`)
        .join("\n");
      throw new Error(`style alignment gate failed:\n${details}`);
    }

    console.log(
      `\nStyle gate passed${minScore !== null ? ` (min-score ${minScore.toFixed(1)})` : ""}.`,
    );
  }
}

main().catch((error) => {
  console.error(`map:style:audit failed: ${error.message}`);
  process.exit(1);
});
