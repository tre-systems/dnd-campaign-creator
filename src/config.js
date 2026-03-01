const fs = require("fs").promises;
const path = require("path");

/**
 * Loads and validates a campaign.json configuration file.
 *
 * @param {string} configPath - Path to the campaign.json file
 * @returns {Promise<Object>} - Parsed configuration object with absolute paths resolved
 */
async function loadConfig(configPath) {
  try {
    const fullPath = path.resolve(process.cwd(), configPath);
    const data = await fs.readFile(fullPath, "utf8");
    const config = JSON.parse(data);

    // Resolve paths relative to the config file's directory
    const configDir = path.dirname(fullPath);

    if (config.campaignRoot) {
      config.campaignRoot = path.resolve(configDir, config.campaignRoot);
    } else {
      config.campaignRoot = configDir;
    }

    if (config.assetsDir) {
      config.assetsDir = path.resolve(configDir, config.assetsDir);
    }

    return config;
  } catch (err) {
    throw new Error(`Failed to load config at ${configPath}: ${err.message}`);
  }
}

module.exports = { loadConfig };
