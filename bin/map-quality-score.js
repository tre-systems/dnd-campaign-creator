#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const { buildIntent, createRng } = require("../src/map/intent");
const {
  buildGraph,
  countEdgeDisjointPaths,
  findCycleCount,
} = require("../src/map/topology");
const { layoutConstructed } = require("../src/map/geometry");
const { routeCorridors } = require("../src/map/corridors");
const { applyDressing } = require("../src/map/dressing");
const { renderSvg } = require("../src/map/render-svg");
const {
  computeMetrics,
  aggregateMetrics,
  metricDelta,
  computeAlignmentScore,
  deriveRecommendations,
} = require("../src/map/style-audit");
const {
  analyzeMapGeometry,
  aggregateMapMetrics,
  evaluateQualityGate,
} = require("../src/map/quality-score");
const {
  createGatehouseSection,
  createDwarvenComplexSection,
  createSunkenSanctumSection,
  createClockworkArchiveSection,
} = require("../src/map/fixtures/gatehouse-ruin");

const DEFAULT_SPEC_PATH = path.resolve(
  "docs/map-review/paratime-style-spec.json",
);
const DEFAULT_REFERENCE_METRICS = path.resolve(
  "docs/map-review/reference-style-metrics.json",
);
const DEFAULT_SIZE = 512;

const QUALITY_SUITE = [
  {
    id: "gatehouse-seed13-strict",
    sectionFactory: createGatehouseSection,
    seed: 13,
  },
  {
    id: "gatehouse-seed42-strict",
    sectionFactory: createGatehouseSection,
    seed: 42,
  },
  {
    id: "gatehouse-seed77-strict",
    sectionFactory: createGatehouseSection,
    seed: 77,
  },
  {
    id: "dwarven-seed13-strict",
    sectionFactory: createDwarvenComplexSection,
    seed: 13,
  },
  {
    id: "dwarven-seed37-strict",
    sectionFactory: createDwarvenComplexSection,
    seed: 37,
  },
  {
    id: "dwarven-seed89-strict",
    sectionFactory: createDwarvenComplexSection,
    seed: 89,
  },
  {
    id: "sunken-sanctum-seed17-strict",
    sectionFactory: createSunkenSanctumSection,
    seed: 17,
  },
  {
    id: "sunken-sanctum-seed61-strict",
    sectionFactory: createSunkenSanctumSection,
    seed: 61,
  },
  {
    id: "sunken-sanctum-seed83-strict",
    sectionFactory: createSunkenSanctumSection,
    seed: 83,
  },
  {
    id: "clockwork-archive-seed29-strict",
    sectionFactory: createClockworkArchiveSection,
    seed: 29,
  },
  {
    id: "clockwork-archive-seed71-strict",
    sectionFactory: createClockworkArchiveSection,
    seed: 71,
  },
  {
    id: "clockwork-archive-seed97-strict",
    sectionFactory: createClockworkArchiveSection,
    seed: 97,
  },
];

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] === "gate" || args[0] === "score" ? args[0] : "score";

  const sizeArg = getArg(args, "--size", String(DEFAULT_SIZE));
  const size = Number.parseInt(sizeArg, 10);
  if (!Number.isFinite(size) || size < 128 || size > 2048) {
    throw new Error("--size must be an integer between 128 and 2048");
  }

  return {
    command,
    specPath: path.resolve(getArg(args, "--spec", DEFAULT_SPEC_PATH)),
    referenceMetricsPath: getArg(args, "--reference-metrics", null),
    jsonOut: getArg(args, "--json", null),
    markdownOut: getArg(args, "--markdown", null),
    size,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function resolveReferenceMetricsPath(specPath, rawReferenceMetricsPath) {
  if (path.isAbsolute(rawReferenceMetricsPath)) {
    return rawReferenceMetricsPath;
  }
  if (
    rawReferenceMetricsPath.startsWith("./") ||
    rawReferenceMetricsPath.startsWith("../")
  ) {
    return path.resolve(path.dirname(specPath), rawReferenceMetricsPath);
  }
  return path.resolve(rawReferenceMetricsPath);
}

async function maybeWriteFile(outputPath, content) {
  if (!outputPath) return null;
  const absPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, "utf8");
  return absPath;
}

