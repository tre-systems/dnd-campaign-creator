const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyDressing,
  pickRecipe,
  RECIPES,
  transitionCellForNode,
} = require("./dressing");
const { CELL, layoutConstructed, createGrid } = require("./geometry");
const { routeCorridors } = require("./corridors");
const { buildGraph } = require("./topology");
const { createRng } = require("./intent");
const { createDwarvenComplexSection } = require("./fixtures/gatehouse-ruin");

describe("dressing", () => {
  describe("pickRecipe", () => {
    it("picks chapel for chapel rooms", () => {
      assert.equal(
        pickRecipe({ name: "Chapel", sizeClass: "medium" }),
        "chapel",
      );
    });

    it("picks throne for throne rooms", () => {
      assert.equal(
        pickRecipe({ name: "Throne Room", sizeClass: "large" }),
        "throne",
      );
    });

    it("picks crypt for crypt rooms", () => {
      assert.equal(pickRecipe({ name: "Crypt", sizeClass: "medium" }), "crypt");
    });

    it("picks well for well rooms", () => {
      assert.equal(
        pickRecipe({ name: "Well Room", sizeClass: "small" }),
        "well",
      );
    });

    it("picks forge for forge rooms", () => {
      assert.equal(pickRecipe({ name: "Forge", sizeClass: "large" }), "forge");
    });

    it("picks pillars for gallery rooms", () => {
      assert.equal(
        pickRecipe({ name: "Gallery", sizeClass: "large" }),
        "pillars",
      );
    });

    it("picks pillars for generic large rooms", () => {
      assert.equal(
        pickRecipe({ name: "Some Room", sizeClass: "large" }),
        "pillars",
      );
    });

    it("picks guardpost for guard rooms", () => {
      assert.equal(
        pickRecipe({ type: "guard", name: "Guard Post", sizeClass: "medium" }),
        "guardpost",
      );
    });

    it("picks armoury for armoury rooms", () => {
      assert.equal(
        pickRecipe({ name: "Armoury", sizeClass: "small" }),
        "armoury",
      );
    });

    it("picks vault for secret treasury rooms", () => {
      assert.equal(
        pickRecipe({
          type: "secret",
          name: "Old Treasury",
          sizeClass: "small",
        }),
        "vault",
      );
    });

    it("picks hazard recipe for hazard nodes", () => {
      assert.equal(
        pickRecipe({ type: "hazard", name: "Trap Hall", sizeClass: "medium" }),
        "hazard",
      );
    });

    it("returns null for small generic rooms", () => {
      assert.equal(pickRecipe({ name: "Pantry", sizeClass: "small" }), null);
    });

    it("uses ordered dressing for generic medium rooms", () => {
      assert.equal(
        pickRecipe({ name: "Antechamber", sizeClass: "medium" }),
        "ordered",
      );
    });
  });

  describe("transitionCellForNode", () => {
    it("defaults entry and exit nodes to stairs up/down", () => {
      assert.equal(
        transitionCellForNode({ type: "entry", name: "Collapsed Gate" }),
        CELL.STAIRS_UP,
      );
      assert.equal(
        transitionCellForNode({ type: "exit", name: "Old Tunnel" }),
        CELL.STAIRS_DOWN,
      );
    });

    it("uses explicit direction hints over node-type defaults", () => {
      assert.equal(
        transitionCellForNode({ type: "exit", name: "Upper Lift" }),
        CELL.STAIRS_UP,
      );
      assert.equal(
        transitionCellForNode({ type: "entry", name: "Abyss Descent" }),
        CELL.STAIRS_DOWN,
      );
    });
  });

  describe("RECIPES", () => {
    it("chapel places altar and pillars", () => {
      const rng = createRng(42);
      const room = { x: 2, y: 2, w: 5, h: 6 };
      const features = RECIPES.chapel(room, rng);
      assert.ok(
        features.some((f) => f.cell === CELL.ALTAR),
        "Should place altar",
      );
      assert.ok(
        features.some((f) => f.cell === CELL.PILLAR),
        "Should place pillars",
      );
    });

    it("well places well at center", () => {
      const room = { x: 2, y: 2, w: 3, h: 3 };
      const features = RECIPES.well(room);
      assert.equal(features.length, 1);
      assert.equal(features[0].cell, CELL.WELL);
      assert.equal(features[0].dx, 1);
      assert.equal(features[0].dy, 1);
    });

    it("guardpost places portcullis and lever", () => {
      const room = { x: 2, y: 2, w: 5, h: 4 };
      const features = RECIPES.guardpost(room, createRng(3));
      assert.ok(features.some((f) => f.cell === CELL.PORTCULLIS));
      assert.ok(features.some((f) => f.cell === CELL.LEVER));
    });

    it("vault includes treasure and trap language", () => {
      const room = { x: 1, y: 1, w: 6, h: 6 };
      const features = RECIPES.vault(room, createRng(5));
      assert.ok(features.some((f) => f.cell === CELL.TREASURE));
      assert.ok(features.some((f) => f.cell === CELL.PIT));
      assert.ok(features.some((f) => f.cell === CELL.BARS));
    });
  });

  describe("applyDressing", () => {
    it("places features on the dwarven complex", () => {
      const section = createDwarvenComplexSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        50,
        rng,
      );
      geometry = routeCorridors(geometry, graph, rng, section.connectors);
      geometry = applyDressing(geometry, graph, rng);

      // Count feature cells
      let featureCount = 0;
      for (let y = 0; y < geometry.height; y++) {
        for (let x = 0; x < geometry.width; x++) {
          const c = geometry.cells[y][x];
          if (c !== CELL.WALL && c !== CELL.FLOOR && c !== CELL.CORRIDOR) {
            featureCount++;
          }
        }
      }
      assert.ok(
        featureCount > 5,
        `Should have placed features, got ${featureCount}`,
      );
    });

    it("places stair symbols in entry and exit rooms", () => {
      const section = createDwarvenComplexSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(41);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        50,
        rng,
      );
      geometry = routeCorridors(geometry, graph, rng, section.connectors);
      geometry = applyDressing(geometry, graph, rng);

      const entryRoom = geometry.rooms.find((r) => r.nodeId === "E1");
      const exitRoom = geometry.rooms.find((r) => r.nodeId === "X1");

      const roomHasCell = (room, cellType) => {
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            if (geometry.cells[y][x] === cellType) return true;
          }
        }
        return false;
      };

      assert.ok(
        roomHasCell(entryRoom, CELL.STAIRS_UP),
        "Entry room should include STAIRS_UP",
      );
      assert.ok(
        roomHasCell(exitRoom, CELL.STAIRS_DOWN),
        "Exit room should include STAIRS_DOWN",
      );
    });

    it("does not overwrite non-floor cells", () => {
      const cells = createGrid(10, 10);
      // Make a 6x6 room
      for (let y = 2; y < 8; y++)
        for (let x = 2; x < 8; x++) cells[y][x] = CELL.FLOOR;
      // Place a door
      cells[2][4] = CELL.DOOR;

      const geometry = {
        width: 10,
        height: 10,
        cells,
        rooms: [{ x: 2, y: 2, w: 6, h: 6, nodeId: "R09" }],
      };
      const graph = {
        nodeMap: new Map([
          ["R09", { id: "R09", name: "Chapel", sizeClass: "medium" }],
        ]),
      };
      const rng = createRng(42);

      applyDressing(geometry, graph, rng);
      assert.equal(cells[2][4], CELL.DOOR, "Door should not be overwritten");
    });

    it("keeps doorway ingress lanes clear of blocking features", () => {
      const cells = createGrid(14, 14);
      for (let y = 3; y < 11; y++) {
        for (let x = 3; x < 11; x++) cells[y][x] = CELL.FLOOR;
      }
      // Top doorway into the room.
      cells[2][7] = CELL.DOOR;
      cells[1][7] = CELL.CORRIDOR;

      const room = {
        x: 3,
        y: 3,
        w: 8,
        h: 8,
        nodeId: "R01",
        doorPositions: [{ x: 7, y: 2, type: "door" }],
      };
      const geometry = { width: 14, height: 14, cells, rooms: [room] };
      const graph = {
        nodeMap: new Map([
          ["R01", { id: "R01", name: "Great Hall", sizeClass: "large" }],
        ]),
      };

      applyDressing(geometry, graph, createRng(11));

      // Inside-door ingress and immediate lane to center should remain passable floor.
      assert.equal(cells[3][7], CELL.FLOOR);
      assert.equal(cells[4][7], CELL.FLOOR);
      assert.equal(cells[5][7], CELL.FLOOR);
    });

    it("relocates blocked recipe anchors to nearby valid tiles", () => {
      const cells = createGrid(12, 12);
      for (let y = 3; y < 8; y++) {
        for (let x = 3; x < 8; x++) cells[y][x] = CELL.FLOOR;
      }
      cells[2][5] = CELL.DOOR;
      cells[1][5] = CELL.CORRIDOR;

      const room = {
        x: 3,
        y: 3,
        w: 5,
        h: 5,
        nodeId: "R02",
        doorPositions: [{ x: 5, y: 2, type: "door" }],
      };
      const geometry = { width: 12, height: 12, cells, rooms: [room] };
      const graph = {
        nodeMap: new Map([
          ["R02", { id: "R02", name: "Well Room", sizeClass: "small" }],
        ]),
      };

      applyDressing(geometry, graph, createRng(17));

      let wells = [];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (cells[y][x] === CELL.WELL) wells.push({ x, y });
        }
      }

      assert.equal(wells.length, 1, "Expected one relocated well placement");
      assert.notDeepEqual(
        wells[0],
        { x: 5, y: 5 },
        "Well should move off reserved center lane",
      );
    });
  });
});
