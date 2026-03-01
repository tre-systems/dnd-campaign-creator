const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isStatBlock,
  formatStatBlockTable,
  formatStatBlockList,
} = require("../stat-block-formatter");

describe("isStatBlock", () => {
  it("returns false for empty tokens", () => {
    assert.strictEqual(isStatBlock({ tokens: [] }), false);
  });

  it("returns false when tokens is undefined", () => {
    assert.strictEqual(isStatBlock({}), false);
  });

  it("returns false for a regular blockquote without a stat block", () => {
    const token = {
      tokens: [
        {
          type: "paragraph",
          text: "This is just a regular blockquote.",
          tokens: [
            { type: "text", text: "This is just a regular blockquote." },
          ],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), false);
  });

  it("returns false for heading without following size/type line", () => {
    const token = {
      tokens: [
        { type: "heading", depth: 3, text: "Some Monster" },
        {
          type: "paragraph",
          text: "No alignment pattern here",
          tokens: [{ type: "text", text: "No alignment pattern here" }],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), false);
  });

  it("returns true for a valid stat block with italic size/type/alignment", () => {
    const token = {
      tokens: [
        { type: "heading", depth: 3, text: "Arcanitech Weaver" },
        {
          type: "paragraph",
          text: "_Huge construct, chaotic neutral_",
          tokens: [{ type: "em", text: "Huge construct, chaotic neutral" }],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), true);
  });

  it("returns true for stat block with raw italic markers in text", () => {
    const token = {
      tokens: [
        { type: "heading", depth: 3, text: "Goblin" },
        {
          type: "paragraph",
          text: "_Small humanoid, neutral evil_",
          tokens: [],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), true);
  });

  it("returns false for heading of wrong depth", () => {
    const token = {
      tokens: [
        { type: "heading", depth: 2, text: "Not a stat block" },
        {
          type: "paragraph",
          text: "_Medium humanoid, lawful evil_",
          tokens: [{ type: "em", text: "Medium humanoid, lawful evil" }],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), false);
  });

  it("returns true for stat block with plain text size/type/alignment", () => {
    const token = {
      tokens: [
        { type: "heading", depth: 3, text: "Nexus Guardian" },
        {
          type: "paragraph",
          text: "Large construct, unaligned",
          tokens: [{ type: "text", text: "Large construct, unaligned" }],
        },
      ],
    };
    assert.strictEqual(isStatBlock(token), true);
  });
});

describe("formatStatBlockTable", () => {
  it("formats a simple ability score table", () => {
    const tableToken = {
      header: [
        { text: "STR" },
        { text: "DEX" },
        { text: "CON" },
        { text: "INT" },
        { text: "WIS" },
        { text: "CHA" },
      ],
      rows: [
        [
          { text: "18 (+4)" },
          { text: "14 (+2)" },
          { text: "16 (+3)" },
          { text: "10 (+0)" },
          { text: "12 (+1)" },
          { text: "8 (-1)" },
        ],
      ],
    };

    const result = formatStatBlockTable(tableToken, 100);
    assert.ok(result.requests.length > 0, "Should produce requests");
    assert.ok(
      result.nextIndex > 100,
      "nextIndex should advance past the table",
    );
  });
});

describe("formatStatBlockList", () => {
  it("formats a list of items", () => {
    const listToken = {
      items: [
        { text: "**Slam.** Melee Weapon Attack: +7 to hit", tokens: [] },
        { text: "**Ray.** Ranged Spell Attack: +5 to hit", tokens: [] },
      ],
    };

    const result = formatStatBlockList(listToken, 200);
    assert.ok(result.requests.length > 0, "Should produce requests");
    assert.ok(result.nextIndex > 200, "nextIndex should advance past the list");
  });
});
