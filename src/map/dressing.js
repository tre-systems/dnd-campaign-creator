/**
 * Dungeon dressing: place thematic features inside rooms.
 * Adds pillars, statues, altars, wells, firepits, etc. to the grid
 * based on room type and size class.
 *
 * @module map/dressing
 */

const { CELL } = require("./geometry");

const UP_TRANSITION_HINT = /\b(up|upper|ascent|ascend|rise|surface|lift)\b/i;
const DOWN_TRANSITION_HINT =
  /\b(down|lower|descent|abyss|deep|under|shaft|chasm|sink)\b/i;

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
   * Colonnade: two rows of columns lining the long walls of a hall.
   */
  colonnade(room, rng) {
    const features = [];
    if (room.w < 4 || room.h < 4) return features;
    // Place columns one cell in from each long side
    const isWide = room.w >= room.h;
    if (isWide) {
      const step = room.w <= 6 ? 2 : 3;
      for (let x = 1; x < room.w - 1; x += step) {
        features.push({ dx: x, dy: 1, cell: CELL.PILLAR });
        features.push({ dx: x, dy: room.h - 2, cell: CELL.PILLAR });
      }
    } else {
      const step = room.h <= 6 ? 2 : 3;
      for (let y = 1; y < room.h - 1; y += step) {
        features.push({ dx: 1, dy: y, cell: CELL.PILLAR });
        features.push({ dx: room.w - 2, dy: y, cell: CELL.PILLAR });
      }
    }
    return features;
  },

  /**
   * Ring: columns arranged in a circle for round rooms.
   */
  ring(room, rng) {
    const features = [];
    const minDim = Math.min(room.w, room.h);
    if (minDim < 5) return features;
    const cx = (room.w - 1) / 2;
    const cy = (room.h - 1) / 2;
    const radius = Math.min(cx, cy) - 1;
    // Place 4-8 pillars in a ring
    const count = minDim >= 8 ? 8 : minDim >= 6 ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dx = Math.round(cx + Math.cos(angle) * radius);
      const dy = Math.round(cy + Math.sin(angle) * radius);
      if (dx >= 1 && dx < room.w - 1 && dy >= 1 && dy < room.h - 1) {
        features.push({ dx, dy, cell: CELL.PILLAR });
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
   * Guard room: gate control with a portcullis and lever.
   */
  guardpost(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    features.push({ dx: cx, dy: 0, cell: CELL.PORTCULLIS });
    if (room.h >= 3) {
      features.push({ dx: Math.max(1, cx - 1), dy: 1, cell: CELL.LEVER });
    }
    if (room.w >= 5) {
      features.push({ dx: room.w - 2, dy: room.h - 1, cell: CELL.BARS });
    }
    return features;
  },

  /**
   * Armoury: barred racks and a central statue marker.
   */
  armoury(room, rng) {
    const features = [];
    if (room.w >= 3 && room.h >= 3) {
      for (let x = 1; x < room.w - 1; x += 2) {
        features.push({ dx: x, dy: 1, cell: CELL.BARS });
      }
      features.push({
        dx: Math.floor(room.w / 2),
        dy: Math.floor(room.h / 2),
        cell: CELL.STATUE,
      });
    }
    return features;
  },

  /**
   * Treasury / vault: trapped hoard chamber.
   */
  vault(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    features.push({ dx: cx, dy: cy, cell: CELL.TREASURE });
    if (room.w >= 4 && room.h >= 4) {
      features.push({ dx: cx, dy: Math.max(1, cy - 1), cell: CELL.PIT });
      features.push({ dx: Math.max(1, cx - 1), dy: cy, cell: CELL.BARS });
      features.push({
        dx: Math.min(room.w - 2, cx + 1),
        dy: cy,
        cell: CELL.BARS,
      });
    }
    return features;
  },

  /**
   * Prison cells: dense bar pattern.
   */
  prison(room, rng) {
    const features = [];
    if (room.w >= 3 && room.h >= 3) {
      for (let y = 1; y < room.h - 1; y += 2) {
        for (let x = 1; x < room.w - 1; x += 2) {
          features.push({ dx: x, dy: y, cell: CELL.BARS });
        }
      }
    }
    return features;
  },

  /**
   * Hazard room: trap, trigger, and unstable patch.
   */
  hazard(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    features.push({ dx: cx, dy: cy, cell: CELL.PIT });
    if (room.w >= 3 && room.h >= 3) {
      features.push({ dx: Math.max(1, room.w - 2), dy: 1, cell: CELL.LEVER });
      features.push({
        dx: 1,
        dy: Math.max(1, room.h - 2),
        cell: CELL.COLLAPSED,
      });
    }
    return features;
  },

  /**
   * Fountain/cistern room: central fountain with surrounding water.
   */
  fountain(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    features.push({ dx: cx, dy: cy, cell: CELL.FOUNTAIN });
    if (room.w >= 4 && room.h >= 4) {
      features.push({ dx: cx, dy: Math.max(1, cy - 1), cell: CELL.WATER });
      features.push({
        dx: Math.min(room.w - 2, cx + 1),
        dy: cy,
        cell: CELL.WATER,
      });
      features.push({
        dx: Math.max(1, cx - 1),
        dy: cy,
        cell: CELL.WATER,
      });
      features.push({
        dx: cx,
        dy: Math.min(room.h - 2, cy + 1),
        cell: CELL.WATER,
      });
    }
    return features;
  },

  /**
   * Collapsed room: unstable floor and rubble markers.
   */
  collapsed(room, rng) {
    const features = [];
    const cx = Math.floor(room.w / 2);
    const cy = Math.floor(room.h / 2);
    features.push({ dx: cx, dy: cy, cell: CELL.COLLAPSED });
    if (room.w >= 4 && room.h >= 4) {
      features.push({ dx: Math.max(1, cx - 1), dy: cy, cell: CELL.RUBBLE });
      features.push({
        dx: Math.min(room.w - 2, cx + 1),
        dy: cy,
        cell: CELL.RUBBLE,
      });
      features.push({ dx: cx, dy: Math.max(1, cy - 1), cell: CELL.RUBBLE });
    }
    return features;
  },

  /**
   * Generic: scatter a couple of random features.
   */
  scatter(room, rng) {
    const features = [];
    if (room.w < 3 || room.h < 3) return features;
    const pool = [
      CELL.PILLAR,
      CELL.PILLAR,
      CELL.PILLAR,
      CELL.STATUE,
      CELL.TRAP,
      CELL.ARCHWAY,
      CELL.CURTAIN,
      CELL.LEVER,
    ];
    const count = Math.min(4, Math.max(1, Math.floor((room.w * room.h) / 6)));
    const placed = new Set();
    for (let i = 0; i < count; i++) {
      const dx = 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const dy = 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      const key = `${dx},${dy}`;
      if (placed.has(key)) continue;
      placed.add(key);
      features.push({ dx, dy, cell: pool[Math.floor(rng() * pool.length)] });
    }
    return features;
  },
};

/**
 * Map node names / types to dressing recipes.
 * @param {Object} node - Topology node
 * @param {Object} [room] - Geometry room (optional, for shape/size info)
 */
function pickRecipe(node, room) {
  const name = (node.name || "").toLowerCase();
  const type = (node.type || "").toLowerCase();
  if (type === "guard" || name.includes("guard post")) return "guardpost";
  if (name.includes("armoury") || name.includes("armory")) return "armoury";
  if (name.includes("vault") || name.includes("treasury")) return "vault";
  if (name.includes("prison") || name.includes("cell")) return "prison";
  if (
    name.includes("fountain") ||
    name.includes("cistern") ||
    name.includes("pool")
  )
    return "fountain";
  if (
    name.includes("collapsed") ||
    name.includes("ruin") ||
    name.includes("chasm") ||
    name.includes("rift")
  )
    return "collapsed";
  if (type === "hazard") return "hazard";
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
  if (type === "secret") return "vault";
  // Circular rooms get ring of columns
  if (room && room.shape === "circle" && node.sizeClass !== "small")
    return "ring";
  // Large rooms: colonnade for elongated halls, pillar grid for square rooms
  if (node.sizeClass === "large" && room) {
    const ratio =
      Math.max(room.w, room.h) / Math.max(1, Math.min(room.w, room.h));
    return ratio >= 1.5 ? "colonnade" : "pillars";
  }
  if (node.sizeClass === "large") return "pillars";
  // Medium rooms get scatter features to add visual interest
  if (node.sizeClass === "medium") return "scatter";
  return null;
}

function transitionCellForNode(node) {
  const type = (node.type || "").toLowerCase();
  const name = node.name || "";
  const hasUpHint = UP_TRANSITION_HINT.test(name);
  const hasDownHint = DOWN_TRANSITION_HINT.test(name);

  if (hasUpHint && !hasDownHint) return CELL.STAIRS_UP;
  if (hasDownHint && !hasUpHint) return CELL.STAIRS_DOWN;

  if (type === "entry") return CELL.STAIRS_UP;
  if (type === "exit") return CELL.STAIRS_DOWN;
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

function placeTransitionSymbols(geometry, graph) {
  const occupied = new Set();

  for (const room of geometry.rooms) {
    const node = graph.nodeMap.get(room.nodeId);
    if (!node) continue;

    const transitionCell = transitionCellForNode(node);
    if (transitionCell === null) continue;

    const keepout = new Set();
    markDoorIngressKeepout(geometry, room, keepout);
    const targetX = room.x + Math.floor(room.w / 2);
    const targetY = room.y + Math.floor(room.h / 2);
    const chosen = choosePlacementCell(
      geometry,
      room,
      targetX,
      targetY,
      keepout,
      occupied,
    );
    if (!chosen) continue;
    geometry.cells[chosen.y][chosen.x] = transitionCell;
    occupied.add(key(chosen.x, chosen.y));
  }
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
  placeTransitionSymbols(geometry, graph);

  for (const room of geometry.rooms) {
    const node = graph.nodeMap.get(room.nodeId);
    if (!node) continue;

    let recipeName = pickRecipe(node, room);
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

module.exports = { applyDressing, RECIPES, pickRecipe, transitionCellForNode };
