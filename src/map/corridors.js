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

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      // Right wall
      const wallX = room.x + room.w;
      const wallY = clamp(
        Math.round(centerB.y),
        room.y + 1,
        room.y + room.h - 2,
      );
      return { x: wallX, y: wallY, wall: "right" };
    } else {
      // Left wall
      const wallX = room.x - 1;
      const wallY = clamp(
        Math.round(centerB.y),
        room.y + 1,
        room.y + room.h - 2,
      );
      return { x: wallX, y: wallY, wall: "left" };
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      // Bottom wall
      const wallY = room.y + room.h;
      const wallX = clamp(
        Math.round(centerB.x),
        room.x + 1,
        room.x + room.w - 2,
      );
      return { x: wallX, y: wallY, wall: "bottom" };
    } else {
      // Top wall
      const wallY = room.y - 1;
      const wallX = clamp(
        Math.round(centerB.x),
        room.x + 1,
        room.x + room.w - 2,
      );
      return { x: wallX, y: wallY, wall: "top" };
    }
  }
}

/**
 * Clamp a value to [min, max].
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
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

    const dx = next
      ? next.x - point.x
      : prev
        ? point.x - prev.x
        : 0;
    const dy = next
      ? next.y - point.y
      : prev
        ? point.y - prev.y
        : 0;

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
 * @param {number} doorType - CELL constant (DOOR, DOOR_LOCKED, DOOR_SECRET)
 */
function placeDoor(cells, point, doorType) {
  if (
    point.y >= 0 &&
    point.y < cells.length &&
    point.x >= 0 &&
    point.x < cells[0].length
  ) {
    cells[point.y][point.x] = doorType;
  }
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
      return 3;
    default:
      return 2;
  }
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
  if (connector.side === "left") return { x: 1, y: clamp(offset, 0, height - 1) };
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
    const pointA = bestWallPoint(roomA, roomB);
    const pointB = bestWallPoint(roomB, roomA);

    // Route L-shaped corridor
    const path = routeL(pointA, pointB, geometry.cells, rng);

    // Carve corridor into grid
    const corridorWidth = widthClassToCells(edge.width);
    carveCorridorPath(geometry.cells, path, corridorWidth);

    // Place door at room A's wall if edge type has a door
    const doorType = edgeTypeToDoorCell(edge.type);
    if (doorType !== null) {
      placeDoor(geometry.cells, pointA, doorType);
      roomA.doorPositions.push({
        x: pointA.x,
        y: pointA.y,
        type: edge.type,
      });
    }

    // Record corridor metadata
    geometry.corridors.push({
      from: edge.from,
      to: edge.to,
      path,
      doorPositions: doorType
        ? [{ x: pointA.x, y: pointA.y, type: edge.type }]
        : [],
    });
  }

  // Route each boundary connector into the nearest room to ensure section exits are playable.
  for (let i = 0; i < connectors.length; i++) {
    const connector = connectors[i];
    const anchor = connectorAnchor(connector, geometry.width, geometry.height);
    const targetRoom = nearestRoomForPoint(geometry.rooms, anchor);
    if (!targetRoom) continue;

    const roomPoint = bestWallPoint(targetRoom, {
      x: anchor.x,
      y: anchor.y,
      w: 1,
      h: 1,
    });
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
  buildLPath,
  carveCorridorPath,
  placeDoor,
  findRoom,
  edgeTypeToDoorCell,
  widthClassToCells,
  connectorAnchor,
};
