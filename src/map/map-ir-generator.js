"use strict";

const { createMapIr } = require("./map-ir");
const {
  compressFloorRects,
  deriveWallSegments,
} = require("./map-ir-extractor");

function createSeededRng(seed) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function makeBoolGrid(width, height, value = false) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

function rectsOverlap(a, b, margin = 0) {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function carveRect(cells, rect, value = true) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      cells[y][x] = value;
    }
  }
}

function carveLine(cells, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);

  let x = x0;
  let y = y0;
  cells[y][x] = true;

  while (x !== x1 || y !== y1) {
    if (x !== x1) x += dx;
    if (y !== y1) y += dy;
    cells[y][x] = true;
  }
}

function roomCenter(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

function connectRooms(cells, rooms, rng, extraConnections = 0) {
  const links = [];
  if (rooms.length <= 1) return links;

  for (let i = 1; i < rooms.length; i++) {
    const j = randInt(rng, 0, i - 1);
    links.push([i, j]);
  }

  const maxExtra = Math.max(0, Math.min(extraConnections, rooms.length * 2));
  for (let i = 0; i < maxExtra; i++) {
    const a = randInt(rng, 0, rooms.length - 1);
    let b = randInt(rng, 0, rooms.length - 1);
    if (a === b) b = (b + 1) % rooms.length;
    if (!links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
      links.push([a, b]);
    }
  }

  for (const [aIdx, bIdx] of links) {
    const a = roomCenter(rooms[aIdx]);
    const b = roomCenter(rooms[bIdx]);

    if (rng() < 0.5) {
      carveLine(cells, a.x, a.y, b.x, a.y);
      carveLine(cells, b.x, a.y, b.x, b.y);
    } else {
      carveLine(cells, a.x, a.y, a.x, b.y);
      carveLine(cells, a.x, b.y, b.x, b.y);
    }
  }

  return links;
}

function buildRoomMask(width, height, rooms) {
  const mask = Array.from({ length: height }, () => Array(width).fill(-1));
  rooms.forEach((room, idx) => {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        mask[y][x] = idx;
      }
    }
  });
  return mask;
}

function extractDoorThresholds(cells, roomMask, rooms, rng) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const thresholds = [];
  const seen = new Set();

  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
    const room = rooms[roomIdx];
    const candidates = [];

    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        let neighborCorridor = false;
        for (const [dx, dy] of deltas) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!cells[ny][nx]) continue;
          if (roomMask[ny][nx] === roomIdx) continue;
          neighborCorridor = true;
          break;
        }
        if (neighborCorridor) {
          candidates.push({ x, y });
        }
      }
    }

    if (candidates.length === 0) continue;
    const pick = candidates[randInt(rng, 0, candidates.length - 1)];
    const key = `${pick.x},${pick.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    thresholds.push({ x: pick.x, y: pick.y, type: "door" });
  }

  return thresholds;
}

function countConnectedComponents(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const seen = Array.from({ length: height }, () => Array(width).fill(false));
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let components = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x] || seen[y][x]) continue;
      components++;

      const queue = [{ x, y }];
      seen[y][x] = true;
      let head = 0;

      while (head < queue.length) {
        const current = queue[head++];
        for (const [dx, dy] of deltas) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!cells[ny][nx] || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  return components;
}

function generateConstrainedMapIr(options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed : 1;
  const rng = createSeededRng(seed);

  const width = Number.isFinite(options.width)
    ? Math.max(20, options.width)
    : 64;
  const height = Number.isFinite(options.height)
    ? Math.max(20, options.height)
    : 64;
  const roomMinSize = Number.isFinite(options.roomMinSize)
    ? Math.max(3, Math.floor(options.roomMinSize))
    : 4;
  const roomMaxSize = Number.isFinite(options.roomMaxSize)
    ? Math.max(roomMinSize, Math.floor(options.roomMaxSize))
    : 10;
  const roomCount = Number.isFinite(options.roomCount)
    ? Math.max(4, Math.floor(options.roomCount))
    : randInt(rng, 14, 24);
  const maxPlacementAttempts = Number.isFinite(options.maxPlacementAttempts)
    ? Math.max(20, Math.floor(options.maxPlacementAttempts))
    : 400;

  const cells = makeBoolGrid(width, height, false);
  const rooms = [];

  let attempts = 0;
  while (rooms.length < roomCount && attempts < maxPlacementAttempts) {
    attempts++;
    const rw = randInt(rng, roomMinSize, roomMaxSize);
    const rh = randInt(rng, roomMinSize, roomMaxSize);

    if (rw + 4 >= width || rh + 4 >= height) continue;

    const rx = randInt(rng, 2, width - rw - 2);
    const ry = randInt(rng, 2, height - rh - 2);
    const room = { x: rx, y: ry, w: rw, h: rh };

    if (rooms.some((existing) => rectsOverlap(existing, room, 1))) {
      continue;
    }

    rooms.push(room);
    carveRect(cells, room, true);
  }

  if (rooms.length < 4) {
    throw new Error(
      `generator could not place enough rooms (placed ${rooms.length})`,
    );
  }

  const extraConnections = Number.isFinite(options.extraConnections)
    ? Math.max(0, Math.floor(options.extraConnections))
    : Math.floor(rooms.length * 0.35);
  const links = connectRooms(cells, rooms, rng, extraConnections);

  const roomMask = buildRoomMask(width, height, rooms);
  const thresholds = extractDoorThresholds(cells, roomMask, rooms, rng);

  const floors = compressFloorRects(cells);
  const walls = deriveWallSegments(cells);
  const labels = rooms.map((room, idx) => ({
    text: String(idx + 1),
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  }));

  const floorCellCount = cells.reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0,
  );

  return createMapIr({
    meta: {
      width,
      height,
      cellSizeFt: Number.isFinite(options.cellSizeFt) ? options.cellSizeFt : 10,
      title:
        typeof options.title === "string" && options.title.trim()
          ? options.title.trim()
          : `Generated Map (seed ${seed})`,
      source: "map-ir-generator",
    },
    floors,
    walls,
    thresholds,
    labels,
    diagnostics: {
      generator: {
        seed,
        roomCountTarget: roomCount,
        roomCountPlaced: rooms.length,
        placementAttempts: attempts,
        linkCount: links.length,
        floorCellCount,
        floorCellRatio: floorCellCount / (width * height),
        connectedComponents: countConnectedComponents(cells),
      },
    },
    extensions: {
      rooms,
      links,
    },
  });
}

module.exports = {
  generateConstrainedMapIr,
  createSeededRng,
  countConnectedComponents,
};
