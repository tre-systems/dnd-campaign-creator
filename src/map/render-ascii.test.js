const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { renderAscii, ASCII_MAP } = require("./render-ascii");
const { CELL, layoutConstructed, createGrid } = require("./geometry");
const { routeCorridors } = require("./corridors");
const { buildGraph } = require("./topology");
const { createRng } = require("./intent");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

describe("render-ascii", () => {
  describe("ASCII_MAP", () => {
    it("maps all CELL types to characters", () => {
      assert.equal(ASCII_MAP[CELL.WALL], "#");
      assert.equal(ASCII_MAP[CELL.FLOOR], ".");
      assert.equal(ASCII_MAP[CELL.CORRIDOR], ".");
      assert.equal(ASCII_MAP[CELL.DOOR], "+");
      assert.equal(ASCII_MAP[CELL.DOOR_LOCKED], "L");
      assert.equal(ASCII_MAP[CELL.DOOR_SECRET], "S");
      assert.equal(ASCII_MAP[CELL.STAIRS_DOWN], ">");
      assert.equal(ASCII_MAP[CELL.STAIRS_UP], "<");
      assert.equal(ASCII_MAP[CELL.PILLAR], "c");
      assert.equal(ASCII_MAP[CELL.TRAP], "T");
      assert.equal(ASCII_MAP[CELL.WATER], "~");
      assert.equal(ASCII_MAP[CELL.RUBBLE], ",");
      assert.equal(ASCII_MAP[CELL.TREASURE], "*");
    });
  });

  describe("renderAscii", () => {
    it("renders a simple grid correctly", () => {
      const cells = createGrid(5, 3);
      cells[1][1] = CELL.FLOOR;
      cells[1][2] = CELL.FLOOR;
      cells[1][3] = CELL.FLOOR;
      const geometry = {
        width: 5,
        height: 3,
        cells,
        rooms: [],
      };
      const ascii = renderAscii(geometry);
      const lines = ascii.split("\n");
      assert.equal(lines.length, 3);
      assert.equal(lines[0], "#####");
      assert.equal(lines[1], "#...#");
      assert.equal(lines[2], "#####");
    });

    it("dimensions match grid size", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      const geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        10,
        rng,
      );
      const ascii = renderAscii(geometry, graph);
      const lines = ascii.split("\n");
      assert.equal(lines.length, section.grid.height);
      assert.equal(lines[0].length, section.grid.width);
    });

    it("places room numbers at room centres", () => {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const rng = createRng(42);
      const geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        [],
        10,
        rng,
      );
      const ascii = renderAscii(geometry, graph);

      // Should contain digits 1-9 for the 9 rooms
      assert.ok(ascii.includes("1"), "Should have room number 1");
      assert.ok(ascii.includes("9"), "Should have room number 9");
    });

    it("skips room numbers when disabled", () => {
      const cells = createGrid(10, 10);
      // Make a room
      for (let y = 2; y < 6; y++)
        for (let x = 2; x < 6; x++) cells[y][x] = CELL.FLOOR;
      const geometry = {
        width: 10,
        height: 10,
        cells,
        rooms: [{ nodeId: "A", x: 2, y: 2, w: 4, h: 4 }],
      };
      const ascii = renderAscii(geometry, null, { showRoomNumbers: false });
      // Should not contain room number
      assert.ok(
        !ascii.includes("1"),
        "Should not have room number when disabled",
      );
    });

    it("renders door symbols", () => {
      const cells = createGrid(5, 3);
      cells[1][1] = CELL.FLOOR;
      cells[1][2] = CELL.DOOR;
      cells[1][3] = CELL.FLOOR;
      const geometry = { width: 5, height: 3, cells, rooms: [] };
      const ascii = renderAscii(geometry);
      assert.ok(ascii.includes("+"), "Should contain door symbol");
    });

    it("uses A-Z for rooms 10+", () => {
      const cells = createGrid(30, 30);
      const rooms = [];
      // Create 12 tiny rooms
      for (let i = 0; i < 12; i++) {
        const x = 2 + (i % 6) * 4;
        const y = 2 + Math.floor(i / 6) * 8;
        for (let ry = y; ry < y + 3; ry++)
          for (let rx = x; rx < x + 3; rx++) cells[ry][rx] = CELL.FLOOR;
        rooms.push({ nodeId: `R${i}`, x, y, w: 3, h: 3 });
      }
      const geometry = { width: 30, height: 30, cells, rooms };
      const ascii = renderAscii(geometry);
      // Room 10 should use 'A', room 11 'B', room 12 'C'
      assert.ok(ascii.includes("A"), "Room 10 should be labelled A");
      assert.ok(ascii.includes("B"), "Room 11 should be labelled B");
      assert.ok(ascii.includes("C"), "Room 12 should be labelled C");
    });

    it("uses AA after Z for room labels beyond 35", () => {
      const cells = createGrid(60, 60);
      const rooms = [];

      // Create 36 small rooms to force label AA (room index 35).
      for (let i = 0; i < 36; i++) {
        const x = 2 + (i % 6) * 9;
        const y = 2 + Math.floor(i / 6) * 9;
        for (let ry = y; ry < y + 5; ry++) {
          for (let rx = x; rx < x + 5; rx++) {
            cells[ry][rx] = CELL.FLOOR;
          }
        }
        rooms.push({ nodeId: `R${i}`, x, y, w: 5, h: 5 });
      }

      const geometry = { width: 60, height: 60, cells, rooms };
      const ascii = renderAscii(geometry);
      assert.ok(ascii.includes("Z"), "Room 35 should be labelled Z");
      assert.ok(ascii.includes("AA"), "Room 36 should be labelled AA");
    });
  });
});
