#!/usr/bin/env node

/**
 * Lightweight repository secret and sensitive-file scanner.
 *
 * Scans tracked files to prevent committing common credential artifacts or
 * high-signal secret patterns before the repository is made public.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const {
  forbiddenPathChecks,
  secretPatterns,
} = require("../src/security/patterns");

const repoRoot = path.resolve(__dirname, "..");

function listTrackedFiles() {
  const out = execSync("git ls-files", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!out) return [];
  return out.split("\n").filter(Boolean);
}

function isLikelyBinary(buffer) {
  const checkLength = Math.min(buffer.length, 4096);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function scan() {
  const files = listTrackedFiles();
  const findings = [];

  for (const relPath of files) {
    for (const rule of forbiddenPathChecks) {
      if (rule.test(relPath)) {
        findings.push({
          type: "forbidden-path",
          rule: rule.name,
          file: relPath,
          detail: rule.message,
        });
      }
    }

    const abs = path.join(repoRoot, relPath);
    let buffer;
    try {
      buffer = fs.readFileSync(abs);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        // Ignore tracked files that are deleted in the current worktree.
        continue;
      }
      findings.push({
        type: "read-error",
        rule: "file-read",
        file: relPath,
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

      // Approximate line number for easier triage.
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({
        type: "secret-pattern",
        rule: pattern.name,
        file: relPath,
        line,
        detail: `Matched ${pattern.name}`,
      });
    }
  }

  if (findings.length === 0) {
    console.log(
      "Security scan passed: no high-signal secrets or sensitive files detected.",
    );
    return;
  }

  console.error("Security scan failed:");
  for (const finding of findings) {
    const where = finding.line
      ? `${finding.file}:${finding.line}`
      : finding.file;
    console.error(`- [${finding.rule}] ${where} - ${finding.detail}`);
  }
  process.exit(1);
}

scan();
