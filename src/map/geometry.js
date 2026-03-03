/**
 * Grid geometry and BSP room placement.
 * Layer 3 of the four-layer map system.
 *
 * @module map/geometry
 */

/**
 * Cell type constants for the 2D grid.
 */
const CELL = {
  WALL: 0,
  FLOOR: 1,
  CORRIDOR: 2,
  DOOR: 3,
  DOOR_LOCKED: 4,
  DOOR_SECRET: 5,
  STAIRS_DOWN: 6,
  STAIRS_UP: 7,
  PILLAR: 8,
  TRAP: 9,
  WATER: 10,
  RUBBLE: 11,
  TREASURE: 12,
  // Traditional dungeon dressing (classic D&D cartography symbols)
  PORTCULLIS: 13,
  ARCHWAY: 14,
  CURTAIN: 15,
  STATUE: 16,
  ALTAR: 17,
  WELL: 18,
  FIREPIT: 19,
  THRONE: 20,
  SARCOPHAGUS: 21,
  BARS: 22,
  PIT: 23,
  LEVER: 24,
  FOUNTAIN: 25,
  COLLAPSED: 26,
  DOUBLE_DOOR: 27,
};

/** Minimum partition dimension to fit a room + walls + corridor space */
const MIN_PARTITION_DIM = 5;

/**
 * Size class dimension ranges (inclusive).
 * Tuned for 10ft-per-square old-school style maps.
 */
const SIZE_RANGES = {
  small: { minW: 2, maxW: 3, minH: 2, maxH: 3 },
  medium: { minW: 3, maxW: 5, minH: 3, maxH: 6 },
  large: { minW: 5, maxW: 8, minH: 5, maxH: 10 },
};

/**
 * Generate random room dimensions for a given size class.
 *
 * @param {string} sizeClass - 'small', 'medium', or 'large'
 * @param {Function} rng - Seeded random function returning [0, 1)
 * @param {string} [density='standard'] - 'sparse', 'standard', or 'dense'
 * @returns {{w: number, h: number}}
 */
function randomDimensionsForSizeClass(sizeClass, rng, density) {
  density = density || "standard";
  const range = SIZE_RANGES[sizeClass] || SIZE_RANGES.medium;
  const pick = (min, max) => {
    const span = max - min;
    if (density === "sparse") {
      return min + Math.floor(rng() * (Math.floor(span / 2) + 1));
    }
    if (density === "dense") {
      const denseMin = min + Math.floor(span / 2);
      return denseMin + Math.floor(rng() * (max - denseMin + 1));
    }
    return min + Math.floor(rng() * (span + 1));
  };
  let w = pick(range.minW, range.maxW);
  let h = pick(range.minH, range.maxH);
  // Constrain aspect ratio to at most 2:1 for natural-looking rooms
  if (w > h * 2) w = h * 2;
  if (h > w * 2) h = w * 2;
  return { w, h };
}

/**
 * Recursively partition an area using BSP.
 *
 * @param {{x: number, y: number, w: number, h: number}} area - Partition area
 * @param {number} targetRooms - How many rooms should fit in this partition
 * @param {Function} rng - Seeded random function
 * @returns {Object} BSP tree node
 */
function bspPartition(area, targetRooms, rng) {
  // Base case: single room
  if (targetRooms <= 1) {
    return { area, left: null, right: null };
  }

  // Choose split direction (prefer splitting the longer axis)
  let splitAxis;
  if (area.w > area.h * 1.25) {
    splitAxis = "vertical";
  } else if (area.h > area.w * 1.25) {
    splitAxis = "horizontal";
  } else {
    splitAxis = rng() < 0.5 ? "vertical" : "horizontal";
  }

  // Split position: 35-65% of the dimension for variety
  const splitRatio = 0.35 + rng() * 0.3;

  if (splitAxis === "vertical") {
    const splitPos = Math.floor(area.x + area.w * splitRatio);
    const leftW = splitPos - area.x;
    const rightW = area.w - leftW;

    if (leftW < MIN_PARTITION_DIM || rightW < MIN_PARTITION_DIM) {
      return { area, left: null, right: null };
    }

    const leftRooms = Math.ceil(targetRooms * splitRatio);
    const rightRooms = targetRooms - leftRooms;

    return {
      area,
      splitAxis,
      splitPos,
      left: bspPartition(
        { x: area.x, y: area.y, w: leftW, h: area.h },
        Math.max(1, leftRooms),
        rng,
      ),
      right: bspPartition(
        { x: splitPos, y: area.y, w: rightW, h: area.h },
        Math.max(1, rightRooms),
        rng,
      ),
    };
  } else {
    const splitPos = Math.floor(area.y + area.h * splitRatio);
    const topH = splitPos - area.y;
    const bottomH = area.h - topH;

    if (topH < MIN_PARTITION_DIM || bottomH < MIN_PARTITION_DIM) {
      return { area, left: null, right: null };
    }

    const leftRooms = Math.ceil(targetRooms * splitRatio);
    const rightRooms = targetRooms - leftRooms;

    return {
      area,
      splitAxis,
      splitPos,
      left: bspPartition(
        { x: area.x, y: area.y, w: area.w, h: topH },
        Math.max(1, leftRooms),
        rng,
      ),
      right: bspPartition(
        { x: area.x, y: splitPos, w: area.w, h: bottomH },
        Math.max(1, rightRooms),
        rng,
      ),
    };
  }
}

