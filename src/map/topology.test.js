const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGraph,
  bfsDistance,
  countEdgeDisjointPaths,
  findCycleCount,
  nodeDegree,
} = require("./topology");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

describe("topology", () => {
  describe("buildGraph", () => {
    it("builds adjacency map from nodes and edges", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      assert.equal(graph.nodes.length, 9);
      assert.equal(graph.edges.length, 11);
      assert.ok(graph.adjacency.has("E1"));
      assert.ok(graph.adjacency.has("H1"));
    });

    it("creates nodeMap for quick lookup", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const node = graph.nodeMap.get("H1");
      assert.equal(node.name, "Gatehouse Hall");
      assert.equal(node.type, "hub");
    });

    it("rejects empty nodes", () => {
      assert.throws(() => buildGraph([], []), /at least one node/);
    });

    it("rejects duplicate node IDs", () => {
      assert.throws(
        () =>
          buildGraph(
            [
              { id: "A", type: "entry", name: "A" },
              { id: "A", type: "exit", name: "B" },
            ],
            [],
          ),
        /Duplicate node ID/,
      );
    });

    it("rejects edges referencing unknown nodes", () => {
      assert.throws(
        () =>
          buildGraph(
            [{ id: "A", type: "entry", name: "A" }],
            [{ from: "A", to: "Z", type: "open" }],
          ),
        /unknown node/,
      );
    });

    it("rejects invalid edge types", () => {
      assert.throws(
        () =>
          buildGraph(
            [
              { id: "A", type: "entry", name: "A" },
              { id: "B", type: "exit", name: "B" },
            ],
            [{ from: "A", to: "B", type: "teleport" }],
          ),
        /Invalid edge type/,
      );
    });
  });

  describe("bfsDistance", () => {
    it("computes correct distances from entry", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "standard", name: "B" },
          { id: "C", type: "exit", name: "C" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "B", to: "C", type: "open", bidirectional: true },
        ],
      );
      const dist = bfsDistance(graph, "A");
      assert.equal(dist.get("A"), 0);
      assert.equal(dist.get("B"), 1);
      assert.equal(dist.get("C"), 2);
    });

    it("handles disconnected nodes", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "exit", name: "B" },
        ],
        [],
      );
      const dist = bfsDistance(graph, "A");
      assert.equal(dist.get("A"), 0);
      assert.equal(dist.has("B"), false);
    });
  });

  describe("countEdgeDisjointPaths", () => {
    it("finds 2 disjoint paths in a diamond graph", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "standard", name: "B" },
          { id: "C", type: "standard", name: "C" },
          { id: "D", type: "exit", name: "D" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "A", to: "C", type: "open", bidirectional: true },
          { from: "B", to: "D", type: "open", bidirectional: true },
          { from: "C", to: "D", type: "open", bidirectional: true },
        ],
      );
      assert.equal(countEdgeDisjointPaths(graph, "A", "D"), 2);
    });

    it("finds 1 path in a linear graph", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "standard", name: "B" },
          { id: "C", type: "exit", name: "C" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "B", to: "C", type: "open", bidirectional: true },
        ],
      );
      assert.equal(countEdgeDisjointPaths(graph, "A", "C"), 1);
    });
  });

  describe("findCycleCount", () => {
    it("finds 0 cycles in a linear graph", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "exit", name: "B" },
        ],
        [{ from: "A", to: "B", type: "open", bidirectional: true }],
      );
      assert.equal(findCycleCount(graph), 0);
    });

    it("finds 1 cycle in a triangle", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "standard", name: "B" },
          { id: "C", type: "exit", name: "C" },
        ],
        [
          { from: "A", to: "B", type: "open", bidirectional: true },
          { from: "B", to: "C", type: "open", bidirectional: true },
          { from: "C", to: "A", type: "open", bidirectional: true },
        ],
      );
      assert.equal(findCycleCount(graph), 1);
    });

    it("finds cycles in gatehouse example", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      // 11 edges - 9 nodes + 1 component = 3 cycles
      assert.equal(findCycleCount(graph), 3);
    });
  });

  describe("nodeDegree", () => {
    it("returns correct degree for hub node", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      // H1 connects to: G1, R1, R3, F1, R2(secret) = 5 edges
      const degree = nodeDegree(graph, "H1");
      assert.ok(degree >= 4, `Hub degree ${degree} should be >= 4`);
    });

    it("returns 1 for leaf node", () => {
      const graph = buildGraph(
        [
          { id: "A", type: "entry", name: "A" },
          { id: "B", type: "exit", name: "B" },
        ],
        [{ from: "A", to: "B", type: "open", bidirectional: true }],
      );
      assert.equal(nodeDegree(graph, "A"), 1);
    });
  });
});
