/**
 * Corridor routing between rooms.
 * Connects rooms according to topology graph edges.
 *
 * @module map/corridors
 */

const { CELL } = require("./geometry");

/**
 * Map edge types to door cell types.
 *
 * @param {string} edgeType - Topology edge type
 * @returns {number|null} CELL constant for door, or null for no door
 */
function edgeTypeToDoorCell(edgeType) {
  switch (edgeType) {
    case "door":
      return CELL.DOOR;
    case "locked":
      return CELL.DOOR_LOCKED;
    case "secret":
      return CELL.DOOR_SECRET;
    default:
      return null;
  }
}

/**
 * Find the best wall point on a room facing the target room.
 *
 * @param {Object} room - Source PlacedRoom
 * @param {Object} target - Target PlacedRoom
 * @returns {{x: number, y: number, wall: string}} Connection point and wall direction
 */
function bestWallPoint(room, target) {
  const centerA = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const centerB = { x: target.x + target.w / 2, y: target.y + target.h / 2 };

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  // For small rooms (2-3 cells), use the full interior range.
  // For larger rooms, avoid corners by inset of 1.
  const yInset = room.h <= 3 ? 0 : 1;
  const xInset = room.w <= 3 ? 0 : 1;
  const minWallY = room.y + yInset;
  const maxWallY = room.y + room.h - 1 - yInset;
  const minWallX = room.x + xInset;
  const maxWallX = room.x + room.w - 1 - xInset;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      // Right wall
      const wallX = room.x + room.w;
      const wallY = clamp(Math.round(centerB.y), minWallY, maxWallY);
      return { x: wallX, y: wallY, wall: "right" };
    } else {
      // Left wall
      const wallX = room.x - 1;
      const wallY = clamp(Math.round(centerB.y), minWallY, maxWallY);
      return { x: wallX, y: wallY, wall: "left" };
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      // Bottom wall
      const wallY = room.y + room.h;
      const wallX = clamp(Math.round(centerB.x), minWallX, maxWallX);
      return { x: wallX, y: wallY, wall: "bottom" };
    } else {
      // Top wall
      const wallY = room.y - 1;
      const wallX = clamp(Math.round(centerB.x), minWallX, maxWallX);
      return { x: wallX, y: wallY, wall: "top" };
    }
  }
}

const DOOR_TYPES = new Set([
  CELL.DOOR,
  CELL.DOOR_LOCKED,
  CELL.DOOR_SECRET,
  CELL.DOUBLE_DOOR,
]);

const DOOR_PRIORITY = new Map([
  [CELL.DOOR, 1],
  [CELL.DOUBLE_DOOR, 2],
  [CELL.DOOR_LOCKED, 3],
  [CELL.DOOR_SECRET, 3],
]);

function inBounds(cells, x, y) {
  return y >= 0 && y < cells.length && x >= 0 && x < cells[0].length;
}

function isRoomFloorCell(cells, x, y) {
  return inBounds(cells, x, y) && cells[y][x] === CELL.FLOOR;
}

function collectWallCandidates(room, cells) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (x, y, wall, insideX, insideY) => {
    if (!inBounds(cells, x, y)) return;
    if (!isRoomFloorCell(cells, insideX, insideY)) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y, wall, insideX, insideY });
  };

  for (let y = room.y; y < room.y + room.h; y++) {
    addCandidate(room.x - 1, y, "left", room.x, y);
    addCandidate(room.x + room.w, y, "right", room.x + room.w - 1, y);
  }
  for (let x = room.x; x < room.x + room.w; x++) {
    addCandidate(x, room.y - 1, "top", x, room.y);
    addCandidate(x, room.y + room.h, "bottom", x, room.y + room.h - 1);
  }

  return candidates;
}

