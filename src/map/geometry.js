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
const MIN_PARTITION_DIM = 4;

/**
 * Size class dimension ranges (inclusive).
 * Tuned for 10ft-per-square old-school style maps.
 */
const SIZE_RANGES = {
  small: { minW: 2, maxW: 3, minH: 2, maxH: 3 },
  medium: { minW: 3, maxW: 5, minH: 3, maxH: 6 },
  large: { minW: 5, maxW: 8, minH: 5, maxH: 10 },
};

const ROOM_SHAPE = {
  RECT: "rect",
  NOTCHED: "notched",
  CHAMFERED: "chamfered",
  CROSS: "cross",
  CAVE: "cave",
  CIRCLE: "circle",
};

const CAVE_NAME_HINTS = [
  "cave",
  "grotto",
  "chasm",
  "rift",
  "sink",
  "tunnel",
  "warren",
  "den",
  "catacomb",
  "cistern",
  "flood",
  "sanctum",
  "pit",
];

const CIRCLE_NAME_HINTS = [
  "tower",
  "rotunda",
  "arena",
  "well",
  "pool",
  "dome",
  "apse",
  "amphitheatre",
  "amphitheater",
  "observatory",
  "font",
  "spring",
  "oubliette",
];

const CROSS_NAME_HINTS = [
  "hall",
  "crossroads",
  "crossroad",
  "nexus",
  "junction",
  "intersection",
  "concourse",
];

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

  // Expand room dimensions toward available space (fills more of the partition).
  // Keep at least the requested size but grow up to ~75% of partition space.
  const expandW = Math.max(roomSpec.w, Math.min(maxW, Math.floor(maxW * 0.75)));
  const expandH = Math.max(roomSpec.h, Math.min(maxH, Math.floor(maxH * 0.75)));
  const w = Math.min(expandW, maxW);
  const h = Math.min(expandH, maxH);

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

  const shape = pickRoomShape(
    {
      ...roomSpec,
      w,
      h,
    },
    rng,
  );

  return {
    nodeId: roomSpec.nodeId,
    nodeType: roomSpec.nodeType,
    nodeName: roomSpec.nodeName,
    x,
    y,
    w,
    h,
    sizeClass: roomSpec.sizeClass,
    shape,
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
  // Start with a full rectangular carve, then apply shape-specific trims.
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      cells[y][x] = CELL.FLOOR;
    }
  }

  if (room.shape === ROOM_SHAPE.NOTCHED) {
    carveNotchedRoom(cells, room, rng);
    return;
  }
  if (room.shape === ROOM_SHAPE.CHAMFERED) {
    carveChamferedRoom(cells, room);
    return;
  }
  if (room.shape === ROOM_SHAPE.CROSS) {
    carveCrossRoom(cells, room);
    return;
  }
  if (room.shape === ROOM_SHAPE.CAVE) {
    carveCaveRoom(cells, room, rng);
    return;
  }
  if (room.shape === ROOM_SHAPE.CIRCLE) {
    carveCircleRoom(cells, room);
  }
}

function pickRoomShape(roomSpec, rng) {
  const nodeType = (roomSpec.nodeType || "").toLowerCase();
  const nodeName = (roomSpec.nodeName || "").toLowerCase();
  const hasCaveHint = CAVE_NAME_HINTS.some((hint) => nodeName.includes(hint));
  const hasCrossHint = CROSS_NAME_HINTS.some((hint) => nodeName.includes(hint));
  const hasCircleHint = CIRCLE_NAME_HINTS.some((hint) =>
    nodeName.includes(hint),
  );

  // Circular rooms: named hints or hubs/set-pieces with roughly square proportions
  if (
    roomSpec.w >= 4 &&
    roomSpec.h >= 4 &&
    hasCircleHint &&
    !hasCaveHint &&
    !hasCrossHint
  ) {
    return ROOM_SHAPE.CIRCLE;
  }

  if (
    roomSpec.w >= 4 &&
    roomSpec.h >= 4 &&
    (nodeType === "hazard" || nodeType === "secret" || hasCaveHint)
  ) {
    return ROOM_SHAPE.CAVE;
  }

  if (
    roomSpec.w >= 5 &&
    roomSpec.h >= 5 &&
    (nodeType === "hub" || nodeType === "set-piece") &&
    hasCrossHint
  ) {
    return ROOM_SHAPE.CROSS;
  }

  if (
    roomSpec.w >= 5 &&
    roomSpec.h >= 5 &&
    (nodeType === "hub" ||
      nodeType === "set-piece" ||
      nodeType === "faction-core")
  ) {
    // Hubs / set-pieces with roughly square proportions sometimes get circle
    const aspectRatio =
      Math.max(roomSpec.w, roomSpec.h) / Math.min(roomSpec.w, roomSpec.h);
    if (rng && aspectRatio <= 1.35 && rng() < 0.35) {
      return ROOM_SHAPE.CIRCLE;
    }
    return ROOM_SHAPE.CHAMFERED;
  }

  // Random circle chance for squarish medium+ rooms
  if (
    rng &&
    roomSpec.w >= 4 &&
    roomSpec.h >= 4 &&
    Math.abs(roomSpec.w - roomSpec.h) <= 1 &&
    rng() < 0.15
  ) {
    return ROOM_SHAPE.CIRCLE;
  }

  if (rng && roomSpec.w >= 4 && roomSpec.h >= 4 && rng() < 0.28) {
    return ROOM_SHAPE.NOTCHED;
  }

  return ROOM_SHAPE.RECT;
}

