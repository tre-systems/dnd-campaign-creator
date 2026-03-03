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

  it("supports strict style profile from CLI options", async () => {
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
        "--style-profile",
        "blueprint-strict",
      ]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    const svgPath = path.join(outputDir, "gatehouse-ruin-map.svg");
    const svg = await fs.readFile(svgPath, "utf8");

    assert.ok(
      svg.includes('class="room-number-center"'),
      "Expected centered room labels in strict profile",
    );
    assert.ok(
      !svg.includes('class="room-tag"'),
      "Expected top-left room tags to be disabled in strict profile",
    );
  });

  it("supports explicit label mode override from CLI options", async () => {
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
        "--style-profile",
        "blueprint-strict",
        "--label-mode",
        "corner",
      ]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    const svgPath = path.join(outputDir, "gatehouse-ruin-map.svg");
    const svg = await fs.readFile(svgPath, "utf8");

    assert.ok(
      svg.includes('class="room-tag"'),
      "Expected corner room tags when label-mode is corner",
    );
    assert.ok(
      !svg.includes('class="room-number-center"'),
      "Expected centered room labels to be disabled by corner label mode",
    );
  });
});
