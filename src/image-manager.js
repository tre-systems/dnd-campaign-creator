const fs = require("fs").promises;
const path = require("path");
const { google } = require("googleapis");
const crypto = require("crypto");

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

    const media = {
      mimeType: "image/png",
      body: require("fs").createReadStream(filePath),
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

module.exports = {
  processImagesAndUpload,
  extractLocalImagePaths,
};
