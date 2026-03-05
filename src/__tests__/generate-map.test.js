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
        "--seed",
        "42",
      ]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    const packetPath = path.join(outputDir, "gatehouse-ruin-packet.md");
    const packet = await fs.readFile(packetPath, "utf8");

    // Dressing symbols should be described in the output somehow if it's a valid packet
    assert.ok(
      packet.includes("Gatehouse"),
      "Packet should contain intent theme or nodes",
    );
  });
});