/**
 * Collect all leaf partitions from a BSP tree.
 *
 * @param {Object} node - BSP tree node
 * @returns {Object[]} Array of leaf partition areas
 */
function collectLeaves(node) {
  if (!node) return [];
  if (!node.left && !node.right) {
    return [node.area];
  }
  return [...collectLeaves(node.left), ...collectLeaves(node.right)];
}

/**
 * Place a room inside a partition with margin for walls and corridors.
 *
 * @param {{nodeId: string, w: number, h: number, sizeClass: string}} roomSpec
 * @param {{x: number, y: number, w: number, h: number}} partition
 * @param {Function} rng
 * @param {string} [density='standard']
 * @returns {Object|null} PlacedRoom or null if room cannot fit
 */
function placeRoomInPartition(roomSpec, partition, rng, density) {
  density = density || "standard";
  const marginByDensity = { sparse: 2, standard: 1, dense: 1 };
  const margin = marginByDensity[density] || 2;
  const maxW = partition.w - margin * 2;
  const maxH = partition.h - margin * 2;

  // Clamp room dimensions to fit the partition
  const w = Math.min(roomSpec.w, maxW);
  const h = Math.min(roomSpec.h, maxH);

  if (w < 2 || h < 2) {
    return null;
  }

  // Random position within the partition (respecting margins)
  const rangeX = maxW - w;
  const rangeY = maxH - h;
  const x =
    partition.x + margin + (rangeX > 0 ? Math.floor(rng() * (rangeX + 1)) : 0);
  const y =
    partition.y + margin + (rangeY > 0 ? Math.floor(rng() * (rangeY + 1)) : 0);

  return {
    nodeId: roomSpec.nodeId,
    x,
    y,
    w,
    h,
    sizeClass: roomSpec.sizeClass,
    doorPositions: [],
  };
}

/**
 * Create an empty 2D grid filled with WALL cells.
 *
 * @param {number} width
 * @param {number} height
 * @returns {number[][]}
 */
function createGrid(width, height) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    cells.push(new Array(width).fill(CELL.WALL));
  }
  return cells;
}

/**
 * Fill a room area with FLOOR cells on the grid.
 * For larger rooms, optionally carves an L-shape by removing a corner notch.
 *
 * @param {number[][]} cells - Grid
 * @param {Object} room - PlacedRoom
 * @param {Function} [rng] - Seeded random function (if provided, may carve L-shapes)
 */
function fillRoomFloor(cells, room, rng) {
  // Determine if this room gets an L-shaped notch
  let notch = null;
  if (rng && room.w >= 4 && room.h >= 4 && rng() < 0.35) {
    // Carve a notch from one corner (30-50% of each dimension)
    const nw = 1 + Math.floor(rng() * Math.floor(room.w * 0.4));
    const nh = 1 + Math.floor(rng() * Math.floor(room.h * 0.4));
    const corner = Math.floor(rng() * 4); // 0=TL, 1=TR, 2=BL, 3=BR
    switch (corner) {
      case 0: notch = { x: room.x, y: room.y, w: nw, h: nh }; break;
      case 1: notch = { x: room.x + room.w - nw, y: room.y, w: nw, h: nh }; break;
      case 2: notch = { x: room.x, y: room.y + room.h - nh, w: nw, h: nh }; break;
      case 3: notch = { x: room.x + room.w - nw, y: room.y + room.h - nh, w: nw, h: nh }; break;
    }
    room.notch = notch;
  }

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      // Skip cells inside the notch
      if (notch && x >= notch.x && x < notch.x + notch.w && y >= notch.y && y < notch.y + notch.h) {
        continue;
      }
      cells[y][x] = CELL.FLOOR;
    }
  }
}

/**
 * Mark connector positions on the grid edges.
 *
 * @param {number[][]} cells - Grid
 * @param {Object} connector - Connector definition
 * @param {number} gridWidth
 * @param {number} gridHeight
 */
