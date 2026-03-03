/**
 * Dungeon dressing: place thematic features inside rooms.
 * Adds pillars, statues, altars, wells, firepits, etc. to the grid
 * based on room type and size class.
 *
 * @module map/dressing
 */

const { CELL } = require("./geometry");

/**
 * Feature placement recipes keyed by room node type.
 * Each recipe is a function(room, rng) that returns an array of {dx, dy, cell}
 * where dx/dy are offsets from room top-left corner.
 */
const RECIPES = {
  /**
   * Chapel: altar at the far end, pillars lining the sides.
   */
  chapel(room, rng) {
    const features = [];
    // Altar at the far (bottom) wall, centered
    const altarX = Math.floor(room.w / 2);
    const altarY = room.h - 1;
    features.push({ dx: altarX, dy: altarY, cell: CELL.ALTAR });
    // Pillars along sides if room is wide enough
    if (room.w >= 4 && room.h >= 4) {
      for (let y = 1; y < room.h - 1; y += 2) {
        features.push({ dx: 0, dy: y, cell: CELL.PILLAR });
        features.push({ dx: room.w - 1, dy: y, cell: CELL.PILLAR });
      }
    }
    return features;
  },

  /**
   * Throne room: throne at far wall, pillars flanking.
   */
  throne(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    features.push({ dx: cx, dy: room.h - 1, cell: CELL.THRONE });
    // Flanking pillars
    if (room.w >= 5) {
      features.push({ dx: 1, dy: room.h - 1, cell: CELL.PILLAR });
      features.push({ dx: room.w - 2, dy: room.h - 1, cell: CELL.PILLAR });
    }
    // Column rows
    if (room.w >= 5 && room.h >= 5) {
      for (let y = 1; y < room.h - 2; y += 2) {
        features.push({ dx: 1, dy: y, cell: CELL.PILLAR });
        features.push({ dx: room.w - 2, dy: y, cell: CELL.PILLAR });
      }
    }
    return features;
  },

  /**
   * Crypt: sarcophagi in rows.
   */
  crypt(room, rng) {
    const features = [];
    if (room.w >= 3 && room.h >= 3) {
      const cx = Math.floor(room.w / 2);
      for (let y = 1; y < room.h - 1; y += 2) {
        features.push({ dx: cx, dy: y, cell: CELL.SARCOPHAGUS });
      }
    }
    return features;
  },

  /**
   * Well room: central well.
   */
  well(room) {
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    return [{ dx: cx, dy: cy, cell: CELL.WELL }];
  },

  /**
   * Forge: firepit and anvil area.
   */
  forge(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    features.push({ dx: cx, dy: cy, cell: CELL.FIREPIT });
    if (room.w >= 4) {
      features.push({ dx: 0, dy: cy, cell: CELL.PILLAR });
      features.push({ dx: room.w - 1, dy: cy, cell: CELL.PILLAR });
    }
    return features;
  },

  /**
   * Gallery / great hall: pillar grid.
   */
  pillars(room, rng) {
    const features = [];
    if (room.w >= 4 && room.h >= 4) {
      const stepX = room.w <= 5 ? 2 : 3;
      const stepY = room.h <= 5 ? 2 : 3;
      for (let y = 1; y < room.h - 1; y += stepY) {
        for (let x = 1; x < room.w - 1; x += stepX) {
          features.push({ dx: x, dy: y, cell: CELL.PILLAR });
        }
      }
    }
    return features;
  },

  /**
   * Library: statue (bookcase proxy).
   */
  library(room, rng) {
    const features = [];
    // Statues along one wall
    if (room.w >= 3) {
      for (let x = 0; x < room.w; x += 2) {
        features.push({ dx: x, dy: 0, cell: CELL.STATUE });
      }
    }
    return features;
  },

  /**
   * Generic: scatter a couple of random features.
   */
  scatter(room, rng) {
    const features = [];
    if (room.w < 3 || room.h < 3) return features;
    const pool = [CELL.PILLAR, CELL.STATUE, CELL.PILLAR, CELL.PILLAR];
    const count = Math.min(2, Math.floor((room.w * room.h) / 8));
    for (let i = 0; i < count; i++) {
      const dx = 1 + Math.floor(rng() * (room.w - 2));
      const dy = 1 + Math.floor(rng() * (room.h - 2));
      features.push({ dx, dy, cell: pool[Math.floor(rng() * pool.length)] });
    }
    return features;
  },
};

/**
 * Map node names / types to dressing recipes.
 */
function pickRecipe(node) {
  const name = (node.name || "").toLowerCase();
  if (name.includes("chapel") || name.includes("shrine")) return "chapel";
  if (name.includes("throne")) return "throne";
  if (name.includes("crypt") || name.includes("tomb")) return "crypt";
  if (name.includes("well")) return "well";
  if (name.includes("forge") || name.includes("smelt")) return "forge";
  if (
    name.includes("gallery") ||
    name.includes("great hall") ||
    (name.includes("hall") && node.sizeClass === "large")
  )
    return "pillars";
  if (name.includes("library") || name.includes("scriptorium"))
    return "library";
  // Large rooms get pillars by default
  if (node.sizeClass === "large") return "pillars";
  return null;
}

/**
 * Apply dungeon dressing features to rooms on the grid.
 *
 * @param {Object} geometry - Geometry with cells and rooms
 * @param {Object} graph - TopologyGraph with nodeMap
 * @param {Function} rng - Seeded random function
 * @returns {Object} geometry (mutated - features placed on cells)
 */
function applyDressing(geometry, graph, rng) {
  for (const room of geometry.rooms) {
    const node = graph.nodeMap.get(room.nodeId);
    if (!node) continue;

    let recipeName = pickRecipe(node);
    // Small chance of scatter dressing for rooms without a specific recipe
    if (!recipeName && room.w >= 3 && room.h >= 3 && rng() < 0.3) {
      recipeName = "scatter";
    }
    if (!recipeName) continue;

    const recipe = RECIPES[recipeName];
    if (!recipe) continue;

    const placements = recipe(room, rng);
    for (const p of placements) {
      const gx = room.x + p.dx;
      const gy = room.y + p.dy;
      // Only place on FLOOR cells (don't overwrite doors, corridors, etc.)
      if (
        gy >= 0 &&
        gy < geometry.height &&
        gx >= 0 &&
        gx < geometry.width &&
        geometry.cells[gy][gx] === CELL.FLOOR
      ) {
        geometry.cells[gy][gx] = p.cell;
      }
    }
  }

  return geometry;
}

module.exports = { applyDressing, RECIPES, pickRecipe };
