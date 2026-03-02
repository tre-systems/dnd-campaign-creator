const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateTopology, validateGeometry } = require("./validate");
const { buildGraph } = require("./topology");
const { CELL, createGrid } = require("./geometry");
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

    it("detects disconnected connectors", () => {
      const graph = buildGraph([{ id: "A", type: "entry", name: "A" }], []);
      const cells = createGrid(12, 12);
      // Single room in center; connector stub at bottom remains disconnected.
      for (let y = 4; y < 8; y++) {
        for (let x = 4; x < 8; x++) cells[y][x] = CELL.FLOOR;
      }
      cells[11][2] = CELL.CORRIDOR;
      cells[10][2] = CELL.CORRIDOR;
      const geometry = {
        width: 12,
        height: 12,
        cells,
        rooms: [{ nodeId: "A", x: 4, y: 4, w: 4, h: 4, sizeClass: "large" }],
        corridors: [],
      };
      const result = validateGeometry(geometry, graph, [
        { side: "bottom", offset: 2, width: 1 },
      ]);
      const connectorRule = result.results.find(
        (r) => r.rule === "Connectors connected",
      );
      assert.equal(connectorRule.passed, false);
    });

    it("passes when connector reaches a room", () => {
      const graph = buildGraph([{ id: "A", type: "entry", name: "A" }], []);
      const cells = createGrid(12, 12);
      for (let y = 4; y < 8; y++) {
        for (let x = 4; x < 8; x++) cells[y][x] = CELL.FLOOR;
      }
      // Corridor from bottom connector to room.
      for (let y = 7; y < 12; y++) cells[y][5] = CELL.CORRIDOR;
      const geometry = {
        width: 12,
        height: 12,
        cells,
        rooms: [{ nodeId: "A", x: 4, y: 4, w: 4, h: 4, sizeClass: "large" }],
        corridors: [],
      };
      const result = validateGeometry(geometry, graph, [
        { side: "bottom", offset: 5, width: 1 },
      ]);
      const connectorRule = result.results.find(
        (r) => r.rule === "Connectors connected",
      );
      assert.equal(connectorRule.passed, true);
    });
  });
});