function markConnector(cells, connector, gridWidth, gridHeight) {
  const side = connector.side;
  const offset = connector.offset;
  const width = Math.max(1, Math.floor(connector.width || 1));
  const start = offset - Math.floor((width - 1) / 2);

  for (let i = 0; i < width; i++) {
    const pos = start + i;
    if (side === "top") {
      const x = Math.min(Math.max(pos, 0), gridWidth - 1);
      cells[0][x] = CELL.CORRIDOR;
      cells[1][x] = CELL.CORRIDOR;
    } else if (side === "bottom") {
      const x = Math.min(Math.max(pos, 0), gridWidth - 1);
      cells[gridHeight - 1][x] = CELL.CORRIDOR;
      cells[gridHeight - 2][x] = CELL.CORRIDOR;
    } else if (side === "left") {
      const y = Math.min(Math.max(pos, 0), gridHeight - 1);
      cells[y][0] = CELL.CORRIDOR;
      cells[y][1] = CELL.CORRIDOR;
    } else if (side === "right") {
      const y = Math.min(Math.max(pos, 0), gridHeight - 1);
      cells[y][gridWidth - 1] = CELL.CORRIDOR;
      cells[y][gridWidth - 2] = CELL.CORRIDOR;
    }
  }
}

/**
 * Place rooms on a grid using BSP partitioning.
 *
 * @param {Object} graph - TopologyGraph
 * @param {{width: number, height: number}} gridSize - Max grid dimensions
 * @param {string} density - 'sparse', 'standard', or 'dense'
 * @param {Object[]} connectors - Boundary connector definitions
 * @param {number} [maxAttempts=50] - Retry count for failed layouts
 * @param {Function} rng - Seeded random function
 * @returns {Object} Geometry with grid, rooms, and corridors array (empty)
 */
function layoutConstructed(
  graph,
  gridSize,
  density,
  connectors,
  maxAttempts,
  rng,
) {
  maxAttempts = maxAttempts || 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Step 1: Compute room dimensions from topology
      const roomSpecs = graph.nodes.map((node) => {
        const dims = randomDimensionsForSizeClass(node.sizeClass, rng, density);
        return {
          nodeId: node.id,
          w: dims.w,
          h: dims.h,
          sizeClass: node.sizeClass,
        };
      });

      // Step 2: BSP partition the usable area (1-cell border margin)
      const usableArea = {
        x: 1,
        y: 1,
        w: gridSize.width - 2,
        h: gridSize.height - 2,
      };
      const tree = bspPartition(usableArea, roomSpecs.length, rng);

      // Step 3: Collect leaf partitions and assign rooms
      const partitions = collectLeaves(tree);

      // Sort both by area descending (largest room -> largest partition)
      const sortedSpecs = [...roomSpecs].sort((a, b) => b.w * b.h - a.w * a.h);
      const sortedPartitions = [...partitions].sort(
        (a, b) => b.w * b.h - a.w * a.h,
      );

      // If we have fewer partitions than rooms, retry
      if (sortedPartitions.length < sortedSpecs.length) {
        continue;
      }

      // Step 4: Place rooms in partitions
      const rooms = [];
      for (let i = 0; i < sortedSpecs.length; i++) {
        const room = placeRoomInPartition(
          sortedSpecs[i],
          sortedPartitions[i],
          rng,
          density,
        );
        if (!room) {
          throw new Error("Room does not fit in partition");
        }
        rooms.push(room);
      }

      // Step 5: Build the grid
      const cells = createGrid(gridSize.width, gridSize.height);
      for (const room of rooms) {
        fillRoomFloor(cells, room, rng);
      }

      // Step 6: Mark connectors
      if (connectors) {
        for (const connector of connectors) {
          markConnector(cells, connector, gridSize.width, gridSize.height);
        }
      }

      return {
        width: gridSize.width,
        height: gridSize.height,
        cells,
        rooms,
        corridors: [],
      };
    } catch {
      // Retry with different random splits
      continue;
    }
  }

  throw new Error(
    `Failed to generate layout after ${maxAttempts} attempts. Try increasing grid size or reducing room count.`,
  );
}

/**
 * Check if a cell type represents walkable floor.
 *
 * @param {number} cell - CELL constant
 * @returns {boolean}
 */
function isFloorLike(cell) {
  return cell !== CELL.WALL;
}

module.exports = {
  CELL,
  SIZE_RANGES,
  MIN_PARTITION_DIM,
  randomDimensionsForSizeClass,
  bspPartition,
  collectLeaves,
  placeRoomInPartition,
  createGrid,
  fillRoomFloor,
  markConnector,
  layoutConstructed,
  isFloorLike,
};
