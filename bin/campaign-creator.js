#!/usr/bin/env node
/**
 * D&D Campaign Creator Tool
 *
 * Automates publishing of markdown-based adventures to Google Docs
 * by combining files, styling D&D 5E formats, and syncing images to Google Drive.
 *
 * Usage:
 *   npx campaign-creator publish <adventure-key> --config ./campaign.json
 */

const fs = require("fs").promises;
const path = require("path");
const { google } = require("googleapis");
const { marked } = require("marked");

const { loadConfig } = require("../src/config");
const { authorize } = require("../src/auth");
const {
  getMarkdownFiles,
  createOrUpdateDoc,
  listDocs,
  getDocContent,
} = require("../src/document-manager");
const {
  processImagesAndUpload,
  syncAdventureAssets,
} = require("../src/image-manager");

// Google Docs API scopes
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];

const PAGE_BREAK = "\n\n";
const THEMATIC_BREAK = "\n\n";

/**
 * Get priority for a file path to determine sort order.
 */
function getFilePriority(adventureConfig, relativePath) {
  const order = adventureConfig.order || {};
  const allFiles = Object.values(order).flat();

  const index = allFiles.findIndex((pattern) => {
    return relativePath === pattern || relativePath.endsWith("/" + pattern);
  });

  return index >= 0 ? index : 999;
}

/**
 * Generate a title page.
 */
function generateTitlePage(adventureConfig) {
  if (adventureConfig.titlePageTemplate) {
    return adventureConfig.titlePageTemplate + "\n\n";
  }
  return `# ${adventureConfig.title}\n\n`;
}

/**
 * Combine all adventure files into a single document.
 */
