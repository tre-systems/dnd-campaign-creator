const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inlineMarkdownToText } = require("../markdown-utils");

describe("inlineMarkdownToText", () => {
  it("returns empty text for null/undefined input", () => {
    assert.deepStrictEqual(inlineMarkdownToText(null), {
      text: "",
      formatting: [],
    });
    assert.deepStrictEqual(inlineMarkdownToText(undefined), {
      text: "",
      formatting: [],
    });
    assert.deepStrictEqual(inlineMarkdownToText(""), {
      text: "",
      formatting: [],
    });
  });

  it("returns plain text unchanged", () => {
    const result = inlineMarkdownToText("Hello world");
    assert.strictEqual(result.text, "Hello world");
    assert.strictEqual(result.formatting.length, 0);
  });

  it("strips bold markers and adds bold formatting", () => {
    const result = inlineMarkdownToText("Hello **bold** world");
    assert.strictEqual(result.text, "Hello bold world");
    assert.strictEqual(result.formatting.length, 1);

    const fmt = result.formatting[0];
    assert.strictEqual(fmt.updateTextStyle.textStyle.bold, true);
    assert.strictEqual(fmt.updateTextStyle.range.startIndex, 6);
    assert.strictEqual(fmt.updateTextStyle.range.endIndex, 10);
  });

  it("handles underscore bold (__text__)", () => {
    const result = inlineMarkdownToText("Hello __bold__ world");
    assert.strictEqual(result.text, "Hello bold world");
    assert.strictEqual(result.formatting.length, 1);
    assert.strictEqual(
      result.formatting[0].updateTextStyle.textStyle.bold,
      true,
    );
  });

  it("strips italic markers and adds italic formatting", () => {
    const result = inlineMarkdownToText("Hello *italic* world");
    assert.strictEqual(result.text, "Hello italic world");
    assert.strictEqual(result.formatting.length, 1);

    const fmt = result.formatting[0];
    assert.strictEqual(fmt.updateTextStyle.textStyle.italic, true);
    assert.strictEqual(fmt.updateTextStyle.range.startIndex, 6);
    assert.strictEqual(fmt.updateTextStyle.range.endIndex, 12);
  });

  it("strips code backticks and adds code formatting", () => {
    const result = inlineMarkdownToText("Hello `code` world");
    assert.strictEqual(result.text, "Hello code world");
    assert.strictEqual(result.formatting.length, 1);

    const fmt = result.formatting[0];
    assert.ok(fmt.updateTextStyle.textStyle.fontSize);
    assert.ok(fmt.updateTextStyle.textStyle.backgroundColor);
    assert.strictEqual(fmt.updateTextStyle.range.startIndex, 6);
    assert.strictEqual(fmt.updateTextStyle.range.endIndex, 10);
  });

  it("handles multiple bold markers in the same text", () => {
    const result = inlineMarkdownToText("**one** and **two**");
    assert.strictEqual(result.text, "one and two");
    assert.strictEqual(result.formatting.length, 2);
  });

  it("handles mixed bold and italic formatting", () => {
    const result = inlineMarkdownToText("**bold** and *italic*");
    assert.strictEqual(result.text, "bold and italic");
    assert.strictEqual(result.formatting.length, 2);

    const boldFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.bold,
    );
    const italicFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.italic,
    );

    assert.ok(boldFmt, "Should have bold formatting");
    assert.ok(italicFmt, "Should have italic formatting");
  });

  it("handles mixed bold, italic, and code formatting", () => {
    const result = inlineMarkdownToText("**bold** *italic* `code`");
    assert.strictEqual(result.text, "bold italic code");
    assert.strictEqual(result.formatting.length, 3);
  });

  it("handles bold text nested inside a link", () => {
    const result = inlineMarkdownToText("[**Bold**](https://example.com)");
    assert.strictEqual(result.text, "Bold");

    const boldFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.bold,
    );
    const linkFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.link?.url === "https://example.com",
    );

    assert.deepStrictEqual(boldFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
    assert.deepStrictEqual(linkFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
  });

  it("handles a link nested inside bold text", () => {
    const result = inlineMarkdownToText("**[Link](https://example.com)**");
    assert.strictEqual(result.text, "Link");

    const boldFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.bold,
    );
    const linkFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.link?.url === "https://example.com",
    );

    assert.deepStrictEqual(boldFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
    assert.deepStrictEqual(linkFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
  });

  it("handles italic text wrapped around bold text", () => {
    const result = inlineMarkdownToText("_**Bold**_");
    assert.strictEqual(result.text, "Bold");

    const boldFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.bold,
    );
    const italicFmt = result.formatting.find(
      (f) => f.updateTextStyle.textStyle.italic,
    );

    assert.deepStrictEqual(boldFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
    assert.deepStrictEqual(italicFmt.updateTextStyle.range, {
      startIndex: 0,
      endIndex: 4,
    });
  });
});
