const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateTopology, validateGeometry } = require("./validate");
const { buildGraph } = require("./topology");
const {
  createGatehouseSection,
  createLinearSection,
} = require("./fixtures/gatehouse-ruin");

describe("validate", () => {
  describe("validateTopology", () => {
    it("passes the gatehouse example", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const result = validateTopology(graph, section.grid);
      assert.ok(
        result.valid,
        `Validation failed: ${JSON.stringify(result.results.filter((r) => !r.passed))}`,
      );
    });

    it("fails linear section (no loops, one route)", () => {
      const section = createLinearSection();
      const graph = buildGraph(section.nodes, section.edges);
      const result = validateTopology(graph, section.grid);
      assert.equal(result.valid, false);

      const failedRules = result.results
        .filter((r) => !r.passed)
        .map((r) => r.rule);
      assert.ok(failedRules.includes("Loop count"));
      assert.ok(failedRules.includes("Two independent routes"));
    });

    it("fails when grid too large", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const result = validateTopology(graph, { width: 50, height: 50 });
      const gridRule = result.results.find((r) => r.rule === "Grid size");
      assert.equal(gridRule.passed, false);
    });

    it("reports dead end without justification", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "hub", name: "B" },
          { id: "C", type: "standard", name: "Dead End" },
          { id: "D", type: "exit", name: "D" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "B", to: "C", type: "open", bidirectional: true },
          { from: "B", to: "D", type: "open", bidirectional: true },
          { from: "A", to: "D", type: "open", bidirectional: true },
        ],
      );
      const result = validateTopology(graph, { width: 20, height: 20 });
      const deadEnd = result.results.find(
        (r) => r.rule === "Dead end justification",
      );
      assert.equal(deadEnd.passed, false);
      assert.ok(
        deadEnd.detail.includes("Dead End") || deadEnd.detail.includes("C"),
      );
    });

    it("passes dead end when it is a secret room", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "hub", name: "B" },
          { id: "C", type: "secret", name: "Vault" },
          { id: "D", type: "exit", name: "D" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "B", to: "C", type: "secret", bidirectional: true },
          { from: "B", to: "D", type: "open", bidirectional: true },
          { from: "A", to: "D", type: "open", bidirectional: true },
        ],
      );
      const result = validateTopology(graph, { width: 20, height: 20 });
      const deadEnd = result.results.find(
        (r) => r.rule === "Dead end justification",
      );
      assert.equal(deadEnd.passed, true);
    });
  });

  describe("validateGeometry", () => {
    it("detects room overlap", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "exit", name: "B" },
        ],
        [{ from: "A", to: "B", type: "open", bidirectional: true }],
      );
      const geometry = {
        width: 20,
        height: 20,
        cells: [],
        rooms: [
          { nodeId: "A", x: 2, y: 2, w: 5, h: 5, sizeClass: "small" },
          { nodeId: "B", x: 4, y: 4, w: 5, h: 5, sizeClass: "small" },
        ],
        corridors: [],
      };
      const result = validateGeometry(geometry, graph);
      const overlap = result.results.find((r) => r.rule === "No room overlaps");
      assert.equal(overlap.passed, false);
    });

    it("detects room out of bounds", () => {
      const graph = buildGraph([{ id: "A", type: "entry", name: "A" }], []);
      const geometry = {
        width: 10,
        height: 10,
        cells: [],
        rooms: [{ nodeId: "A", x: 8, y: 8, w: 5, h: 5, sizeClass: "small" }],
        corridors: [],
      };
      const result = validateGeometry(geometry, graph);
      const bounds = result.results.find(
        (r) => r.rule === "Rooms within bounds",
      );
      assert.equal(bounds.passed, false);
    });
  });
});
