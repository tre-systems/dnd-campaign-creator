#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");

const { buildIntent, createRng } = require("../src/map/intent");
const { buildGraph } = require("../src/map/topology");
const { layoutConstructed } = require("../src/map/geometry");
const { routeCorridors } = require("../src/map/corridors");
const { applyDressing } = require("../src/map/dressing");
const { renderSvg } = require("../src/map/render-svg");
const {
  createGatehouseSection,
  createDwarvenComplexSection,
  createSunkenSanctumSection,
  createClockworkArchiveSection,
} = require("../src/map/fixtures/gatehouse-ruin");

const SNAPSHOT_DIR = path.resolve("docs/map-review/snapshots");

const SNAPSHOTS = [
  {
    id: "gatehouse-seed13-strict",
    sectionFactory: createGatehouseSection,
    seed: 13,
    maxMismatchPct: 0.25,
    maxMeanChannelDelta: 1.2,
  },
  {
    id: "gatehouse-seed42-strict",
    sectionFactory: createGatehouseSection,
    seed: 42,
    maxMismatchPct: 0.25,
    maxMeanChannelDelta: 1.2,
  },
  {
    id: "dwarven-seed13-strict",
    sectionFactory: createDwarvenComplexSection,
    seed: 13,
    maxMismatchPct: 0.25,
    maxMeanChannelDelta: 1.2,
  },
  {
    id: "sunken-sanctum-seed17-strict",
    sectionFactory: createSunkenSanctumSection,
    seed: 17,
    maxMismatchPct: 0.25,
    maxMeanChannelDelta: 1.2,
  },
  {
    id: "clockwork-archive-seed29-strict",
    sectionFactory: createClockworkArchiveSection,
    seed: 29,
    maxMismatchPct: 0.25,
    maxMeanChannelDelta: 1.2,
  },
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || "check";
  const outFlag = args.indexOf("--out");
  const outDir = outFlag !== -1 && args[outFlag + 1] ? args[outFlag + 1] : null;
  return {
    command,
    outDir: outDir ? path.resolve(outDir) : SNAPSHOT_DIR,
  };
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

async function renderSnapshot(def) {
  const { geometry, graph, intent } = buildMap(def.sectionFactory, def.seed);
  const svg = renderSvg(geometry, graph, intent, {
    cellSize: 20,
    showGrid: true,
    showLabels: true,
    showRockHatch: true,
    colorScheme: "blue",
    styleProfile: "blueprint-strict",
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { svg, png };
}

async function rawImage(buffer) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function compareRawImages(actualRaw, expectedRaw) {
  const actual = actualRaw.data;
  const expected = expectedRaw.data;
  const { width, height, channels } = actualRaw.info;
  const totalPixels = width * height;

  let mismatchPixels = 0;
  let totalChannelDelta = 0;

  for (let i = 0; i < actual.length; i += channels) {
    const dr = Math.abs(actual[i] - expected[i]);
    const dg = Math.abs(actual[i + 1] - expected[i + 1]);
    const db = Math.abs(actual[i + 2] - expected[i + 2]);
    const da = Math.abs(actual[i + 3] - expected[i + 3]);
    const delta = (dr + dg + db + da) / 4;

    totalChannelDelta += delta;
    if (delta > 16) mismatchPixels++;
  }

  return {
    mismatchPct: (mismatchPixels / totalPixels) * 100,
    meanChannelDelta: totalChannelDelta / totalPixels,
    width,
    height,
  };
}

async function writeDiffImage(actualBuffer, expectedBuffer, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await sharp(actualBuffer)
    .composite([{ input: expectedBuffer, blend: "difference" }])
    .png()
    .toFile(targetPath);
}

async function updateSnapshots(outDir) {
  await fs.mkdir(outDir, { recursive: true });

  const metadata = {
    generatedAt: new Date().toISOString(),
    profile: "blueprint-strict",
    cellSize: 20,
    snapshots: [],
  };

  for (const def of SNAPSHOTS) {
    const rendered = await renderSnapshot(def);
    const svgPath = path.join(outDir, `${def.id}.svg`);
    const pngPath = path.join(outDir, `${def.id}.png`);

    await fs.writeFile(svgPath, rendered.svg, "utf8");
    await fs.writeFile(pngPath, rendered.png);

    metadata.snapshots.push({
      id: def.id,
      seed: def.seed,
      svg: path.basename(svgPath),
      png: path.basename(pngPath),
      maxMismatchPct: def.maxMismatchPct,
      maxMeanChannelDelta: def.maxMeanChannelDelta,
    });

    console.log(`Updated snapshot: ${def.id}`);
  }

  await fs.writeFile(
    path.join(outDir, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nSnapshots written to ${outDir}`);
}

async function checkSnapshots(outDir) {
  const failures = [];

  for (const def of SNAPSHOTS) {
    const expectedPath = path.join(outDir, `${def.id}.png`);
    let expected;
    try {
      expected = await fs.readFile(expectedPath);
    } catch (error) {
      failures.push(`${def.id}: missing baseline ${expectedPath}`);
      continue;
    }

    const rendered = await renderSnapshot(def);
    const [expectedRaw, actualRaw] = await Promise.all([
      rawImage(expected),
      rawImage(rendered.png),
    ]);

    if (
      expectedRaw.info.width !== actualRaw.info.width ||
      expectedRaw.info.height !== actualRaw.info.height
    ) {
      failures.push(
        `${def.id}: dimension mismatch expected ${expectedRaw.info.width}x${expectedRaw.info.height}, got ${actualRaw.info.width}x${actualRaw.info.height}`,
      );
      continue;
    }

    const metrics = compareRawImages(actualRaw, expectedRaw);
    const exceeds =
      metrics.mismatchPct > def.maxMismatchPct ||
      metrics.meanChannelDelta > def.maxMeanChannelDelta;

    if (exceeds) {
      const diffPath = path.join(
        os.tmpdir(),
        "dnd-map-quality",
        `${def.id}-diff.png`,
      );
      await writeDiffImage(rendered.png, expected, diffPath);
      failures.push(
        `${def.id}: mismatch ${metrics.mismatchPct.toFixed(3)}% (max ${def.maxMismatchPct}%), mean delta ${metrics.meanChannelDelta.toFixed(3)} (max ${def.maxMeanChannelDelta}). Diff: ${diffPath}`,
      );
    } else {
      console.log(
        `PASS ${def.id}: mismatch ${metrics.mismatchPct.toFixed(3)}%, mean delta ${metrics.meanChannelDelta.toFixed(3)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("\nSnapshot quality check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nAll map snapshots are within quality thresholds.");
}

async function main() {
  const { command, outDir } = parseArgs(process.argv);

  if (command === "update") {
    await updateSnapshots(outDir);
    return;
  }
  if (command === "check") {
    await checkSnapshots(outDir);
    return;
  }

  console.error("Usage: node bin/map-quality.js [check|update] [--out <dir>]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
