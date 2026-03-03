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

function key(x, y) {
  return `${x},${y}`;
}

function inBounds(geometry, x, y) {
  return y >= 0 && y < geometry.height && x >= 0 && x < geometry.width;
}

function isInRoom(room, x, y) {
  return (
    x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h
  );
}

function markKeepout(keepout, room, x, y) {
  if (isInRoom(room, x, y)) {
    keepout.add(key(x, y));
  }
}

function markDoorIngressKeepout(geometry, room, keepout) {
  if (!Array.isArray(room.doorPositions) || room.doorPositions.length === 0) {
    return;
  }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const ingress = [];

  for (const door of room.doorPositions) {
    if (!inBounds(geometry, door.x, door.y)) continue;
    markKeepout(keepout, room, door.x, door.y);

    for (const [dx, dy] of dirs) {
      const nx = door.x + dx;
      const ny = door.y + dy;
      if (!isInRoom(room, nx, ny)) continue;
      if (!inBounds(geometry, nx, ny)) continue;
      if (geometry.cells[ny][nx] !== CELL.FLOOR) continue;

      ingress.push({ x: nx, y: ny });
      markKeepout(keepout, room, nx, ny);
      // Keep one tile of breathing room around ingress cells so features don't crowd doors.
      markKeepout(keepout, room, nx + 1, ny);
      markKeepout(keepout, room, nx - 1, ny);
      markKeepout(keepout, room, nx, ny + 1);
      markKeepout(keepout, room, nx, ny - 1);
    }
  }

  if (ingress.length === 0) return;

  const centerX = room.x + Math.floor(room.w / 2);
  const centerY = room.y + Math.floor(room.h / 2);

  // Reserve a direct line from each doorway ingress toward room center.
  for (const start of ingress) {
    let x = start.x;
    let y = start.y;
    markKeepout(keepout, room, x, y);

    while (x !== centerX) {
      x += centerX > x ? 1 : -1;
      markKeepout(keepout, room, x, y);
    }
    while (y !== centerY) {
      y += centerY > y ? 1 : -1;
      markKeepout(keepout, room, x, y);
    }
  }
}

function canPlaceAt(geometry, room, x, y, keepout, occupied) {
  if (!isInRoom(room, x, y)) return false;
  if (!inBounds(geometry, x, y)) return false;
  if (geometry.cells[y][x] !== CELL.FLOOR) return false;
  const k = key(x, y);
  if (keepout.has(k)) return false;
  if (occupied.has(k)) return false;
  return true;
}

function choosePlacementCell(
  geometry,
  room,
  targetX,
  targetY,
  keepout,
  occupied,
) {
  if (canPlaceAt(geometry, room, targetX, targetY, keepout, occupied)) {
    return { x: targetX, y: targetY };
  }

  const centerX = room.x + Math.floor(room.w / 2);
  const centerY = room.y + Math.floor(room.h / 2);
  const maxRadius = Math.max(room.w, room.h);
  let best = null;
  let bestScore = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let y = targetY - r; y <= targetY + r; y++) {
      for (let x = targetX - r; x <= targetX + r; x++) {
        const dist = Math.abs(x - targetX) + Math.abs(y - targetY);
        if (dist !== r) continue;
        if (!canPlaceAt(geometry, room, x, y, keepout, occupied)) continue;

        const centerDist = Math.abs(x - centerX) + Math.abs(y - centerY);
        const score = dist * 10 + centerDist;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }

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

    const keepout = new Set();
    const occupied = new Set();
    markDoorIngressKeepout(geometry, room, keepout);

    const placements = recipe(room, rng);
    for (const p of placements) {
      const desiredX = room.x + p.dx;
      const desiredY = room.y + p.dy;
      const chosen = choosePlacementCell(
        geometry,
        room,
        desiredX,
        desiredY,
        keepout,
        occupied,
      );
      if (!chosen) continue;
      geometry.cells[chosen.y][chosen.x] = p.cell;
      occupied.add(key(chosen.x, chosen.y));
    }
  }

  return geometry;
}

module.exports = { applyDressing, RECIPES, pickRecipe };
