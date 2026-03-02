/**
 * ASCII text map renderer.
 * Simple grid-to-text conversion for terminal and markdown contexts.
 *
 * @module map/render-ascii
 */

const { CELL } = require("./geometry");

/**
 * Map cell types to ASCII characters.
 */
const ASCII_MAP = {
  [CELL.WALL]: "#",
  [CELL.FLOOR]: ".",
  [CELL.CORRIDOR]: ".",
  [CELL.DOOR]: "+",
  [CELL.DOOR_LOCKED]: "L",
  [CELL.DOOR_SECRET]: "S",
  [CELL.STAIRS_DOWN]: ">",
  [CELL.STAIRS_UP]: "<",
  [CELL.PILLAR]: "c",
  [CELL.TRAP]: "T",
  [CELL.WATER]: "~",
  [CELL.RUBBLE]: ",",
  [CELL.TREASURE]: "*",
  [CELL.PORTCULLIS]: "P",
  [CELL.ARCHWAY]: "A",
  [CELL.CURTAIN]: "C",
  [CELL.STATUE]: "s",
  [CELL.ALTAR]: "a",
  [CELL.WELL]: "w",
  [CELL.FIREPIT]: "f",
  [CELL.THRONE]: "t",
  [CELL.SARCOPHAGUS]: "=",
  [CELL.BARS]: "|",
  [CELL.PIT]: "O",
  [CELL.LEVER]: "!",
  [CELL.FOUNTAIN]: "F",
  [CELL.COLLAPSED]: "x",
  [CELL.DOUBLE_DOOR]: "D",
};

/**
 * Render a dungeon map as ASCII text.
 *
 * @param {Object} geometry - Geometry with cells grid
 * @param {Object} [graph] - Optional TopologyGraph for room labels
 * @param {Object} [options] - Rendering options
 * @param {boolean} [options.showRoomNumbers=true] - Place room numbers at room centres
 * @returns {string} ASCII map string
 */
function renderAscii(geometry, graph, options) {
  const showRoomNumbers = !options || options.showRoomNumbers !== false;

  // Build a copy of the grid as characters
  const charGrid = [];
  for (let y = 0; y < geometry.height; y++) {
    const row = [];
    for (let x = 0; x < geometry.width; x++) {
      row.push(ASCII_MAP[geometry.cells[y][x]] || "?");
    }
    charGrid.push(row);
  }

  // Overlay room numbers at the centre of each room
  if (showRoomNumbers && geometry.rooms) {
    for (let i = 0; i < geometry.rooms.length; i++) {
      const room = geometry.rooms[i];
      const cx = Math.floor(room.x + room.w / 2);
      const cy = Math.floor(room.y + room.h / 2);
      // Use 1-9, then A-Z for rooms 10+
      const label = i < 9 ? String(i + 1) : String.fromCharCode(65 + i - 9);
      if (cy >= 0 && cy < geometry.height && cx >= 0 && cx < geometry.width) {
        charGrid[cy][cx] = label;
      }
    }
  }

  return charGrid.map((row) => row.join("")).join("\n");
}

module.exports = { renderAscii, ASCII_MAP };
