const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { combineAdventureFiles } = require("../../bin/campaign-creator");

const repoRoot = path.resolve(__dirname, "../..");

describe("campaign-creator CLI helpers", () => {
  it("passes each source file path to content transforms", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "campaign-"));
    const nestedDir = path.join(tempRoot, "chapters", "act-one");
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(tempRoot, "chapters", "intro.md"), "# Intro");
    await fs.writeFile(path.join(nestedDir, "room.md"), "# Room");

    const seenPaths = [];

    try {
      const { combinedContent } = await combineAdventureFiles(
        tempRoot,
        {
          title: "Test Adventure",
          categories: [
            { name: "Content", key: "content", pageBreakBefore: false },
          ],
          order: { content: ["intro.md", "room.md"] },
        },
        {
          transformContent: async (content, filePath) => {
            seenPaths.push(path.relative(tempRoot, filePath));
            return `${path.relative(tempRoot, filePath)}\n${content}`;
          },
        },
      );

      assert.deepStrictEqual(seenPaths, [
        path.join("chapters", "intro.md"),
        path.join("chapters", "act-one", "room.md"),
      ]);
      assert.match(combinedContent, /chapters\/intro\.md/);
      assert.match(combinedContent, /chapters\/act-one\/room\.md/);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns a non-zero exit code when config loading fails", () => {
    for (const command of ["publish", "sync-assets"]) {
      const result = spawnSync(
        process.execPath,
        [
          "bin/campaign-creator.js",
          command,
          "missing",
          "--config",
          "./does-not-exist.json",
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );

      assert.notStrictEqual(result.status, 0);
      assert.match(
        `${result.stdout}${result.stderr}`,
        /Critical Error Config:/,
      );
    }
  });
});