function preferredWall(room, target) {
  const centerA = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const centerB = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function chooseCandidate(candidates, room, target) {
  if (candidates.length === 0) return null;
  const centerB = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const preferred = preferredWall(room, target);

  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const wallPenalty = candidate.wall === preferred ? 0 : 8;
    const dist =
      Math.abs(candidate.x - centerB.x) + Math.abs(candidate.y - centerB.y);
    const score = dist + wallPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/**
 * Choose a wall point that is guaranteed to connect to playable room floor.
 * Falls back to geometric wall point selection if no floor-backed edge exists.
 *
 * @param {Object} room - Source room
 * @param {Object} target - Target room-like object
 * @param {number[][]} cells - Current geometry grid
 * @returns {{x:number,y:number,wall:string}}
 */
function bestWallPointForGrid(room, target, cells) {
  const candidates = collectWallCandidates(room, cells);
  const chosen = chooseCandidate(candidates, room, target);
  if (chosen) return { x: chosen.x, y: chosen.y, wall: chosen.wall };
  return bestWallPoint(room, target);
}

/**
 * Clamp a value to [min, max].
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Try to build a straight (non-L) path between two points.
 * Only succeeds if the points share an X or Y coordinate.
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @returns {{x: number, y: number}[]|null} Straight path or null
 */
function buildStraightPath(from, to) {
  if (from.x === to.x) {
    const path = [];
    const dir = to.y > from.y ? 1 : -1;
    for (let y = from.y; y !== to.y + dir; y += dir) {
      path.push({ x: from.x, y });
    }
    return path;
  }
  if (from.y === to.y) {
    const path = [];
    const dir = to.x > from.x ? 1 : -1;
    for (let x = from.x; x !== to.x + dir; x += dir) {
      path.push({ x, y: from.y });
    }
    return path;
  }
  return null;
}

/**
 * A* pathfinding to route a corridor between two points.
 * Prefers carving through WALL cells and avoids existing rooms.
 * Falls back to L-path if A* fails (e.g., grid too large).
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number[][]} cells - Grid state
 * @param {Function} rng - Fallback randomness for L-path
 * @returns {{x: number, y: number}[]} Path of grid coordinates
 */
function routeAStar(from, to, cells, rng) {
  const gridH = cells.length;
  const gridW = cells[0].length;
  const key = (x, y) => y * gridW + x;

  // Cost model: WALL is cheap (1), CORRIDOR is free (0), FLOOR is expensive (10)
  const moveCost = (x, y) => {
    if (x < 0 || x >= gridW || y < 0 || y >= gridH) return Infinity;
    const c = cells[y][x];
    if (c === CELL.WALL) return 1;
    if (c === CELL.CORRIDOR) return 0;
    return 10; // FLOOR or features — avoid cutting through rooms
  };

  const heuristic = (x, y) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  // Simple priority queue (array sorted on insert — fine for dungeon-scale grids)
  const open = [{ x: from.x, y: from.y, g: 0, f: heuristic(from.x, from.y) }];
  const gScore = new Map();
  const cameFrom = new Map();
  gScore.set(key(from.x, from.y), 0);

  const MAX_ITERATIONS = 5000;
  let iterations = 0;

  while (open.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    // Pop lowest f-score
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];

    if (current.x === to.x && current.y === to.y) {
      // Reconstruct path
      const path = [];
      let k = key(to.x, to.y);
      path.push({ x: to.x, y: to.y });
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.push(prev);
        k = key(prev.x, prev.y);
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const cost = moveCost(nx, ny);
      if (cost === Infinity) continue;

      const tentativeG = current.g + cost + 1; // +1 base step cost
      const nk = key(nx, ny);
      if (!gScore.has(nk) || tentativeG < gScore.get(nk)) {
        gScore.set(nk, tentativeG);
        cameFrom.set(nk, { x: current.x, y: current.y });
        open.push({
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny),
        });
      }
    }
  }

  // Fallback to L-path if A* exhausted
  return routeL(from, to, cells, rng);
}

/**
 * Generate an L-shaped path between two points.
 * Tries both orientations and returns the one with fewer room collisions.
 *
 * @param {{x: number, y: number}} pointA
 * @param {{x: number, y: number}} pointB
 * @param {number[][]} cells - Current grid state (for collision checking)
 * @param {Function} rng
 * @returns {{x: number, y: number}[]} Path of grid coordinates
 */
function routeL(pointA, pointB, cells, rng) {
  const pathHFirst = buildLPath(pointA, pointB, true);
  const pathVFirst = buildLPath(pointA, pointB, false);

  // Count collisions with existing rooms (FLOOR cells that we'd overwrite)
  const collisionsH = countCollisions(pathHFirst, cells);
  const collisionsV = countCollisions(pathVFirst, cells);

  if (collisionsH < collisionsV) return pathHFirst;
  if (collisionsV < collisionsH) return pathVFirst;
  return rng() < 0.5 ? pathHFirst : pathVFirst;
}

