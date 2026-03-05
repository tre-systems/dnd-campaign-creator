#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const { extractMapIrFromImage } = require("../src/map/map-ir-extractor");
const { renderMapIrSvg } = require("../src/map/render-map-ir-svg");
const {
  METRIC_KEYS,
  computeMetrics,
  metricDelta,
  computeAlignmentScore,
  evaluateAlignmentGate,
} = require("../src/map/style-audit");

const DEFAULT_REFERENCE_METRICS = path.resolve(
  "docs/map-review/reference-style-metrics.json",
);
const DEFAULT_REFERENCE_DIR = path.resolve(
  "docs/map-review/references/paratime",
);
const DEFAULT_REPORT_PATH = path.resolve(
  "docs/map-review/map-ir/benchmark-report.json",
);

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return fallback;
  }
  return args[idx + 1];
}

function parseFiniteArg(args, flag, fallback = null) {
  const raw = getArg(args, flag, null);
  if (raw === null || raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return value;
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

function parseMaxAbsDeltaGate(argValue) {
  if (!argValue) {
    return {
      luminanceMean: 0.12,
      saturationMean: 0.08,
      inkCoverage: 0.08,
      orthogonalEdgeRatio: 0.16,
    };
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

async function listImageFiles(dirPath) {
  const entries = await fs.readdir(path.resolve(dirPath));
  return entries
    .filter((name) => /\.(png|jpe?g|webp|svg)$/i.test(name))
    .sort()
    .map((name) => path.join(path.resolve(dirPath), name));
}

async function loadReferenceMetrics(referenceMetricsPath) {
  const absPath = path.resolve(referenceMetricsPath);
  const parsed = JSON.parse(await fs.readFile(absPath, "utf8"));
  const referenceMean = parsed.referenceMean || parsed;

  for (const key of METRIC_KEYS) {
    if (!Number.isFinite(referenceMean[key])) {
      throw new Error(`referenceMean.${key} must be a finite number`);
    }
  }

  return {
    referenceMean,
    source: absPath,
  };
}

async function computeSvgMetrics(svg, size) {
  const { data, info } = await sharp(Buffer.from(svg))
    .png()
    .flatten({ background: "#ffffff" })
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return computeMetrics(data, info.width, info.height, info.channels);
}

function structuralUsability(result, options) {
  const width = result.mapIr.meta.width;
  const height = result.mapIr.meta.height;
  const floorRects = result.mapIr.floors.length;
  const wallSegments = result.mapIr.walls.length;
  const ratio = result.diagnostics.floorCellRatio;

  const minGridWidth = Number.isFinite(options.minGridWidth)
    ? options.minGridWidth
    : 8;
  const minGridHeight = Number.isFinite(options.minGridHeight)
    ? options.minGridHeight
    : 8;
  const minFloorRatio = Number.isFinite(options.minFloorRatio)
    ? options.minFloorRatio
    : 0.08;
  const maxFloorRatio = Number.isFinite(options.maxFloorRatio)
    ? options.maxFloorRatio
    : 0.85;

  const checks = {
    minGridWidth: width >= minGridWidth,
    minGridHeight: height >= minGridHeight,
    floorRects: floorRects > 0,
    wallSegments: wallSegments > 0,
    floorRatioRange: ratio >= minFloorRatio && ratio <= maxFloorRatio,
  };

  const passed = Object.values(checks).every(Boolean);

  return {
    passed,
    checks,
    thresholds: {
      minGridWidth,
      minGridHeight,
      minFloorRatio,
      maxFloorRatio,
    },
  };
}

async function writeJson(outPath, payload) {
  const absPath = path.resolve(outPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absPath;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage:");
    console.log(
      "  node bin/map-ir-benchmark.js --references <dir> [--report <json>] [--reference-metrics <json>] [--max-maps <n>] [--min-score <n>] [--max-abs-delta metric=limit,...]",
    );
    process.exit(0);
  }

  const referencesDir = path.resolve(
    getArg(args, "--references", DEFAULT_REFERENCE_DIR),
  );
  const reportPath = path.resolve(
    getArg(args, "--report", DEFAULT_REPORT_PATH),
  );
  const referenceMetricsPath = path.resolve(
    getArg(args, "--reference-metrics", DEFAULT_REFERENCE_METRICS),
  );

  const maxMaps = parseIntArg(args, "--max-maps", null);
  if (maxMaps !== null && maxMaps <= 0) {
    throw new Error("--max-maps must be a positive integer");
  }

  const minScore = parseFiniteArg(args, "--min-score", 45);
  const maxAbsDelta = parseMaxAbsDeltaGate(
    getArg(args, "--max-abs-delta", null),
  );

  const extractOptions = {
    cellSizeFt: parseFiniteArg(args, "--cell-size-ft", 10),
    minGridPx: parseIntArg(args, "--min-grid-px", 8),
    maxGridPx: parseIntArg(args, "--max-grid-px", 80),
    floorLuminanceThreshold: parseFiniteArg(
      args,
      "--floor-luma-threshold",
      null,
    ),
    floorCellRatioThreshold: parseFiniteArg(
      args,
      "--floor-cell-threshold",
      0.38,
    ),
    maxCells: parseIntArg(args, "--max-cells", 128),
    maxSize: parseIntArg(args, "--max-size", 1600),
  };

  const metricSize = parseIntArg(args, "--metric-size", 512);
  const renderCellSize = parseFiniteArg(args, "--render-cell-size", 20);

  const usabilityOptions = {
    minGridWidth: parseIntArg(args, "--min-grid-width", 8),
    minGridHeight: parseIntArg(args, "--min-grid-height", 8),
    minFloorRatio: parseFiniteArg(args, "--min-floor-ratio", 0.08),
    maxFloorRatio: parseFiniteArg(args, "--max-floor-ratio", 0.85),
  };

  const images = await listImageFiles(referencesDir);
  if (images.length === 0) {
    throw new Error(`no image files found under ${referencesDir}`);
  }

  const selected = maxMaps ? images.slice(0, maxMaps) : images;
  const { referenceMean, source: referenceSource } =
    await loadReferenceMetrics(referenceMetricsPath);

  const rows = [];
  let stylePassCount = 0;
  let usablePassCount = 0;
  let totalStyleScore = 0;

  for (const [index, imagePath] of selected.entries()) {
    const stem = path.basename(imagePath, path.extname(imagePath));

    const extraction = await extractMapIrFromImage(imagePath, {
      ...extractOptions,
      title: stem,
    });

    const svg = renderMapIrSvg(extraction.mapIr, {
      cellSize: renderCellSize,
    });

    const metrics = await computeSvgMetrics(svg, metricSize);
    const delta = metricDelta(metrics, referenceMean);
    const styleScore = computeAlignmentScore(delta);
    const styleFailures = evaluateAlignmentGate(styleScore, delta, {
      minScore,
      maxAbsDelta,
    });

    const stylePassed = styleFailures.length === 0;
    if (stylePassed) {
      stylePassCount++;
    }

    const usability = structuralUsability(extraction, usabilityOptions);
    if (usability.passed) {
      usablePassCount++;
    }

    totalStyleScore += styleScore;

    const row = {
      id: stem,
      sourceImage: imagePath,
      map: {
        width: extraction.mapIr.meta.width,
        height: extraction.mapIr.meta.height,
        floorRects: extraction.mapIr.floors.length,
        wallSegments: extraction.mapIr.walls.length,
        thresholds: extraction.mapIr.thresholds.length,
        labels: extraction.mapIr.labels.length,
      },
      diagnostics: extraction.diagnostics,
      style: {
        score: styleScore,
        passed: stylePassed,
        failures: styleFailures,
        delta,
      },
      usability,
    };

    rows.push(row);

    console.log(
      `[${index + 1}/${selected.length}] ${stem} style=${styleScore.toFixed(1)} ${stylePassed ? "PASS" : "FAIL"} usable=${usability.passed ? "PASS" : "FAIL"}`,
    );
  }

  const mapCount = rows.length;
  const stylePassRate = mapCount > 0 ? stylePassCount / mapCount : 0;
  const usablePassRate = mapCount > 0 ? usablePassCount / mapCount : 0;

  const payload = {
    generatedAt: new Date().toISOString(),
    referencesDir,
    mapCount,
    referenceMetricsPath: referenceSource,
    gate: {
      minScore,
      maxAbsDelta,
    },
    summary: {
      stylePassCount,
      stylePassRate,
      usablePassCount,
      usablePassRate,
      averageStyleScore: mapCount > 0 ? totalStyleScore / mapCount : 0,
    },
    rows,
  };

  const written = await writeJson(reportPath, payload);
  console.log(`Wrote benchmark report to ${written}`);
  console.log(
    `Style pass rate: ${stylePassCount}/${mapCount} (${formatPct(stylePassRate)})`,
  );
  console.log(
    `Usability pass rate: ${usablePassCount}/${mapCount} (${formatPct(usablePassRate)})`,
  );
  console.log(
    `Average style score: ${payload.summary.averageStyleScore.toFixed(1)} / 100`,
  );
}

main().catch((error) => {
  console.error(`map-ir-benchmark failed: ${error.message}`);
  process.exitCode = 1;
});
