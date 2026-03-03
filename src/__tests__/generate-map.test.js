const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { generateMap } = require("../../bin/campaign-creator");

describe("generate-map", () => {
  it("applies dressing features in CLI map generation pipeline", async () => {
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
        "--ascii-only",
      ]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    const asciiPath = path.join(outputDir, "gatehouse-ruin-map.txt");
    const ascii = await fs.readFile(asciiPath, "utf8");

    // Dressing symbols (e.g. pillar/statue/altar/well/etc.) should be present.
    const hasFeature = /[caswtf=F!Ox]/.test(ascii);
    assert.equal(hasFeature, true, "Expected at least one dressing feature");
  });
});
