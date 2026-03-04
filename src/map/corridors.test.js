const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  routeCorridors,
  bestWallPoint,
  bestWallPointForGrid,
  buildLPath,
  carveCorridorPath,
  placeDoor,
  edgeTypeToDoorCell,
  chooseDoorTypeForEdge,
  chooseGatedDoorPoint,
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

  describe("bestWallPointForGrid", () => {
    it("uses only floor-backed room edges when selecting wall points", () => {
      const cells = createGrid(14, 10);
      const room = { x: 3, y: 2, w: 5, h: 5 };
      const target = { x: 11, y: 3, w: 2, h: 2 };

      // Carve the room, then notch out its right interior edge.
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          cells[y][x] = CELL.FLOOR;
        }
      }
      cells[3][7] = CELL.WALL;
      cells[4][7] = CELL.WALL;
      cells[5][7] = CELL.WALL;

      const point = bestWallPointForGrid(room, target, cells);

      assert.notEqual(point.y, 3, "Should avoid notched non-floor-backed edge");
      assert.notEqual(point.y, 4, "Should avoid notched non-floor-backed edge");
      assert.notEqual(point.y, 5, "Should avoid notched non-floor-backed edge");
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
      cells[5][4] = CELL.FLOOR;
      cells[5][6] = CELL.CORRIDOR;
      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR);
      assert.equal(cells[5][5], CELL.DOOR);
    });

    it("places locked door", () => {
      const cells = createGrid(10, 10);
      cells[3][2] = CELL.FLOOR;
      cells[3][4] = CELL.CORRIDOR;
      placeDoor(cells, { x: 3, y: 3 }, CELL.DOOR_LOCKED);
      assert.equal(cells[3][3], CELL.DOOR_LOCKED);
    });

    it("places double door", () => {
      const cells = createGrid(10, 10);
      cells[4][3] = CELL.FLOOR;
      cells[4][5] = CELL.CORRIDOR;
      placeDoor(cells, { x: 4, y: 4 }, CELL.DOUBLE_DOOR);
      assert.equal(cells[4][4], CELL.DOUBLE_DOOR);
    });

    it("does not downgrade a locked threshold to a regular door", () => {
      const cells = createGrid(10, 10);
      cells[5][4] = CELL.FLOOR;
      cells[5][6] = CELL.CORRIDOR;

      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR_LOCKED);
      assert.equal(cells[5][5], CELL.DOOR_LOCKED);

      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR);
      assert.equal(cells[5][5], CELL.DOOR_LOCKED);
    });

    it("upgrades a regular threshold to locked when required", () => {
      const cells = createGrid(10, 10);
      cells[5][4] = CELL.FLOOR;
      cells[5][6] = CELL.CORRIDOR;

      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR);
      assert.equal(cells[5][5], CELL.DOOR);

      placeDoor(cells, { x: 5, y: 5 }, CELL.DOOR_LOCKED);
      assert.equal(cells[5][5], CELL.DOOR_LOCKED);
    });

    it("does not place door if threshold is not between room and passage", () => {
      const cells = createGrid(8, 8);
      cells[4][3] = CELL.FLOOR;
      // No adjacent corridor/door cell
      placeDoor(cells, { x: 4, y: 4 }, CELL.DOOR);
      assert.equal(cells[4][4], CELL.WALL);
    });

    it("handles out of bounds gracefully", () => {
      const cells = createGrid(5, 5);
      // Should not throw
      placeDoor(cells, { x: 10, y: 10 }, CELL.DOOR);
      placeDoor(cells, { x: -1, y: -1 }, CELL.DOOR);
    });
  });

  describe("routeCorridors", () => {
    it("chooses double doors for ceremonial large connections", () => {
      const edge = { type: "door", width: "standard" };
      const roomA = { sizeClass: "large", nodeType: "hub" };
      const roomB = { sizeClass: "large", nodeType: "faction-core" };
      assert.equal(chooseDoorTypeForEdge(edge, roomA, roomB), CELL.DOUBLE_DOOR);
    });

    it("places secret thresholds on the more concealed room side", () => {
      const pointA = { x: 5, y: 6 };
      const pointB = { x: 12, y: 6 };
      const edge = { type: "secret" };
      const roomA = { nodeType: "hub", sizeClass: "medium" };
      const roomB = { nodeType: "secret", sizeClass: "small" };

      const chosen = chooseGatedDoorPoint(edge, roomA, roomB, pointA, pointB);
      assert.deepEqual(chosen, pointB);
    });

    it("places locked thresholds on the defended side", () => {
      const pointA = { x: 4, y: 8 };
      const pointB = { x: 14, y: 8 };
      const edge = { type: "locked" };
      const roomA = { nodeType: "faction-core", sizeClass: "large" };
      const roomB = { nodeType: "standard", sizeClass: "medium" };

      const chosen = chooseGatedDoorPoint(edge, roomA, roomB, pointA, pointB);
      assert.deepEqual(chosen, pointA);
    });

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

    it("only places doors that bridge room floor and passage", () => {
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

      const doorTypes = new Set([
        CELL.DOOR,
        CELL.DOUBLE_DOOR,
        CELL.DOOR_LOCKED,
        CELL.DOOR_SECRET,
      ]);
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      let seenDoors = 0;
      for (let y = 0; y < geometry.height; y++) {
        for (let x = 0; x < geometry.width; x++) {
          if (!doorTypes.has(geometry.cells[y][x])) continue;
          seenDoors++;
          let adjacentFloor = 0;
          let adjacentPassage = 0;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (
              nx < 0 ||
              nx >= geometry.width ||
              ny < 0 ||
              ny >= geometry.height
            ) {
              continue;
            }
            const c = geometry.cells[ny][nx];
            if (c === CELL.FLOOR) adjacentFloor++;
            if (c === CELL.CORRIDOR || doorTypes.has(c)) adjacentPassage++;
          }

          assert.ok(
            adjacentFloor > 0 && adjacentPassage > 0,
            `Door at (${x},${y}) is not a valid room-passage threshold`,
          );
        }
      }

      assert.ok(
        seenDoors > 0,
        "Expected at least one door in the generated map",
      );
    });
  });
});
