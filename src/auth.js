#!/usr/bin/env node
/**
 * Shared Google API authentication module
 *
 * Provides unified authentication for Google APIs (Docs, Drive, etc.)
 * Supports both OAuth and Service Account authentication methods.
 */

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Try to load googleapis and local-auth (optional dependencies)
let google, authenticate;
try {
  google = require("googleapis").google;
  authenticate = require("@google-cloud/local-auth").authenticate;
} catch (error) {
  // These are optional - scripts will handle missing dependencies
}

const PACKAGE_ROOT = path.join(__dirname, "..");
const LEGACY_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_CREDENTIALS_FILENAME = "credentials.json";
const DEFAULT_SERVICE_ACCOUNT_FILENAME = "service-account-key.json";
const DEFAULT_TOKEN_FILENAME = "token.json";

function candidateSearchDirs() {
  return [process.cwd(), PACKAGE_ROOT, LEGACY_ROOT];
}

function resolvePathForRead(explicitPath, filename) {
  if (explicitPath) return path.resolve(explicitPath);

  for (const dir of candidateSearchDirs()) {
    const candidate = path.join(dir, filename);
    if (fsSync.existsSync(candidate)) return candidate;
  }

  // Deterministic fallback for clear error messaging.
  return path.join(process.cwd(), filename);
}

function resolvePathForWrite(explicitPath, fallbackDir, filename) {
  if (explicitPath) return path.resolve(explicitPath);
  return path.join(fallbackDir || process.cwd(), filename);
}

/**
 * Load saved OAuth credentials from token file
 */
async function loadSavedCredentialsIfExist(tokenPath) {
  if (!google) {
    return null;
  }

  try {
    const content = await fs.readFile(tokenPath);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Save OAuth credentials to token file
 */
async function saveCredentials(
  client,
  credentialsPath,
  tokenPath,
) {
  try {
    const content = await fs.readFile(credentialsPath);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: "authorized_user",
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(tokenPath, payload);
  } catch (error) {
    throw new Error(`Failed to save credentials: ${error.message}`);
  }
}

/**
 * Authorize Google API access
 *
 * @param {Object} options - Configuration options
 * @param {string[]} options.scopes - API scopes required
 * @param {string} options.authMethod - 'oauth' or 'service-account' (default: from env or 'oauth')
 * @param {string} options.credentialsPath - Path to OAuth credentials file (default: discovered from cwd/package fallback or GOOGLE_OAUTH_CREDENTIALS_PATH)
 * @param {string} options.serviceAccountPath - Path to service account key file (default: discovered from cwd/package fallback or GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
 * @param {string} options.tokenPath - Path to save OAuth token (default: alongside resolved OAuth credentials or GOOGLE_TOKEN_PATH)
 * @param {boolean} options.requireAuth - If true, exit on auth failure (default: false)
 * @returns {Promise<Object|null>} Authenticated client or null
 */
async function authorize({
  scopes,
  authMethod = process.env.DRIVE_AUTH_METHOD ||
    process.env.AUTH_METHOD ||
    "oauth",
  credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH,
  serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  tokenPath = process.env.GOOGLE_TOKEN_PATH,
  requireAuth = false,
} = {}) {
  if (!google) {
    const error =
      "googleapis package not installed. Install with: npm install googleapis";
    if (requireAuth) {
      console.error(`❌ ${error}`);
      process.exit(1);
    }
    return null;
  }

  const resolvedCredentialsPath = resolvePathForRead(
    credentialsPath,
    DEFAULT_CREDENTIALS_FILENAME,
  );
  const resolvedServiceAccountPath = resolvePathForRead(
    serviceAccountPath,
    DEFAULT_SERVICE_ACCOUNT_FILENAME,
  );
  const tokenDir = path.dirname(resolvedCredentialsPath);
  const resolvedTokenPath = resolvePathForWrite(
    tokenPath,
    tokenDir,
    DEFAULT_TOKEN_FILENAME,
  );

  // Service Account authentication
  if (authMethod === "service-account") {
    try {
      if (!fsSync.existsSync(resolvedServiceAccountPath)) {
        const error = `Service account key not found: ${resolvedServiceAccountPath}`;
        if (requireAuth) {
          console.error(`❌ ${error}`);
          console.log("\nTo set up service account:");
          console.log("1. Go to https://console.cloud.google.com/");
          console.log("2. Create a new project or select existing");
          console.log(
            "3. Enable required APIs (Google Docs API, Google Drive API, etc.)",
          );
          console.log('4. Go to "IAM & Admin" → "Service Accounts"');
          console.log("5. Create a new service account");
          console.log("6. Create a key (JSON) and download it");
          console.log(
            `7. Save it as "${path.basename(resolvedServiceAccountPath)}" in your campaign root or set GOOGLE_SERVICE_ACCOUNT_KEY_PATH`,
          );
          process.exit(1);
        }
        return null;
      }

      const serviceAccount = await fs.readFile(resolvedServiceAccountPath);
      const key = JSON.parse(serviceAccount);

      // Validate key structure
      if (!key.client_email || !key.private_key) {
        const error = "Invalid service account key format";
        if (requireAuth) {
          console.error(`❌ ${error}: Missing client_email or private_key`);
          process.exit(1);
        }
        return null;
      }

      // Use JWT auth for service account
      const auth = new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        scopes,
      );

      return auth;
    } catch (error) {
      const errorMsg = `Error loading service account: ${error.message}`;
      if (requireAuth) {
        console.error(`❌ ${errorMsg}`);
        console.log("\nMake sure the service account key file is valid JSON");
        process.exit(1);
      }
      return null;
    }
  }

  // OAuth authentication
  if (!authenticate) {
    const error =
      "OAuth requires @google-cloud/local-auth package. Install with: npm install @google-cloud/local-auth";
    if (requireAuth) {
      console.error(`❌ ${error}`);
      process.exit(1);
    }
    return null;
  }

  if (!fsSync.existsSync(resolvedCredentialsPath)) {
    const error = `OAuth credentials not found: ${resolvedCredentialsPath}`;
    if (requireAuth) {
      console.error(`❌ ${error}`);
      console.log("\nTo set up OAuth:");
      console.log("1. Go to https://console.cloud.google.com/");
      console.log("2. Create a new project or select existing");
      console.log(
        "3. Enable required APIs (Google Docs API, Google Drive API, etc.)",
      );
      console.log("4. Create OAuth 2.0 credentials (Desktop app)");
      console.log(
        '5. Download credentials and save as "credentials.json" in your campaign root or set GOOGLE_OAUTH_CREDENTIALS_PATH',
      );
      process.exit(1);
    }
    return null;
  }

  // Try to load saved credentials first
  let client = await loadSavedCredentialsIfExist(resolvedTokenPath);
  if (client) {
    return client;
  }

  // Authenticate and save credentials
  try {
    client = await authenticate({
      scopes: scopes,
      keyfilePath: resolvedCredentialsPath,
    });

    if (client.credentials) {
      await saveCredentials(client, resolvedCredentialsPath, resolvedTokenPath);
    }

    return client;
  } catch (error) {
    const errorMsg = `OAuth authentication failed: ${error.message}`;
    if (requireAuth) {
      console.error(`❌ ${errorMsg}`);
      process.exit(1);
    }
    return null;
  }
}

module.exports = {
  authorize,
  loadSavedCredentialsIfExist,
  saveCredentials,
};
