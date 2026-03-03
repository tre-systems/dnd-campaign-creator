const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  routeCorridors,
  bestWallPoint,
  buildLPath,
  carveCorridorPath,
  placeDoor,
  edgeTypeToDoorCell,
  widthClassToCells,
} = require("./corridors");
const { CELL, layoutConstructed, createGrid } = require("./geometry");
const { buildGraph } = require("./topology");
const { createRng } = require("./intent");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

describe("corridors", () => {
  describe("edgeTypeToDoorCell", () => {
    it("maps door to CELL.DOOR", () => {
      assert.equal(edgeTypeToDoorCell("door"), CELL.DOOR);
    });

    it("maps locked to CELL.DOOR_LOCKED", () => {
      assert.equal(edgeTypeToDoorCell("locked"), CELL.DOOR_LOCKED);
    });

    it("maps secret to CELL.DOOR_SECRET", () => {
      assert.equal(edgeTypeToDoorCell("secret"), CELL.DOOR_SECRET);
    });

    it("returns null for open edges", () => {
      assert.equal(edgeTypeToDoorCell("open"), null);
    });

    it("returns null for other types", () => {
      assert.equal(edgeTypeToDoorCell("one-way"), null);
      assert.equal(edgeTypeToDoorCell("vertical"), null);
    });
  });

  describe("widthClassToCells", () => {
    it("returns 1 for tight", () => {
      assert.equal(widthClassToCells("tight"), 1);
    });

    it("returns 1 for standard (10ft corridor)", () => {
      assert.equal(widthClassToCells("standard"), 1);
    });

    it("returns 2 for wide (20ft corridor)", () => {
      assert.equal(widthClassToCells("wide"), 2);
    });
  });

  describe("bestWallPoint", () => {
    it("picks right wall when target is to the right", () => {
      const room = { x: 2, y: 2, w: 5, h: 5 };
      const target = { x: 15, y: 3, w: 5, h: 5 };
      const point = bestWallPoint(room, target);
      assert.equal(point.wall, "right");
      assert.equal(point.x, room.x + room.w);
    });

    it("picks left wall when target is to the left", () => {
      const room = { x: 15, y: 2, w: 5, h: 5 };
      const target = { x: 2, y: 3, w: 5, h: 5 };
      const point = bestWallPoint(room, target);
      assert.equal(point.wall, "left");
      assert.equal(point.x, room.x - 1);
    });

    it("picks bottom wall when target is below", () => {
      const room = { x: 5, y: 2, w: 5, h: 5 };
      const target = { x: 5, y: 15, w: 5, h: 5 };
      const point = bestWallPoint(room, target);
      assert.equal(point.wall, "bottom");
      assert.equal(point.y, room.y + room.h);
    });

    it("picks top wall when target is above", () => {
      const room = { x: 5, y: 15, w: 5, h: 5 };
      const target = { x: 5, y: 2, w: 5, h: 5 };
      const point = bestWallPoint(room, target);
      assert.equal(point.wall, "top");
      assert.equal(point.y, room.y - 1);
    });
  });

  describe("buildLPath", () => {
    it("builds horizontal-first L path", () => {
      const path = buildLPath({ x: 0, y: 0 }, { x: 5, y: 3 }, true);
      assert.ok(path.length > 0, "Path should not be empty");
      // First cell
      assert.equal(path[0].x, 0);
      assert.equal(path[0].y, 0);
      // Last cell
      const last = path[path.length - 1];
      assert.equal(last.x, 5);
      assert.equal(last.y, 3);
    });

    it("builds vertical-first L path", () => {
      const path = buildLPath({ x: 0, y: 0 }, { x: 5, y: 3 }, false);
      assert.ok(path.length > 0, "Path should not be empty");
      const last = path[path.length - 1];
      assert.equal(last.x, 5);
      assert.equal(last.y, 3);
    });

    it("handles same-row points", () => {
      const path = buildLPath({ x: 0, y: 5 }, { x: 10, y: 5 }, true);
      // All points should be on y=5
      for (const p of path) {
        assert.equal(p.y, 5);
      }
    });
  });

  describe("carveCorridorPath", () => {
    it("carves corridor cells on wall-only cells", () => {
      const cells = createGrid(10, 10);
      const path = [
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
      ];
      carveCorridorPath(cells, path, 1);
      assert.equal(cells[5][2], CELL.CORRIDOR);
      assert.equal(cells[5][3], CELL.CORRIDOR);
      assert.equal(cells[5][4], CELL.CORRIDOR);
    });

    it("does not overwrite floor cells", () => {
      const cells = createGrid(10, 10);
      cells[5][3] = CELL.FLOOR;
      const path = [
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
      ];
      carveCorridorPath(cells, path, 1);
      assert.equal(cells[5][3], CELL.FLOOR, "Should not overwrite floor");
    });

    it("respects grid bounds", () => {
      const cells = createGrid(5, 5);
      const path = [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ];
      // Should not throw even with width=3
      carveCorridorPath(cells, path, 3);
      assert.equal(cells[0][0], CELL.CORRIDOR);
    });

    it("carves a 2-cell-wide horizontal corridor for standard width", () => {
      const cells = createGrid(8, 8);
      const path = [
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ];
      carveCorridorPath(cells, path, 2);
      // Width=2 should affect both row 4 and row 5 along the horizontal run.
      assert.equal(cells[4][2], CELL.CORRIDOR);
      assert.equal(cells[5][2], CELL.CORRIDOR);
      assert.equal(cells[4][4], CELL.CORRIDOR);
      assert.equal(cells[5][4], CELL.CORRIDOR);
    });
  });

  describe("placeDoor", () => {
    it("places door at given position", () => {
      const cells = createGrid(10, 10);
      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR);
      assert.equal(cells[5][5], CELL.DOOR);
    });

    it("places locked door", () => {
      const cells = createGrid(10, 10);
      placeDoor(cells, { x: 3, y: 3 }, CELL.DOOR_LOCKED);
      assert.equal(cells[3][3], CELL.DOOR_LOCKED);
    });

    it("handles out of bounds gracefully", () => {
      const cells = createGrid(5, 5);
      // Should not throw
      placeDoor(cells, { x: 10, y: 10 }, CELL.DOOR);
      placeDoor(cells, { x: -1, y: -1 }, CELL.DOOR);
    });
  });

  describe("routeCorridors", () => {
    it("routes corridors for gatehouse section", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        10,
        rng,
      );

      geometry = routeCorridors(geometry, graph, rng);

      // Should have corridor records for all edges
      assert.equal(
        geometry.corridors.length,
        graph.edges.length,
        `Expected ${graph.edges.length} corridors, got ${geometry.corridors.length}`,
      );
    });

    it("places doors for door/locked/secret edges", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        10,
        rng,
      );

      geometry = routeCorridors(geometry, graph, rng);

      // Count edges that should have doors
      const doorEdges = graph.edges.filter(
        (e) => e.type === "door" || e.type === "locked" || e.type === "secret",
      );
      const corridorsWithDoors = geometry.corridors.filter(
        (c) => c.doorPositions.length > 0,
      );
      assert.equal(
        corridorsWithDoors.length,
        doorEdges.length,
        `Expected ${doorEdges.length} corridors with doors`,
      );
    });

    it("carves corridor cells into the grid", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        10,
        rng,
      );

      geometry = routeCorridors(geometry, graph, rng);

      // Check that at least some corridor cells exist in the grid
      let corridorCount = 0;
      for (let y = 0; y < geometry.height; y++) {
        for (let x = 0; x < geometry.width; x++) {
          if (geometry.cells[y][x] === CELL.CORRIDOR) corridorCount++;
        }
      }
      assert.ok(corridorCount > 0, "Should have carved corridor cells");
    });

    it("routes boundary connectors into the nearest room", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        10,
        rng,
      );

      geometry = routeCorridors(geometry, graph, rng, section.connectors);
      const connectorCorridors = geometry.corridors.filter((c) => c.connector);
      assert.equal(
        connectorCorridors.length,
        section.connectors.length,
        "Each connector should have one routed connector corridor",
      );
    });
  });
});
