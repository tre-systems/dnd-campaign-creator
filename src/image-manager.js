const { AIService } = require("./ai-service");
const fs = require("fs").promises;
const path = require("path");
const { google } = require("googleapis");
const crypto = require("crypto");
const sharp = require("sharp");

/**
 * Scan markdown content for local image paths.
 * Matches: ![Alt Text](/absolute/path/to/image.png)
 *
 * @param {string} content - Markdown content
 * @param {string} markdownFilePath - Absolute path to the markdown file being parsed
 * @returns {Array<{fullMatch: string, alt: string, path: string}>} - Array of matches
 */
function extractLocalImagePaths(content, markdownFilePath) {
  const overrides = [];
  // Match ![alt](/path) or ![alt](file:///path) or ![alt](../path) avoiding http/https
  // Capture groups: 1=alt, 2=path
  const regex = /!\[([^\]]*)\]\(((?!https?:\/\/)[^\)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    let imagePath = match[2];
    if (imagePath.startsWith("file://")) {
      imagePath = imagePath.replace("file://", "");
    } else if (markdownFilePath) {
      // resolve relative to the document
      imagePath = path.resolve(path.dirname(markdownFilePath), imagePath);
    } else {
      imagePath = path.resolve(process.cwd(), imagePath);
    }
    overrides.push({
      fullMatch: match[0],
      alt: match[1],
      path: imagePath,
      originalPath: match[2],
    });
  }
  return overrides;
}

/**
 * Search for an existing file in the specific folder with the exact name.
 *
 * @param {object} drive - Google Drive API client
 * @param {string} fileName - Name of the file
 * @param {string} folderId - ID of the folder to search in
 * @returns {Promise<string|null>} - File ID if found, null otherwise
 */
