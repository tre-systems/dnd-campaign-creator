const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { generateMap } = require("../../bin/campaign-creator");

describe("generate-map", () => {
  it("generates a prompt packet", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "map-gen-"));
    const sectionPath = path.resolve("examples/gatehouse-ruin.json");
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    try {
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};

      await generateMap(sectionPath, [
        "generate-map",
        sectionPath,
        "--output",
        outputDir,
      ]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    const packetPath = path.join(outputDir, "gatehouse-ruin-packet.md");
    const packet = await fs.readFile(packetPath, "utf8");

    assert.ok(
      packet.includes("Final Prompt"),
      "Packet should contain the rendered prompt section",
    );
    assert.match(packet, /Reference Images/);
    assert.match(packet, /Collapsed Gate/);
  });
});
