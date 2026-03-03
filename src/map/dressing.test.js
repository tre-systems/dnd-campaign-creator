const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyDressing, pickRecipe, RECIPES } = require("./dressing");
const { CELL, layoutConstructed, createGrid } = require("./geometry");
const { routeCorridors } = require("./corridors");
const { buildGraph } = require("./topology");
const { createRng } = require("./intent");
const { createDwarvenComplexSection } = require("./fixtures/gatehouse-ruin");

describe("dressing", () => {
  describe("pickRecipe", () => {
    it("picks chapel for chapel rooms", () => {
      assert.equal(pickRecipe({ name: "Chapel", sizeClass: "medium" }), "chapel");
    });

    it("picks throne for throne rooms", () => {
      assert.equal(pickRecipe({ name: "Throne Room", sizeClass: "large" }), "throne");
    });

    it("picks crypt for crypt rooms", () => {
      assert.equal(pickRecipe({ name: "Crypt", sizeClass: "medium" }), "crypt");
    });

    it("picks well for well rooms", () => {
      assert.equal(pickRecipe({ name: "Well Room", sizeClass: "small" }), "well");
    });

    it("picks forge for forge rooms", () => {
      assert.equal(pickRecipe({ name: "Forge", sizeClass: "large" }), "forge");
    });

    it("picks pillars for gallery rooms", () => {
      assert.equal(pickRecipe({ name: "Gallery", sizeClass: "large" }), "pillars");
    });

    it("picks pillars for generic large rooms", () => {
      assert.equal(pickRecipe({ name: "Some Room", sizeClass: "large" }), "pillars");
    });

    it("returns null for small generic rooms", () => {
      assert.equal(pickRecipe({ name: "Pantry", sizeClass: "small" }), null);
    });
  });

  describe("RECIPES", () => {
    it("chapel places altar and pillars", () => {
      const rng = createRng(42);
      const room = { x: 2, y: 2, w: 5, h: 6 };
      const features = RECIPES.chapel(room, rng);
      assert.ok(features.some((f) => f.cell === CELL.ALTAR), "Should place altar");
      assert.ok(features.some((f) => f.cell === CELL.PILLAR), "Should place pillars");
    });

    it("well places well at center", () => {
      const room = { x: 2, y: 2, w: 3, h: 3 };
      const features = RECIPES.well(room);
      assert.equal(features.length, 1);
      assert.equal(features[0].cell, CELL.WELL);
      assert.equal(features[0].dx, 1);
      assert.equal(features[0].dy, 1);
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
      assert.ok(featureCount > 5, `Should have placed features, got ${featureCount}`);
    });

    it("does not overwrite non-floor cells", () => {
      const cells = createGrid(10, 10);
      // Make a 6x6 room
      for (let y = 2; y < 8; y++)
        for (let x = 2; x < 8; x++) cells[y][x] = CELL.FLOOR;
      // Place a door
      cells[2][4] = CELL.DOOR;

      const geometry = { width: 10, height: 10, cells, rooms: [{ x: 2, y: 2, w: 6, h: 6, nodeId: "R09" }] };
      const graph = {
        nodeMap: new Map([["R09", { id: "R09", name: "Chapel", sizeClass: "medium" }]]),
      };
      const rng = createRng(42);

      applyDressing(geometry, graph, rng);
      assert.equal(cells[2][4], CELL.DOOR, "Door should not be overwritten");
    });
  });
});
