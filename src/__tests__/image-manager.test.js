const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  extractLocalImagePaths,
  processImagesAndUpload,
} = require("../image-manager");

describe("image-manager", () => {
  describe("extractLocalImagePaths", () => {
    test("extracts standard markdown image links", () => {
      const markdown = "Here is an image: ![Alt Text](/path/to/img.png)";
      const result = extractLocalImagePaths(markdown);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].alt, "Alt Text");
      assert.strictEqual(result[0].originalPath, "/path/to/img.png");
    });

    test("ignores http/https image links", () => {
      const markdown =
        "Here is a remote image: ![Alt Text](https://example.com/img.png)";
      const result = extractLocalImagePaths(markdown);
      assert.strictEqual(result.length, 0);
    });

    test("resolves relative paths correctly using markdownFilePath", () => {
      const markdown = "![Dragon Bones](../../assets/images/dragon.png)";
      const fakeMarkdownPath =
        "/Users/test/campaign/adventures/my-adventure/01-intro.md";
      const result = extractLocalImagePaths(markdown, fakeMarkdownPath);
      assert.strictEqual(result.length, 1);

      const expected = require("path").resolve(
        "/Users/test/campaign/adventures/my-adventure",
        "../../assets/images/dragon.png",
      );
      assert.strictEqual(result[0].path, expected);
    });
  });

  describe("processImagesAndUpload", () => {
    test("returns original content if no images found", async () => {
      const content = "# Head\\n\\nNo images here!";
      const fakeDrive = {};
      const result = await processImagesAndUpload(
        fakeDrive,
        content,
        "folder123",
      );
      assert.strictEqual(result, content);
    });
  });
});