function carveNotchedRoom(cells, room, rng) {
  if (!rng || room.w < 4 || room.h < 4) return;

  const nw = 1 + Math.floor(rng() * Math.floor(room.w * 0.4));
  const nh = 1 + Math.floor(rng() * Math.floor(room.h * 0.4));
  const corner = Math.floor(rng() * 4); // 0=TL, 1=TR, 2=BL, 3=BR
  let notch = null;
  switch (corner) {
    case 0:
      notch = { x: room.x, y: room.y, w: nw, h: nh };
      break;
    case 1:
      notch = { x: room.x + room.w - nw, y: room.y, w: nw, h: nh };
      break;
    case 2:
      notch = { x: room.x, y: room.y + room.h - nh, w: nw, h: nh };
      break;
    case 3:
      notch = {
        x: room.x + room.w - nw,
        y: room.y + room.h - nh,
        w: nw,
        h: nh,
      };
      break;
  }

  room.notch = notch;
  for (let y = notch.y; y < notch.y + notch.h; y++) {
    for (let x = notch.x; x < notch.x + notch.w; x++) {
      cells[y][x] = CELL.WALL;
    }
  }
}

function carveChamferedRoom(cells, room) {
  const depth = room.w >= 7 && room.h >= 7 ? 2 : 1;
  for (let oy = 0; oy < depth; oy++) {
    for (let ox = 0; ox < depth; ox++) {
      if (ox + oy >= depth) continue;
      cells[room.y + oy][room.x + ox] = CELL.WALL;
      cells[room.y + oy][room.x + room.w - 1 - ox] = CELL.WALL;
      cells[room.y + room.h - 1 - oy][room.x + ox] = CELL.WALL;
      cells[room.y + room.h - 1 - oy][room.x + room.w - 1 - ox] = CELL.WALL;
    }
  }
}

function carveCrossRoom(cells, room) {
  const centerX = room.x + Math.floor(room.w / 2);
  const centerY = room.y + Math.floor(room.h / 2);
  const armHalfX = Math.max(1, Math.floor(room.w / 4));
  const armHalfY = Math.max(1, Math.floor(room.h / 4));

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const inVerticalArm = Math.abs(x - centerX) <= armHalfX;
      const inHorizontalArm = Math.abs(y - centerY) <= armHalfY;
      if (!inVerticalArm && !inHorizontalArm) {
        cells[y][x] = CELL.WALL;
      }
    }
  }

  // Preserve one threshold anchor per wall so corridor routing has reliable targets.
  cells[centerY][room.x] = CELL.FLOOR;
  cells[centerY][room.x + room.w - 1] = CELL.FLOOR;
  cells[room.y][centerX] = CELL.FLOOR;
  cells[room.y + room.h - 1][centerX] = CELL.FLOOR;
}

/**
 * Carve a circular (elliptical) room inscribed within the bounding rectangle.
 * Preserves wall anchor points at the cardinal midpoints for corridor connectivity.
 */
