#!/usr/bin/env node
/**
 * Dropbox Sync Utility
 *
 * Syncs images and assets to organized Dropbox folder structure
 */

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Dropbox base path
const DROPBOX_BASE =
  "/Users/robertgilks/Library/CloudStorage/Dropbox/DnD/IntoTheBorderlands";
const IMAGES_BASE = path.join(DROPBOX_BASE, "images");

/**
 * Determine the Dropbox subdirectory for an image based on its filename
 */
function getDropboxPath(filename) {
  const name = filename.toLowerCase();

  // War for the West images (check early - before NPC name matches grab them)
  if (name.startsWith("war-for-the-west") || name.startsWith("war-for-west")) {
    return "war-for-the-west";
  }

  // Sanctum images
  if (name.startsWith("sanctum-")) {
    const location = name.replace(/^sanctum-|\.png$/g, "");

    // NPCs
    if (
      location.includes("librarian") ||
      location.includes("collector") ||
      location.includes("voice") ||
      location.includes("broken") ||
      location.includes("forge-master") ||
      location.includes("weaver") ||
      location.includes("scavenger") ||
      location.includes("guardian")
    ) {
      return path.join("sanctum", "npcs");
    }

    // Locations
    return path.join("sanctum", "locations");
  }

  // Check NPCs FIRST (before general adventure categorization)
  // Caves/Chaos NPCs go to caves-revisited/npcs
  if (
    name.includes("zanthus") ||
    name.includes("chaos-imp") ||
    name.includes("chaos-serpent") ||
    name.includes("choas-zombie")
  ) {
    return path.join("caves-revisited", "npcs");
  }

  // Stonehell NPCs go to stonehell/npcs
  if (
    name.includes("hobgoblin") ||
    name.includes("medusa") ||
    name.includes("falkth")
  ) {
    return path.join("stonehell", "npcs");
  }

  // Caves of Chaos images (but not maps or NPCs - those are handled above)
  if (
    (name.includes("chaos") ||
      (name.includes("caves") && !name.includes("grid")) ||
      name.includes("cave")) &&
    !name.includes("grid") &&
    !name.includes("chaos-imp") &&
    !name.includes("chaos-serpent")
  ) {
    return "caves-revisited";
  }

  // Stonehell images (but not NPCs - those are handled above)
  if (
    (name.includes("stonehell") ||
      name.includes("temple") ||
      name.includes("hexperiment")) &&
    !name.includes("hobgoblin") &&
    !name.includes("medusa")
  ) {
    return "stonehell";
  }

  // Stonehell NPCs (various adventures)
  if (
    name.includes("maverak") ||
    name.includes("fulkth") ||
    name.includes("draknor") ||
    name.includes("morgrath") ||
    name.includes("melissa") ||
    name.includes("lachesis") ||
    name.includes("sylvara") ||
    name.includes("throghrin") ||
    name.includes("urushiol") ||
    name.includes("skelmis") ||
    name.includes("krusk")
  ) {
    return path.join("stonehell", "npcs");
  }

  // Caves Revisited NPCs
  if (name.includes("khan") || name.includes("yg") || name.includes("yig")) {
    return path.join("caves-revisited", "npcs");
  }

  // Generic character portraits/tokens (campaign-wide)
  if (
    name.includes("attack") ||
    name.includes("command") ||
    name.includes("elite") ||
    name.includes("patrol") ||
    name.includes("beastmaster") ||
    name.includes("disco") ||
    name.includes("mushroom-man") ||
    name.includes("suz")
  ) {
    return path.join("campaign", "npcs");
  }

  // General monsters/creatures (campaign-wide)
  if (
    name.includes("ogre") ||
    name.includes("bugbear") ||
    name.includes("gnoll") ||
    name.includes("wight") ||
    name.includes("zombie") ||
    name.includes("imp") ||
    name.includes("serpent") ||
    name.includes("monkey") ||
    name.includes("rat") ||
    name.includes("armor") ||
    name.includes("elephant") ||
    name.includes("dragon") ||
    name.includes("spawn")
  ) {
    return path.join("campaign", "npcs");
  }

  // Actual maps (only real maps/grids)
  if (name.includes("map") || name.includes("grid")) {
    return "maps";
  }

  // Murals and artwork go to root (they're illustrations, not maps)
  // Room images are location images, not maps
  // Items and environmental elements go to root

  // Default: root images folder
  return "";
}

/**
 * Sync a single file to Dropbox
 */
async function syncToDropbox(sourcePath, filename) {
  const dropboxSubdir = getDropboxPath(filename);
  // dropboxSubdir is relative to images/ folder
  const dropboxDir = dropboxSubdir
    ? path.join(IMAGES_BASE, dropboxSubdir)
    : IMAGES_BASE;
  const dropboxPath = path.join(dropboxDir, filename);

  try {
    // Ensure directory exists
    await fs.mkdir(dropboxDir, { recursive: true });

    // Copy file
    await fs.copyFile(sourcePath, dropboxPath);

    return {
      success: true,
      path: dropboxPath,
      subdir: dropboxSubdir,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: dropboxPath,
    };
  }
}

/**
 * Sync multiple files to Dropbox
 */
async function syncFilesToDropbox(files) {
  const results = {
    success: [],
    failed: [],
  };

  for (const file of files) {
    const result = await syncToDropbox(file.sourcePath, file.filename);
    if (result.success) {
      results.success.push({
        filename: file.filename,
        path: result.path,
        subdir: result.subdir,
      });
    } else {
      results.failed.push({
        filename: file.filename,
        error: result.error,
      });
    }
  }

  return results;
}

/**
 * Get all images from source directory
 */
async function getAllImages(sourceDir) {
  const files = await fs.readdir(sourceDir);
  const images = files.filter(
    (f) =>
      f.endsWith(".png") ||
      f.endsWith(".jpg") ||
      f.endsWith(".jpeg") ||
      f.endsWith(".webp"),
  );

  return images.map((filename) => ({
    filename,
    sourcePath: path.join(sourceDir, filename),
  }));
}

module.exports = {
  syncToDropbox,
  syncFilesToDropbox,
  getAllImages,
  getDropboxPath,
  DROPBOX_BASE,
};
