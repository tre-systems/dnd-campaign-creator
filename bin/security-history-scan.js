#!/usr/bin/env node

/**
 * Deep repository secret scanner for git history.
 *
 * Scans all reachable git object paths and blob contents in history to catch
 * credentials that may have been committed in earlier revisions.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { forbiddenPathChecks, secretPatterns } = require("../src/security/patterns");

const repoRoot = path.resolve(__dirname, "..");
const MAX_BLOB_SIZE = 1_000_000;

function runGit(args, input = undefined, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    encoding,
    input,
  });
}

function listHistoryObjects() {
  const out = runGit(["rev-list", "--objects", "--all"]);
  if (!out.trim()) return [];

  return out
    .trim()
    .split("\n")
    .map((line) => {
      const [sha, ...rest] = line.split(" ");
      return {
        sha,
        path: rest.join(" ") || null,
      };
    });
}

function getBlobMeta(shas) {
  if (shas.length === 0) return new Map();
  const input = `${shas.join("\n")}\n`;
  const out = runGit(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    input,
  );

  const meta = new Map();
  for (const line of out.trim().split("\n")) {
    const [sha, type, sizeRaw] = line.trim().split(" ");
    if (!sha || !type) continue;
    const size = Number(sizeRaw);
    meta.set(sha, { type, size });
  }
  return meta;
}

function isLikelyBinary(buffer) {
  const checkLength = Math.min(buffer.length, 4096);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function scanHistory() {
  const entries = listHistoryObjects();
  const findings = [];

  for (const entry of entries) {
    if (!entry.path) continue;
    for (const rule of forbiddenPathChecks) {
      if (rule.test(entry.path)) {
        findings.push({
          type: "forbidden-path",
          rule: rule.name,
          where: `${entry.path}@${entry.sha.slice(0, 12)}`,
          detail: rule.message,
        });
      }
    }
  }

  const blobPaths = new Map();
  for (const entry of entries) {
    if (!entry.path) continue;
    if (!blobPaths.has(entry.sha)) blobPaths.set(entry.sha, []);
    blobPaths.get(entry.sha).push(entry.path);
  }

  const blobShas = [...blobPaths.keys()];
  const blobMeta = getBlobMeta(blobShas);

  for (const sha of blobShas) {
    const meta = blobMeta.get(sha);
    if (!meta || meta.type !== "blob") continue;
    if (!Number.isFinite(meta.size) || meta.size <= 0 || meta.size > MAX_BLOB_SIZE) {
      continue;
    }

    let buffer;
    try {
      buffer = runGit(["cat-file", "-p", sha], undefined, "buffer");
    } catch (error) {
      findings.push({
        type: "read-error",
        rule: "blob-read",
        where: `${sha.slice(0, 12)}`,
        detail: error.message,
      });
      continue;
    }

    if (isLikelyBinary(buffer)) continue;
    const text = buffer.toString("utf8");

    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(text);
      if (!match) continue;

      const line = text.slice(0, match.index).split("\n").length;
      const samplePath = blobPaths.get(sha)[0] || "<unknown>";
      findings.push({
        type: "secret-pattern",
        rule: pattern.name,
        where: `${samplePath}:${line}@${sha.slice(0, 12)}`,
        detail: `Matched ${pattern.name}`,
      });
    }
  }

  if (findings.length === 0) {
    console.log("History security scan passed: no high-signal secrets found in git history.");
    return;
  }

  console.error("History security scan failed:");
  for (const finding of findings) {
    console.error(`- [${finding.rule}] ${finding.where} - ${finding.detail}`);
  }
  process.exit(1);
}

scanHistory();