async function combineAdventureFiles(
  adventureDir,
  adventureConfig,
  forPublishing = true,
) {
  const mdFiles = await getMarkdownFiles(adventureDir);
  const order = adventureConfig.order || {};

  // Sort files by priority
  const sortedFiles = mdFiles
    .map((file) => ({
      path: file,
      relative: path.relative(adventureDir, file),
      priority: getFilePriority(
        adventureConfig,
        path.relative(adventureDir, file),
      ),
    }))
    .sort((a, b) => a.priority - b.priority);

  const categories = adventureConfig.categories || [
    { name: "Content", key: "content", pageBreakBefore: false },
  ];

  // Organize files by category defined in config
  const categorizedFiles = {};
  for (const category of categories) {
    categorizedFiles[category.key] = [];
  }
  categorizedFiles["other"] = []; // Fallback

  for (const file of sortedFiles) {
    let matched = false;
    for (const key of Object.keys(order)) {
      if (order[key] && order[key].some((p) => file.relative.endsWith(p))) {
        if (categorizedFiles[key]) {
          categorizedFiles[key].push(file);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      categorizedFiles["other"].push(file);
    }
  }

  // Combine
  let combinedContent = generateTitlePage(adventureConfig);
  let isFirstCategory = true;

  for (const categoryDef of categories) {
    if (forPublishing && categoryDef.excludeFromPublish) {
      continue;
    }

    const filesInCategory = categorizedFiles[categoryDef.key];
    if (!filesInCategory || filesInCategory.length === 0) continue;

    let isFirstFileInCategory = true;

    for (const file of filesInCategory) {
      const content = await fs.readFile(file.path, "utf-8");

      // Spacing logic (assume page breaks between sections unless overridden)
      const breakType = adventureConfig.useThematicBreaks
        ? THEMATIC_BREAK
        : PAGE_BREAK;

      if (
        isFirstFileInCategory &&
        categoryDef.pageBreakBefore &&
        !isFirstCategory
      ) {
        combinedContent += breakType;
      } else if (!isFirstFileInCategory) {
        combinedContent += breakType;
      }

      combinedContent += content;
      combinedContent += "\n";
      isFirstFileInCategory = false;
    }
    isFirstCategory = false;
  }

  return {
    combinedContent,
    sortedFiles,
    categorizedFiles,
    expectedOrder: order,
  };
}

/**
 * Main publisher function
 */
async function publishAdventure(config, adventureName, isDryRun = false) {
  const adventureConfig = config.adventures[adventureName];

  if (!adventureConfig) {
    console.error(
      `❌ Error: Unknown adventure '${adventureName}' in campaign config.`,
    );
    process.exit(1);
  }

  const adventureDir = path.resolve(
    config.campaignRoot,
    adventureConfig.sourceDir || adventureName,
  );

  try {
    await fs.access(adventureDir);
  } catch (error) {
    console.error(`❌ Error: Adventure directory not found: ${adventureDir}`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log(
      `🧪 TEST MODE: Combining files for ${adventureConfig.title}...\n`,
    );
    const { combinedContent, sortedFiles, categorizedFiles } =
      await combineAdventureFiles(adventureDir, adventureConfig, false);

    console.log(`Found ${sortedFiles.length} Markdown files\n`);
    console.log("📋 Files to be included:\n");
    const categories = adventureConfig.categories || [
      { name: "Content", key: "content" },
    ];

    for (const category of categories) {
      console.log(`${category.name}:`);
      const files = categorizedFiles[category.key] || [];
      if (files.length === 0) console.log("  (none)");
      files.forEach((f) => console.log(`  ✓ ${f.relative}`));
      console.log("");
    }

    const lines = combinedContent.split("\n").length;
    const words = combinedContent.split(/\s+/).length;
    console.log("\n✅ Combined document stats:");
    console.log(`  Lines: ${lines.toLocaleString()}`);
    console.log(`  Words: ${words.toLocaleString()}`);
    console.log(
      "\n✅ Test complete! Run without '--test' to publish to Google Docs.\n",
    );
    return;
  }

  console.log(`🚀 Publishing ${adventureConfig.title} to Google Docs...\n`);
  console.log("Authenticating with Google...");

  const authClient = await authorize({
    scopes: SCOPES,
    requireAuth: true,
  });

  if (!authClient) {
    console.error("❌ Authentication failed");
    process.exit(1);
  }

  const docsService = google.docs({ version: "v1", auth: authClient });
  const driveService = google.drive({ version: "v3", auth: authClient });

  console.log(`\n📚 Combining all ${adventureName} files...`);
  const { combinedContent } = await combineAdventureFiles(
    adventureDir,
    adventureConfig,
    true,
  );

  // Provide the adventureDir as the context for relative image paths
  const fakeMarkdownPathForRoot = path.join(adventureDir, "index.md");
  const finalContent = await processImagesAndUpload(
    driveService,
    combinedContent,
    adventureConfig.folderId,
    fakeMarkdownPathForRoot,
  );

  console.log(`\n📄 Creating/updating: ${adventureConfig.title}`);

  const docId = await createOrUpdateDoc(
    docsService,
    driveService,
    adventureConfig.title,
    finalContent,
    adventureConfig.folderId,
    adventureConfig.targetDocId,
  );

  if (docId) {
    console.log(`\n✅ Successfully published!`);
    console.log(`📝 Document: https://docs.google.com/document/d/${docId}\n`);
  } else {
    console.log(`\n❌ Failed to publish document\n`);
    process.exit(1);
  }
}

/**
 * Sync assets command handler
 */
async function syncAssets(config, adventureName, shouldGenerate = false) {
  const adventureConfig = config.adventures[adventureName];

  if (!adventureConfig) {
    console.error(
      `❌ Error: Unknown adventure '${adventureName}' in campaign config.`,
    );
    process.exit(1);
  }

  const adventureDir = path.resolve(
    config.campaignRoot,
    adventureConfig.sourceDir || adventureName,
  );

  try {
    await syncAdventureAssets(adventureDir, adventureConfig, shouldGenerate);
  } catch (error) {
    console.error(`❌ Error syncing assets: ${error.message}`);
    process.exit(1);
  }
}

// CLI handler
async function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Find custom config path
  const configIndex = args.indexOf("--config");
  const configPath =
    configIndex !== -1 && args[configIndex + 1]
      ? args[configIndex + 1]
      : "./campaign.json";
  const isTest = args.includes("--test");

  if (command === "publish") {
    const adventureName = args[1];
    if (!adventureName || adventureName.startsWith("--")) {
      console.error(
        "Usage: campaign-creator publish <adventure-key> [--config <path>] [--test]",
      );
      process.exit(1);
    }

    try {
      const config = await loadConfig(configPath);
      await publishAdventure(config, adventureName, isTest);
    } catch (error) {
      console.error("Critical Error Config:", error.message);
    }
  } else if (command === "sync-assets") {
    const adventureName = args[1];
    const shouldGenerate = args.includes("--generate");

    if (!adventureName || adventureName.startsWith("--")) {
      console.error(
        "Usage: campaign-creator sync-assets <adventure-key> [--config <path>] [--generate]",
      );
      process.exit(1);
    }

    try {
      const config = await loadConfig(configPath);
      await syncAssets(config, adventureName, shouldGenerate);
    } catch (error) {
      console.error("Critical Error Config:", error.message);
    }
  } else if (command === "generate-map") {
    const sectionFile = args[1];
    if (!sectionFile || sectionFile.startsWith("--")) {
      console.error(
        "Usage: campaign-creator generate-map <section.json> [--output <dir>] [--seed <n>] [--validate-only] [--ascii-only] [--cell-size <px>] [--no-grid] [--no-labels] [--color-scheme <blue|parchment>]",
      );
      process.exit(1);
    }

    try {
      await generateMap(sectionFile, args);
    } catch (error) {
      console.error(`Error generating map: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log(`
D&D Campaign Creator Tool
Usage:
  campaign-creator publish <adventure-key> [--config ./campaign.json] [--test]
  campaign-creator sync-assets <adventure-key> [--config ./campaign.json] [--generate]
  campaign-creator generate-map <section.json> [--output <dir>] [--seed <n>] [--validate-only]
`);
  }
}

/**
 * Generate a dungeon map from a section definition JSON file.
 */
async function generateMap(sectionFile, args) {
  const { buildIntent, createRng } = require("../src/map/intent");
  const { buildGraph } = require("../src/map/topology");
  const { validateTopology, validateGeometry } = require("../src/map/validate");
  const { layoutConstructed } = require("../src/map/geometry");
  const { routeCorridors } = require("../src/map/corridors");
  const { renderSvg } = require("../src/map/render-svg");
  const { renderAscii } = require("../src/map/render-ascii");
  const { renderPacket } = require("../src/map/packet");

  // Parse CLI options
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const outputDir =
    getArg("--output") || path.dirname(path.resolve(sectionFile));
  const seedInput = getArg("--seed");
  const seed = seedInput ? parseInt(seedInput, 10) : Date.now();
  const cellSize = getArg("--cell-size")
    ? parseInt(getArg("--cell-size"), 10)
    : 20;
  const validateOnly = args.includes("--validate-only");
  const asciiOnly = args.includes("--ascii-only");
  const showGrid = !args.includes("--no-grid");
  const showLabels = !args.includes("--no-labels");
  const colorScheme = getArg("--color-scheme") || "blue";

  console.error(`Using seed: ${seed}`);
  const rng = createRng(seed);

  // 1. Load section definition
  const raw = await fs.readFile(path.resolve(sectionFile), "utf8");
  const section = JSON.parse(raw);

  // 2. Build intent
  const intent = buildIntent(section);
  intent._connectors = section.connectors || [];
  console.log(`Section: ${intent.theme} (${intent.id})`);
  console.log(
    `Grid: ${intent.grid.width}x${intent.grid.height}, ${intent.layoutStrategy}, ${intent.density}`,
  );

  // 3. Build topology graph
  const graph = buildGraph(section.nodes, section.edges);
  console.log(
    `Topology: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );

  // 4. Validate topology
  const topoResult = validateTopology(graph, intent.grid);
  console.log("\nTopology validation:");
  for (const r of topoResult.results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.rule}: ${r.detail}`);
  }
  if (!topoResult.valid) {
    console.error(
      "\nTopology validation failed. Fix issues before generating geometry.",
    );
    process.exit(1);
  }
  if (validateOnly) {
    console.log("\nValidation complete (--validate-only).");
    return;
  }

  // 5. Generate geometry
  console.log("\nGenerating layout...");
  let geometry = layoutConstructed(
    graph,
    intent.grid,
    intent.density,
    section.connectors || [],
    10,
    rng,
  );

  // 6. Route corridors
  geometry = routeCorridors(geometry, graph, rng);

  // 7. Validate geometry
  const geoResult = validateGeometry(geometry, graph);
  console.log("\nGeometry validation:");
  for (const r of geoResult.results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.rule}: ${r.detail}`);
  }

  // Merge validation results
  const allValidation = {
    valid: topoResult.valid && geoResult.valid,
    results: [...topoResult.results, ...geoResult.results],
  };

  // 8. Render outputs
  await fs.mkdir(outputDir, { recursive: true });

  // ASCII map
  const ascii = renderAscii(geometry, graph);
  const asciiPath = path.join(outputDir, `${intent.id}-map.txt`);
  await fs.writeFile(asciiPath, ascii, "utf8");
  console.log(`\nASCII map: ${asciiPath}`);

  // SVG map
  let svgFilename = null;
  if (!asciiOnly) {
    const svg = renderSvg(geometry, graph, intent, {
      cellSize,
      showGrid,
      showLabels,
      showRockHatch: true,
      colorScheme,
    });
    svgFilename = `${intent.id}-map.svg`;
    const svgPath = path.join(outputDir, svgFilename);
    await fs.writeFile(svgPath, svg, "utf8");
    console.log(`SVG map: ${svgPath}`);
  }

  // Section packet markdown
  const packet = renderPacket(
    geometry,
    graph,
    intent,
    ascii,
    svgFilename ? `./${svgFilename}` : null,
    allValidation,
  );
  const packetPath = path.join(outputDir, `${intent.id}-packet.md`);
  await fs.writeFile(packetPath, packet, "utf8");
  console.log(`Section packet: ${packetPath}`);

  console.log("\nDone.");
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = {
  publishAdventure,
  combineAdventureFiles,
  generateMap,
};
