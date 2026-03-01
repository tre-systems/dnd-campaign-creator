const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { getMarkdownFiles } = require("../document-manager");

describe("document-manager", () => {
  describe("getMarkdownFiles", () => {
    test("finds markdown files recursively", async () => {
      const fs = require("fs/promises");
      const testDir = path.resolve(__dirname, "dummy_test_dir");

      // Create dummy directory and files
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, "test1.md"), "# Test 1");
      await fs.writeFile(path.join(testDir, "test2.txt"), "Not a md file");

      const subDir = path.join(testDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, "test3.md"), "# Test 3");

      try {
        const files = await getMarkdownFiles(testDir);

        assert.ok(files.length === 2, "Should find exactly two markdown files");
        assert.ok(
          files.some((f) => f.endsWith("test1.md")),
          "Should find test1.md",
        );
        assert.ok(
          files.some((f) => f.endsWith("test3.md")),
          "Should find test3.md inside subdir",
        );
      } finally {
        // Clean up
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
