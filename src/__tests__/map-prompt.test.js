const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMapPrompt,
  renderMapPromptPacket,
  validateMapPromptSpec,
} = require("../map-prompt");

test("validateMapPromptSpec normalizes authored map briefs", () => {
  const spec = validateMapPromptSpec({
    id: "gatehouse-ruin",
    title: "Gatehouse Ruin",
    theme: "Goblin-held dwarven gatehouse",
    promise: "Players force a breach and discover a deeper threat below.",
    referenceImages: [
      {
        label: "Primary style reference",
        path: "./private-reference/gatehouse-blueprint.jpg",
      },
    ],
    areas: [
      {
        name: "Collapsed Gate",
        description: "Broken entrance with a partial kill zone.",
      },
    ],
  });

  assert.equal(spec.id, "gatehouse-ruin");
  assert.equal(spec.areas[0].label, "1");
  assert.equal(spec.referenceImages[0].label, "Primary style reference");
});

test("validateMapPromptSpec rejects missing area schedules", () => {
  assert.throws(
    () =>
      validateMapPromptSpec({
        id: "broken-brief",
        title: "Broken Brief",
        theme: "Nothing here",
        promise: "This should fail.",
        areas: [],
      }),
    /areas must be a non-empty array/,
  );
});

test("renderMapPromptPacket includes prompt, references, and checklist", () => {
  const spec = validateMapPromptSpec({
    id: "gatehouse-ruin",
    title: "Gatehouse Ruin",
    level: 1,
    theme: "Goblin-held dwarven gatehouse",
    promise: "Players force a breach and discover a deeper threat below.",
    referenceImages: [
      {
        label: "Primary style reference",
        path: "./private-reference/gatehouse-blueprint.jpg",
        focus: "line weight and blue-draft texture",
      },
    ],
    deliverable: {
      format: "single top-down dungeon map",
      labels: "room numbers only",
    },
    style: {
      overview: "clear blue-draft dungeon cartography",
      avoid: ["photorealism", "isometric perspective"],
    },
    areas: [
      {
        name: "Collapsed Gate",
        role: "entry",
        description: "Broken outer gate and rubble choke point.",
        connections: ["2. Guard Post"],
        mustInclude: ["fallen portcullis", "breached masonry"],
      },
    ],
    revisionChecklist: ["Entry route remains easy to read."],
  });

  const prompt = buildMapPrompt(spec);
  const packet = renderMapPromptPacket(spec);

  assert.match(prompt, /Use the attached reference images/);
  assert.match(prompt, /Collapsed Gate/);
  assert.match(packet, /## Reference Images/);
  assert.match(packet, /## Final Prompt/);
  assert.match(packet, /Entry route remains easy to read/);
});