function carveCircleRoom(cells, room) {
  const cx = room.x + (room.w - 1) / 2;
  const cy = room.y + (room.h - 1) / 2;
  const rx = (room.w - 1) / 2;
  const ry = (room.h - 1) / 2;

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const nx = (x - cx) / Math.max(1, rx);
      const ny = (y - cy) / Math.max(1, ry);
      if (nx * nx + ny * ny > 1.05) {
        cells[y][x] = CELL.WALL;
      }
    }
  }

  // Preserve cardinal anchor points for corridor routing
  const midX = Math.round(cx);
  const midY = Math.round(cy);
  cells[midY][room.x] = CELL.FLOOR;
  cells[midY][room.x + room.w - 1] = CELL.FLOOR;
  cells[room.y][midX] = CELL.FLOOR;
  cells[room.y + room.h - 1][midX] = CELL.FLOOR;
  // Keep center floor
  cells[midY][midX] = CELL.FLOOR;
}

function roomKey(x, y) {
  return `${x},${y}`;
}

function carveCaveRoom(cells, room, rng) {
  if (!rng) return;

  const cx = room.x + (room.w - 1) / 2;
  const cy = room.y + (room.h - 1) / 2;

  const wallAnchorPoints = new Set([
    roomKey(room.x + Math.floor(room.w / 2), room.y),
    roomKey(room.x + Math.floor(room.w / 2), room.y + room.h - 1),
    roomKey(room.x, room.y + Math.floor(room.h / 2)),
    roomKey(room.x + room.w - 1, room.y + Math.floor(room.h / 2)),
  ]);

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const edge =
        x === room.x ||
        x === room.x + room.w - 1 ||
        y === room.y ||
        y === room.y + room.h - 1;
      const forceKeep = wallAnchorPoints.has(roomKey(x, y));
      const nx = (x - cx) / Math.max(1, room.w * 0.5);
      const ny = (y - cy) / Math.max(1, room.h * 0.5);
      const radial = nx * nx + ny * ny;
      const jitter = (rng() - 0.5) * 0.42;
      const threshold = edge ? 1.12 : 0.96;

      if (!forceKeep && radial + jitter > threshold) {
        cells[y][x] = CELL.WALL;
      }
    }
  }

  // Keep room center and key wall anchors as floor for connectivity/door routing.
  const midX = Math.round(cx);
  const midY = Math.round(cy);
  cells[midY][midX] = CELL.FLOOR;
  for (const pos of wallAnchorPoints) {
    const [x, y] = pos.split(",").map(Number);
    cells[y][x] = CELL.FLOOR;
  }

  // Remove disconnected pockets and fail-safe to rectangle if carve is too sparse.
  const connected = largestConnectedFloorComponent(cells, room, midX, midY);
  const minFloor = Math.max(6, Math.floor(room.w * room.h * 0.45));
  if (connected.size < minFloor) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        cells[y][x] = CELL.FLOOR;
      }
    }
    return;
  }

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const k = roomKey(x, y);
      if (cells[y][x] === CELL.FLOOR && !connected.has(k)) {
        cells[y][x] = CELL.WALL;
      }
    }
  }

  // Rough interior treatment for cave-like rooms.
  const watery = /(well|pool|water|cistern|flood|spring|fountain)/i.test(
    room.nodeName || "",
  );
  const collapsed = /(collapsed|chasm|rift|ruin|sink|fall)/i.test(
    room.nodeName || "",
  );
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (cells[y][x] !== CELL.FLOOR) continue;
      if (Math.abs(x - midX) + Math.abs(y - midY) <= 1) continue;
      const roll = rng();
      if (watery && roll < 0.05) {
        cells[y][x] = CELL.WATER;
      } else if (collapsed && roll < 0.08) {
        cells[y][x] = CELL.COLLAPSED;
      } else if (roll < 0.14) {
        cells[y][x] = CELL.RUBBLE;
      }
    }
  }
}

function largestConnectedFloorComponent(cells, room, startX, startY) {
  const inRoom = (x, y) =>
    x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  if (!inRoom(startX, startY) || cells[startY][startX] !== CELL.FLOOR) {
    return new Set();
  }

  const seen = new Set([roomKey(startX, startY)]);
  const queue = [{ x: startX, y: startY }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dx, dy] of neighbors) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inRoom(nx, ny)) continue;
      if (cells[ny][nx] !== CELL.FLOOR) continue;
      const k = roomKey(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
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
          nodeType: node.type,
          nodeName: node.name,
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