/**
 * Build an L-shaped path (two line segments meeting at a corner).
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {boolean} horizontalFirst - If true, go horizontal then vertical
 * @returns {{x: number, y: number}[]}
 */
function buildLPath(from, to, horizontalFirst) {
  const path = [];

  if (horizontalFirst) {
    // Horizontal segment
    const xDir = to.x > from.x ? 1 : -1;
    for (let x = from.x; x !== to.x; x += xDir) {
      path.push({ x, y: from.y });
    }
    // Vertical segment
    const yDir = to.y > from.y ? 1 : -1;
    for (let y = from.y; y !== to.y + yDir; y += yDir) {
      path.push({ x: to.x, y });
    }
  } else {
    // Vertical segment
    const yDir = to.y > from.y ? 1 : -1;
    for (let y = from.y; y !== to.y; y += yDir) {
      path.push({ x: from.x, y });
    }
    // Horizontal segment
    const xDir = to.x > from.x ? 1 : -1;
    for (let x = from.x; x !== to.x + xDir; x += xDir) {
      path.push({ x, y: to.y });
    }
  }

  return path;
}

/**
 * Count how many path cells would collide with existing floor cells.
 */
function countCollisions(path, cells) {
  let count = 0;
  for (const p of path) {
    if (
      p.y >= 0 &&
      p.y < cells.length &&
      p.x >= 0 &&
      p.x < cells[0].length &&
      cells[p.y][p.x] === CELL.FLOOR
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Carve a corridor path into the grid.
 * Only overwrites WALL cells (does not damage rooms or other corridors).
 *
 * @param {number[][]} cells - Grid
 * @param {{x: number, y: number}[]} path - Corridor path
 * @param {number} width - Corridor width in cells (1, 2, or 3)
 */
function carveCorridorPath(cells, path, width) {
  const gridH = cells.length;
  const gridW = cells[0].length;
  width = Math.max(1, Math.floor(width || 1));

  const rangeStart = -Math.floor((width - 1) / 2);
  const rangeEnd = rangeStart + width - 1;

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const prev = i > 0 ? path[i - 1] : null;
    const next = i < path.length - 1 ? path[i + 1] : null;

    const dx = next ? next.x - point.x : prev ? point.x - prev.x : 0;
    const dy = next ? next.y - point.y : prev ? point.y - prev.y : 0;

    const offsets = [];
    if (dx !== 0 && dy === 0) {
      // Horizontal run: expand in Y only.
      for (let oy = rangeStart; oy <= rangeEnd; oy++) offsets.push([0, oy]);
    } else if (dy !== 0 && dx === 0) {
      // Vertical run: expand in X only.
      for (let ox = rangeStart; ox <= rangeEnd; ox++) offsets.push([ox, 0]);
    } else {
      // Corner/degenerate case: fill a width x width patch.
      for (let oy = rangeStart; oy <= rangeEnd; oy++) {
        for (let ox = rangeStart; ox <= rangeEnd; ox++) offsets.push([ox, oy]);
      }
    }

    for (const [ox, oy] of offsets) {
      const nx = point.x + ox;
      const ny = point.y + oy;
      if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
        if (cells[ny][nx] === CELL.WALL) {
          cells[ny][nx] = CELL.CORRIDOR;
        }
      }
    }
  }
}

/**
 * Place a door cell at a specific position on the grid.
 *
 * @param {number[][]} cells - Grid
 * @param {{x: number, y: number}} point - Door position
 * @param {number} doorType - CELL constant (DOOR, DOUBLE_DOOR, DOOR_LOCKED, DOOR_SECRET)
 * @returns {boolean} true if a door was placed at the point
 */
function placeDoor(cells, point, doorType) {
  if (!inBounds(cells, point.x, point.y)) return false;

  const neighbours = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let adjacentFloor = 0;
  let adjacentPassage = 0;
  for (const [dx, dy] of neighbours) {
    const nx = point.x + dx;
    const ny = point.y + dy;
    if (!inBounds(cells, nx, ny)) continue;
    const c = cells[ny][nx];
    if (c === CELL.FLOOR) adjacentFloor++;
    if (c === CELL.CORRIDOR || DOOR_TYPES.has(c)) adjacentPassage++;
  }

  // Door cells should join room floor to passage space.
  if (adjacentFloor > 0 && adjacentPassage > 0) {
    const existing = cells[point.y][point.x];
    if (DOOR_TYPES.has(existing)) {
      const existingPriority = DOOR_PRIORITY.get(existing) || 0;
      const newPriority = DOOR_PRIORITY.get(doorType) || 0;
      if (newPriority > existingPriority) {
        cells[point.y][point.x] = doorType;
      }
      return true;
    }

    cells[point.y][point.x] = doorType;
    return true;
  }
  return false;
}

/**
 * Find a placed room by its node ID.
 *
 * @param {Object} geometry - Geometry object
 * @param {string} nodeId - Node ID to find
 * @returns {Object|null} PlacedRoom or null
 */
function findRoom(geometry, nodeId) {
  return geometry.rooms.find((r) => r.nodeId === nodeId) || null;
}

/**
 * Get corridor width from edge width class.
 *
 * @param {string} widthClass - 'tight', 'standard', or 'wide'
 * @returns {number} Width in grid cells
 */
function widthClassToCells(widthClass) {
  switch (widthClass) {
    case "tight":
      return 1;
    case "wide":
      return 2;
    default:
      return 1;
  }
}

/**
 * Resolve the concrete door symbol for a routed edge.
 * Keeps lock/secret semantics intact while allowing wider ceremonial thresholds.
 *
 * @param {Object} edge
 * @param {Object} roomA
 * @param {Object} roomB
 * @returns {number|null}
 */
function chooseDoorTypeForEdge(edge, roomA, roomB) {
  const base = edgeTypeToDoorCell(edge.type);
  if (base !== CELL.DOOR) return base;

  const largeConnection =
    roomA.sizeClass === "large" || roomB.sizeClass === "large";
  const ceremonialConnection =
    roomA.nodeType === "hub" ||
    roomB.nodeType === "hub" ||
    roomA.nodeType === "set-piece" ||
    roomB.nodeType === "set-piece" ||
    roomA.nodeType === "faction-core" ||
    roomB.nodeType === "faction-core";

  if ((largeConnection && ceremonialConnection) || edge.width === "wide") {
    return CELL.DOUBLE_DOOR;
  }
  return CELL.DOOR;
}

function gatePriority(room, edgeType) {
  const type = (room.nodeType || "").toLowerCase();
  let score = 0;

  if (edgeType === "secret") {
    if (type === "secret") score += 8;
    if (type === "hazard") score += 4;
    if (type === "resource") score += 2;
    if (room.sizeClass === "small") score += 1;
  } else if (edgeType === "locked") {
    if (type === "faction-core" || type === "set-piece" || type === "exit")
      score += 8;
    if (type === "hub") score += 3;
    if (room.sizeClass === "large") score += 1;
  }

  return score;
}

/**
 * Choose which side of a gated edge receives the lock/secret threshold.
 * Ties preserve edge-direction convention (destination side).
 *
 * @param {Object} edge
 * @param {Object} roomA
 * @param {Object} roomB
 * @param {{x:number,y:number}} pointA
 * @param {{x:number,y:number}} pointB
 * @returns {{x:number,y:number}}
 */
function chooseGatedDoorPoint(edge, roomA, roomB, pointA, pointB) {
  if (edge.type !== "locked" && edge.type !== "secret") {
    return pointB;
  }

  const scoreA = gatePriority(roomA, edge.type);
  const scoreB = gatePriority(roomB, edge.type);
  if (scoreA > scoreB) return pointA;
  return pointB;
}

/**
 * Resolve the interior anchor cell for a boundary connector.
 *
 * @param {Object} connector - Connector definition
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {{x: number, y: number}}
 */
function connectorAnchor(connector, width, height) {
  const offset = Math.max(0, Math.floor(connector.offset || 0));
  if (connector.side === "top") return { x: clamp(offset, 0, width - 1), y: 1 };
  if (connector.side === "bottom")
    return { x: clamp(offset, 0, width - 1), y: height - 2 };
  if (connector.side === "left")
    return { x: 1, y: clamp(offset, 0, height - 1) };
  if (connector.side === "right")
    return { x: width - 2, y: clamp(offset, 0, height - 1) };
  return { x: clamp(offset, 0, width - 1), y: 1 };
}

function nearestRoomForPoint(rooms, point) {
  let best = null;
  let bestDist = Infinity;
  for (const room of rooms) {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const dist = Math.abs(cx - point.x) + Math.abs(cy - point.y);
    if (dist < bestDist) {
      best = room;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Route corridors between all connected rooms.
 * Modifies the geometry in place.
 *
 * @param {Object} geometry - Geometry with placed rooms
 * @param {Object} graph - TopologyGraph with edges
 * @param {Function} rng - Seeded random function
 * @param {Object[]} [connectors=[]] - Boundary connector definitions
 * @returns {Object} Updated geometry with corridors carved into grid
 */
function routeCorridors(geometry, graph, rng, connectors) {
  connectors = Array.isArray(connectors) ? connectors : [];

  for (const edge of graph.edges) {
    const roomA = findRoom(geometry, edge.from);
    const roomB = findRoom(geometry, edge.to);

    if (!roomA || !roomB) {
      console.error(
        `Cannot route corridor: missing room for ${!roomA ? edge.from : edge.to}`,
      );
      continue;
    }

    // Find connection points on room walls
    const pointA = bestWallPointForGrid(roomA, roomB, geometry.cells);
    const pointB = bestWallPointForGrid(roomB, roomA, geometry.cells);

    // Route corridor using A* pathfinding for shortest natural path
    const path = routeAStar(pointA, pointB, geometry.cells, rng);

    // Carve corridor into grid
    const corridorWidth = widthClassToCells(edge.width);
    carveCorridorPath(geometry.cells, path, corridorWidth);

    // Place door(s) at room-wall transition points if this edge is gated.
    const placedDoorPositions = [];
    const doorType = chooseDoorTypeForEdge(edge, roomA, roomB);
    if (doorType !== null) {
      // Single door per connection, placed at the destination threshold.
      // Locked/secret edges choose the defensible side; regular doors use pointB.
      const doorPoint =
        edge.type === "locked" || edge.type === "secret"
          ? chooseGatedDoorPoint(edge, roomA, roomB, pointA, pointB)
          : pointB;
      if (placeDoor(geometry.cells, doorPoint, doorType)) {
        placedDoorPositions.push({
          x: doorPoint.x,
          y: doorPoint.y,
          type: edge.type,
        });
      } else if (placeDoor(geometry.cells, pointA, doorType)) {
        // Fallback to the other side if the preferred point failed
        placedDoorPositions.push({
          x: pointA.x,
          y: pointA.y,
          type: edge.type,
        });
      }

      for (const door of placedDoorPositions) {
        roomA.doorPositions.push(door);
        roomB.doorPositions.push(door);
      }
    }

    // Record corridor metadata
    geometry.corridors.push({
      from: edge.from,
      to: edge.to,
      path,
      doorPositions: placedDoorPositions,
    });
  }

  // Route each boundary connector into the nearest room to ensure section exits are playable.
  for (let i = 0; i < connectors.length; i++) {
    const connector = connectors[i];
    const anchor = connectorAnchor(connector, geometry.width, geometry.height);
    const targetRoom = nearestRoomForPoint(geometry.rooms, anchor);
    if (!targetRoom) continue;

    const roomPoint = bestWallPointForGrid(
      targetRoom,
      {
        x: anchor.x,
        y: anchor.y,
        w: 1,
        h: 1,
      },
      geometry.cells,
    );
    const path = routeL(anchor, roomPoint, geometry.cells, rng);
    const connectorWidth = Math.max(1, Math.floor(connector.width || 1));
    carveCorridorPath(geometry.cells, path, connectorWidth);
    geometry.corridors.push({
      from: `connector:${i + 1}`,
      to: targetRoom.nodeId,
      path,
      doorPositions: [],
      connector: true,
    });
  }

  return geometry;
}

module.exports = {
  routeCorridors,
  bestWallPoint,
  bestWallPointForGrid,
  buildLPath,
  carveCorridorPath,
  placeDoor,
  findRoom,
  edgeTypeToDoorCell,
  chooseDoorTypeForEdge,
  chooseGatedDoorPoint,
  widthClassToCells,
  connectorAnchor,
};