function buildMap(sectionFactory, seed) {
  const section = sectionFactory();
  const graph = buildGraph(section.nodes, section.edges);
  const intent = buildIntent(section);
  const rng = createRng(seed);

  let geometry = layoutConstructed(
    graph,
    section.grid,
    section.density,
    section.connectors || [],
    50,
    rng,
  );
  geometry = routeCorridors(geometry, graph, rng, section.connectors || []);
  geometry = applyDressing(geometry, graph, rng);

  return { geometry, graph, intent };
}

async function renderStrictPng(geometry, graph, intent) {
  const svg = renderSvg(geometry, graph, intent, {
    cellSize: 20,
    showGrid: true,
    showLabels: true,
    showRockHatch: true,
    colorScheme: "blue",
    styleProfile: "blueprint-strict",
  });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function computeImageMetrics(buffer, size) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return computeMetrics(data, info.width, info.height, info.channels);
}

function toMarkdownReport(report) {
  const lines = [];
  lines.push("# Map Quality Report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Spec: ${report.specPath}`);
  lines.push(`- Reference metrics: ${report.referenceMetricsPath}`);
  lines.push(`- Suite maps: ${report.suite.mapCount}`);
  lines.push("");
  lines.push("## Scores");
  lines.push("");
  lines.push(`- Style: ${report.style.score.toFixed(1)} / 100`);
  lines.push(`- Content: ${report.gate.bucketScores.content.toFixed(1)} / 100`);
  lines.push(
    `- Semantics: ${report.gate.bucketScores.semantics.toFixed(1)} / 100`,
  );
  lines.push(
    `- Composite: ${report.gate.compositeScore.toFixed(1)} / 100 (min ${report.gate.minCompositeScore.toFixed(1)})`,
  );
  lines.push(`- Gate: ${report.gate.passed ? "PASS" : "FAIL"}`);
  lines.push("");

  if (report.gate.failures.length > 0) {
    lines.push("## Gate Failures");
    lines.push("");
    for (const failure of report.gate.failures) {
      lines.push(`- ${failure}`);
    }
    lines.push("");
  }

  lines.push("## Key Content Metrics");
  lines.push("");
  lines.push(
    `- Distinct feature tags: ${report.content.distinctFeatureTags.length}`,
  );
  lines.push(
    `- Non-rect room fraction: ${report.content.nonRectRoomFraction.toFixed(3)}`,
  );
  lines.push(
    `- Circle room fraction: ${report.content.circleRoomFraction.toFixed(3)}`,
  );
  lines.push(
    `- Cave room fraction: ${report.content.caveRoomFraction.toFixed(3)}`,
  );
  lines.push(`- Maps with caves: ${report.content.mapsWithCaves}`);
  lines.push(
    `- Avg distinct feature tags per map: ${report.content.averageFeatureTagCountPerMap.toFixed(3)}`,
  );
  lines.push("");

  lines.push("## Key Semantic Metrics");
  lines.push("");
  lines.push(
    `- Door validity ratio: ${report.semantics.doorValidityRatio.toFixed(3)}`,
  );
  lines.push(
    `- Entry transition coverage: ${report.semantics.entryTransitionCoverage.toFixed(3)}`,
  );
  lines.push(
    `- Exit transition coverage: ${report.semantics.exitTransitionCoverage.toFixed(3)}`,
  );
  lines.push(`- Loop coverage: ${report.semantics.loopCoverage.toFixed(3)}`);
  lines.push(
    `- Disjoint path coverage: ${report.semantics.disjointPathCoverage.toFixed(3)}`,
  );
  lines.push("");

  lines.push("## Style Recommendations");
  lines.push("");
  if (report.style.recommendations.length === 0) {
    lines.push("- No major style recommendations from metric deltas.");
  } else {
    for (const recommendation of report.style.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv);
  const spec = await readJson(args.specPath);
  const rawReferenceMetricsPath =
    args.referenceMetricsPath ||
    spec.referenceMetricsPath ||
    DEFAULT_REFERENCE_METRICS;
  const referenceMetricsPath = resolveReferenceMetricsPath(
    args.specPath,
    rawReferenceMetricsPath,
  );
  const referenceMetricsData = await readJson(referenceMetricsPath);
  const referenceMean =
    referenceMetricsData.referenceMean || referenceMetricsData;

  const sampleMetrics = [];
  const perMap = [];

  for (const item of QUALITY_SUITE) {
    const { geometry, graph, intent } = buildMap(
      item.sectionFactory,
      item.seed,
    );
    const png = await renderStrictPng(geometry, graph, intent);
    sampleMetrics.push(await computeImageMetrics(png, args.size));

    const entryId = (graph.nodes.find((node) => node.type === "entry") || {})
      .id;
    const exitId = (graph.nodes.find((node) => node.type === "exit") || {}).id;
    const topologyStats = {
      cycleCount: findCycleCount(graph),
      disjointPaths:
        entryId && exitId ? countEdgeDisjointPaths(graph, entryId, exitId) : 0,
    };

    perMap.push({
      id: item.id,
      seed: item.seed,
      ...analyzeMapGeometry(geometry, graph, topologyStats),
    });
  }

  const sampleMean = aggregateMetrics(sampleMetrics);
  const delta = metricDelta(sampleMean, referenceMean);
  const styleScore = computeAlignmentScore(delta);
  const styleRecommendations = deriveRecommendations(
    sampleMean,
    referenceMean,
    delta,
  );

  const aggregate = aggregateMapMetrics(perMap);
  const report = {
    generatedAt: new Date().toISOString(),
    specPath: args.specPath,
    referenceMetricsPath,
    suite: {
      mapCount: QUALITY_SUITE.length,
      maps: QUALITY_SUITE.map((item) => ({ id: item.id, seed: item.seed })),
    },
    style: {
      score: styleScore,
      sampleMean,
      referenceMean,
      delta,
      recommendations: styleRecommendations,
    },
    content: {
      distinctFeatureTags: aggregate.distinctFeatureTags,
      shapeCounts: aggregate.shapeCounts,
      roomCount: aggregate.roomCount,
      nonRectRoomFraction: aggregate.nonRectRoomFraction,
      circleRoomFraction: aggregate.circleRoomFraction,
      caveRoomFraction: aggregate.caveRoomFraction,
      mapsWithCaves: aggregate.mapsWithCaves,
      averageFeatureTagCountPerMap: aggregate.averageFeatureTagCountPerMap,
      featureCounts: aggregate.featureCounts,
    },
    semantics: {
      doorValidityRatio: aggregate.doorValidityRatio,
      entryTransitionCoverage: aggregate.entryTransitionCoverage,
      exitTransitionCoverage: aggregate.exitTransitionCoverage,
      loopCoverage: aggregate.loopCoverage,
      disjointPathCoverage: aggregate.disjointPathCoverage,
      edgeSymbolCoverage: aggregate.edgeSymbolCoverage,
      edgeTypeCoverage: aggregate.edgeTypeCoverage,
    },
    maps: perMap,
  };

  const gate = evaluateQualityGate(report, spec);
  report.gate = gate;

  console.log("Map Quality Score");
  console.log(`- Suite maps: ${report.suite.mapCount}`);
  console.log(`- Style score: ${report.style.score.toFixed(1)} / 100`);
  console.log(`- Content score: ${gate.bucketScores.content.toFixed(1)} / 100`);
  console.log(
    `- Semantics score: ${gate.bucketScores.semantics.toFixed(1)} / 100`,
  );
  console.log(
    `- Composite score: ${gate.compositeScore.toFixed(1)} / 100 (min ${gate.minCompositeScore.toFixed(1)})`,
  );
  console.log(`- Gate result: ${gate.passed ? "PASS" : "FAIL"}`);

  console.log(
    `\nContent highlights: features=${report.content.distinctFeatureTags.length}, nonRect=${report.content.nonRectRoomFraction.toFixed(3)}, cave=${report.content.caveRoomFraction.toFixed(3)}`,
  );
  console.log(
    `Semantics highlights: doorValidity=${report.semantics.doorValidityRatio.toFixed(3)}, entryTransition=${report.semantics.entryTransitionCoverage.toFixed(3)}, loopCoverage=${report.semantics.loopCoverage.toFixed(3)}`,
  );

  if (gate.failures.length > 0) {
    console.log("\nGate failures:");
    for (const failure of gate.failures) {
      console.log(`- ${failure}`);
    }
  }

  if (args.jsonOut) {
    const out = await maybeWriteFile(
      args.jsonOut,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(`\nWrote JSON report to ${out}`);
  }

  if (args.markdownOut) {
    const out = await maybeWriteFile(
      args.markdownOut,
      toMarkdownReport(report),
    );
    console.log(`Wrote Markdown report to ${out}`);
  }

  if (args.command === "gate" && !gate.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`map:quality:score failed: ${error.message}`);
  process.exit(1);
});
