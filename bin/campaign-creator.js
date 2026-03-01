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
const { processImagesAndUpload } = require("../src/image-manager");

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
  } else {
    console.log(`
D&D Campaign Creator Tool
Usage:
  campaign-creator publish <adventure-key> [--config ./campaign.json] [--test]
`);
  }
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = {
  publishAdventure,
  combineAdventureFiles,
};
