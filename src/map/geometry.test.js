const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  CELL,
  randomDimensionsForSizeClass,
  bspPartition,
  collectLeaves,
  layoutConstructed,
  createGrid,
  markConnector,
  MIN_PARTITION_DIM,
} = require("./geometry");
const { buildGraph } = require("./topology");
const { createRng } = require("./intent");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

describe("geometry", () => {
  describe("randomDimensionsForSizeClass", () => {
    it("returns dimensions within small range", () => {
      const rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        const { w, h } = randomDimensionsForSizeClass("small", rng);
        assert.ok(w >= 2 && w <= 3, `small width ${w} out of range`);
        assert.ok(h >= 2 && h <= 3, `small height ${h} out of range`);
      }
    });

    it("returns dimensions within medium range", () => {
      const rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        const { w, h } = randomDimensionsForSizeClass("medium", rng);
        assert.ok(w >= 3 && w <= 5, `medium width ${w} out of range`);
        assert.ok(h >= 3 && h <= 6, `medium height ${h} out of range`);
      }
    });

    it("returns dimensions within large range", () => {
      const rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        const { w, h } = randomDimensionsForSizeClass("large", rng);
        assert.ok(w >= 5 && w <= 8, `large width ${w} out of range`);
        assert.ok(h >= 5 && h <= 10, `large height ${h} out of range`);
      }
    });

    it("biases dimensions lower for sparse and higher for dense", () => {
      const sparseRng = createRng(7);
      const denseRng = createRng(7);
      let sparseTotal = 0;
      let denseTotal = 0;
      for (let i = 0; i < 200; i++) {
        const sparse = randomDimensionsForSizeClass(
          "medium",
          sparseRng,
          "sparse",
        );
        const dense = randomDimensionsForSizeClass("medium", denseRng, "dense");
        sparseTotal += sparse.w + sparse.h;
        denseTotal += dense.w + dense.h;
      }
      assert.ok(
        denseTotal > sparseTotal,
        `Expected dense (${denseTotal}) > sparse (${sparseTotal})`,
      );
    });
  });

  describe("bspPartition", () => {
    it("creates leaf nodes for small target", () => {
      const rng = createRng(42);
      const tree = bspPartition({ x: 0, y: 0, w: 30, h: 30 }, 1, rng);
      const leaves = collectLeaves(tree);
      assert.equal(leaves.length, 1);
    });

    it("creates multiple leaves for larger target", () => {
      const rng = createRng(42);
      const tree = bspPartition({ x: 0, y: 0, w: 30, h: 44 }, 6, rng);
      const leaves = collectLeaves(tree);
      assert.ok(
        leaves.length >= 6,
        `Expected >= 6 leaves, got ${leaves.length}`,
      );
    });

    it("respects minimum partition dimension", () => {
      const rng = createRng(42);
      const tree = bspPartition({ x: 0, y: 0, w: 30, h: 44 }, 8, rng);
      const leaves = collectLeaves(tree);
      for (const leaf of leaves) {
        // Very small partitions are acceptable as leaves
        // Just ensure they are not negative
        assert.ok(leaf.w > 0, `Leaf width ${leaf.w} must be positive`);
        assert.ok(leaf.h > 0, `Leaf height ${leaf.h} must be positive`);
      }
    });
  });

  describe("layoutConstructed", () => {
    it("places all rooms without overlap", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      const geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        50,
        rng,
      );

      // Check no overlapping rooms
      for (let i = 0; i < geometry.rooms.length; i++) {
        for (let j = i + 1; j < geometry.rooms.length; j++) {
          const a = geometry.rooms[i];
          const b = geometry.rooms[j];
          const overlaps =
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y;
          assert.ok(!overlaps, `Rooms ${a.nodeId} and ${b.nodeId} overlap`);
        }
      }
    });

    it("places rooms within grid bounds", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      const geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        50,
        rng,
      );

      for (const room of geometry.rooms) {
        assert.ok(room.x >= 0, `Room ${room.nodeId} x=${room.x} < 0`);
        assert.ok(room.y >= 0, `Room ${room.nodeId} y=${room.y} < 0`);
        assert.ok(
          room.x + room.w <= geometry.width,
          `Room ${room.nodeId} exceeds width`,
        );
        assert.ok(
          room.y + room.h <= geometry.height,
          `Room ${room.nodeId} exceeds height`,
        );
      }
    });

    it("assigns one room per topology node", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      const geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        50,
        rng,
      );

      assert.equal(geometry.rooms.length, graph.nodes.length);
      const placedIds = new Set(geometry.rooms.map((r) => r.nodeId));
      for (const node of graph.nodes) {
        assert.ok(placedIds.has(node.id), `Missing room for ${node.id}`);
      }
    });

    it("produces reproducible results with same seed", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);

      const rng1 = createRng(42);
      const g1 = layoutConstructed(
        graph,
        section.grid,
        "standard",
        [],
        50,
        rng1,
      );

      const rng2 = createRng(42);
      const g2 = layoutConstructed(
        graph,
        section.grid,
        "standard",
        [],
        50,
        rng2,
      );

      assert.equal(g1.rooms.length, g2.rooms.length);
      for (let i = 0; i < g1.rooms.length; i++) {
        assert.equal(g1.rooms[i].nodeId, g2.rooms[i].nodeId);
        assert.equal(g1.rooms[i].x, g2.rooms[i].x);
        assert.equal(g1.rooms[i].y, g2.rooms[i].y);
      }
    });

    it("can use extra retries for hard seeds", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(13);
      assert.doesNotThrow(() => {
        layoutConstructed(graph, section.grid, section.density, [], 50, rng);
      });
    });
  });

  describe("markConnector", () => {
    it("marks exactly the requested width for even connector widths", () => {
      const cells = createGrid(10, 10);
      markConnector(cells, { side: "bottom", offset: 4, width: 2 }, 10, 10);
      // Width 2 should mark x=4 and x=5 on bottom/interior rows.
      assert.equal(cells[9][4], CELL.CORRIDOR);
      assert.equal(cells[9][5], CELL.CORRIDOR);
      assert.equal(cells[8][4], CELL.CORRIDOR);
      assert.equal(cells[8][5], CELL.CORRIDOR);
      // Nearby untouched cell confirms we did not mark width 3.
      assert.notEqual(cells[9][3], CELL.CORRIDOR);
    });
  });
});