async function findImageInDrive(drive, fileName, folderId) {
  try {
    let query = `name = '${fileName}' and trashed = false`;
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const res = await drive.files.list({
      q: query,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (res.data.files.length > 0) {
      return res.data.files[0].id; // Return the first match
    }
    return null;
  } catch (error) {
    console.error(`Error searching for file ${fileName}:`, error.message);
    return null;
  }
}

/**
 * Ensure a file is publicly readable.
 *
 * @param {object} drive - Google Drive API client
 * @param {string} fileId - ID of the file
 */
async function makeFilePublic(drive, fileId) {
  try {
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
  } catch (error) {
    // Ignore if already public or other minor error to avoid crashing
    // "reader" permission might already exist
    // console.log(`   (Permission update note: ${error.message})`);
  }
}

/**
 * Upload a local image to Google Drive.
 *
 * @param {object} drive - Google Drive API client
 * @param {string} filePath - Absolute path to the local file
 * @param {string} folderId - ID of the target folder (optional)
 * @returns {Promise<string>} - The ID of the uploaded file
 */
async function uploadImageToDrive(drive, filePath, folderId) {
  const fileName = path.basename(filePath);
  let fileId = null;

  // 1. Check if file exists in Drive already
  const existingId = await findImageInDrive(drive, fileName, folderId);
  if (existingId) {
    console.log(`  Found existing image: ${fileName}`);
    fileId = existingId;
  } else {
    console.log(`  Uploading: ${fileName}...`);

    const fileMetadata = {
      name: fileName,
    };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    // Check if the file is an SVG
    const isSvg = filePath.toLowerCase().endsWith(".svg");
    let mediaBody;

    if (isSvg) {
      console.log(`  🎨 Rasterizing SVG to PNG...`);
      // Read the SVG as text so we can inline local image references
      let svgContent = await fs.readFile(filePath, "utf8");

      // Find all local image links inside the SVG and convert them to base64 Data URIs
      const imageRegex = /href=["']([^"']+\.(png|jpg|jpeg|webp))["']/gi;
      let match;
      while ((match = imageRegex.exec(svgContent)) !== null) {
        const relativeImagePath = match[1];
        if (
          !relativeImagePath.startsWith("http") &&
          !relativeImagePath.startsWith("data:")
        ) {
          const absoluteImagePath = path.resolve(
            path.dirname(filePath),
            relativeImagePath,
          );
          try {
            const imgBuffer = await fs.readFile(absoluteImagePath);
            const ext = path
              .extname(absoluteImagePath)
              .substring(1)
              .toLowerCase();
            const mimeType = ext === "jpg" ? "jpeg" : ext;
            const base64Data = imgBuffer.toString("base64");
            const dataUri = `data:image/${mimeType};base64,${base64Data}`;

            svgContent = svgContent.replace(match[0], `href="${dataUri}"`);
          } catch (e) {
            console.warn(
              `   ⚠️  Could not inline SVG image ${absoluteImagePath}: ${e.message}`,
            );
          }
        }
      }

      // Render the inlined SVG to a PNG buffer
      const pngBuffer = await sharp(Buffer.from(svgContent)).png().toBuffer();

      // Create a readable stream from the buffer for Google API
      const { Readable } = require("stream");
      mediaBody = Readable.from(pngBuffer);

      // Force the drive filename to be .png so Docs doesn't complain about the file type
      fileMetadata.name = fileName.replace(/\.svg$/i, ".png");
    } else {
      mediaBody = require("fs").createReadStream(filePath);
    }

    const media = {
      mimeType: "image/png",
      body: mediaBody,
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });

    console.log(`  ✅ Uploaded ID: ${res.data.id}`);
    fileId = res.data.id;
  }

  // 2. Ensure Permissions (Always run this, even if existing, because it might be private)
  await makeFilePublic(drive, fileId);

  return fileId;
}

/**
 * Main function to scan content, upload images, and return updated markdown.
 *
 * @param {object} driveService - Google Drive Service instance
 * @param {string} content - The full markdown content
 * @param {string} folderId - Target folder ID
 * @param {string} markdownFilePath - Absolute path to the markdown file
 * @returns {Promise<string>} - Markdown content with Drive URLs
 */
async function processImagesAndUpload(
  driveService,
  content,
  folderId,
  markdownFilePath,
) {
  console.log("🖼️  Scanning for local images...");
  const images = extractLocalImagePaths(content, markdownFilePath);

  if (images.length === 0) {
    console.log("   No local images found.");
    return content;
  }

  console.log(`   Found ${images.length} images.`);
  let newContent = content;

  // Process sequentially
  for (const img of images) {
    try {
      // access check
      await fs.access(img.path);

      const fileId = await uploadImageToDrive(driveService, img.path, folderId);
      const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

      // Replacing: ](/path/to/img) -> ](driveUrl)
      const escapedPath = img.originalPath.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const replaceRegex = new RegExp(
        `\\]\\((file:\/\/)?${escapedPath}\\)`,
        "g",
      );

      newContent = newContent.replace(replaceRegex, `](${driveUrl})`);
    } catch (error) {
      console.warn(
        `   ⚠️  Could not process image ${img.path}: ${error.message}`,
      );
    }
  }

  return newContent;
}

/**
 * Generate a detailed AI prompt based on art style and image description.
 *
 * @param {Object} artStyle - The style config from campaign.json
 * @param {string} description - The alt text/description for the image
 * @returns {string} - The constructed prompt
 */
function generatePrompt(artStyle, description) {
  if (!artStyle) return description;

  const { style, medium, palette, lighting, mood, subjects, avoid } = artStyle;

  // Find quarter-specific palette if applicable (heuristic: check if description mentions a quest/quarter key)
  let activePalette = palette;
  if (typeof palette === "string" && palette.includes("(")) {
    // Basic heuristic: "industrial brass-copper (2A)"
    const palettes = palette.split(";").map((p) => p.trim());
    const match = palettes.find((p) => {
      const parts = p.match(/\(([^)]+)\)/);
      return (
        parts && description.toUpperCase().includes(parts[1].toUpperCase())
      );
    });
    if (match) activePalette = match;
  }

  return [
    `${style}. ${medium}.`,
    description,
    subjects ? `Subjects: ${subjects}.` : "",
    activePalette ? `Palette: ${activePalette}.` : "",
    lighting ? `Lighting: ${lighting}.` : "",
    mood ? `Mood: ${mood}.` : "",
    avoid ? `Avoid: ${avoid}.` : "No text or lettering.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Sync all assets for an adventure by finding missing images and generating them.
 *
 * @param {Object} adventureDir - Path to adventure source
 * @param {Object} adventureConfig - The adventure part of campaign.json
 * @param {boolean} shouldGenerate - Whether to actually call the AI
 */
async function syncAdventureAssets(
  adventureDir,
  adventureConfig,
  shouldGenerate = false,
) {
  console.log(`🖼️  Syncing assets for: ${adventureConfig.title}`);

  const { getMarkdownFiles } = require("./document-manager");
  const mdFiles = await getMarkdownFiles(adventureDir);
  const missingByFile = new Map();
  const allMissing = new Set();

  for (const file of mdFiles) {
    const content = await fs.readFile(file, "utf8");
    const images = extractLocalImagePaths(content, file);

    for (const img of images) {
      if (!(await fs.stat(img.path).catch(() => null))) {
        if (!missingByFile.has(file)) missingByFile.set(file, []);
        missingByFile.get(file).push(img);
        allMissing.add(JSON.stringify({ path: img.path, alt: img.alt }));
      }
    }
  }

  if (allMissing.size === 0) {
    console.log("   ✅ All assets present.");
    return;
  }

  console.log(`   Found ${allMissing.size} missing unique assets.`);

  const aiService = new AIService();

  for (const itemJson of allMissing) {
    const item = JSON.parse(itemJson);
    const prompt = generatePrompt(adventureConfig.artStyle, item.alt);

    console.log(`\n   --- Missing: ${path.basename(item.path)} ---`);
    console.log(`   Prompt: ${prompt}`);

    if (shouldGenerate) {
      await aiService.generateImage(prompt, item.path);
    }
  }

  if (!shouldGenerate) {
    console.log(
      "\n   💡 Run with --generate to trigger AI generation for these assets.",
    );
  }
}

module.exports = {
  processImagesAndUpload,
  extractLocalImagePaths,
  generatePrompt,
  syncAdventureAssets,
};
