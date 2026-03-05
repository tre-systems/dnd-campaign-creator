"use strict";

const { createMapIr } = require("./map-ir");
const {
  compressFloorRects,
  deriveWallSegments,
} = require("./map-ir-extractor");
const {
  assertValidMapIrProposalModel,
  computeMapIrStructuralMetrics,
} = require("./map-ir-proposal-model");

function createSeededRng(seed) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function randNormal(rng, mean = 0, stdDev = 1) {
  // Box-Muller transform.
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function pickDiscrete(rng, values, fallback) {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  return values[randInt(rng, 0, values.length - 1)];
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

function carveRoomShape(cells, room, rng) {
  const area = room.w * room.h;
  let shape = "rect";

  if (room.w >= 8 && room.h >= 8 && area >= 50 && rng() < 0.2) {
    shape = "ellipse";
  } else if (room.w >= 7 && room.h >= 7 && area >= 42 && rng() < 0.24) {
    shape = "chamfer";
  } else if (room.w >= 8 && room.h >= 6 && area >= 40 && rng() < 0.16) {
    shape = "capsule";
  }

  const carvedCells = [];
  const pushCell = (x, y) => {
    cells[y][x] = true;
    carvedCells.push({ x, y });
  };

  if (shape === "ellipse") {
    const cx = room.x + (room.w - 1) / 2;
    const cy = room.y + (room.h - 1) / 2;
    const rx = Math.max(1, (room.w - 1) / 2);
    const ry = Math.max(1, (room.h - 1) / 2);
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.03) {
          pushCell(x, y);
        }
      }
    }
  } else if (shape === "chamfer") {
    const cut = Math.max(1, Math.floor(Math.min(room.w, room.h) / 4));
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const lx = x - room.x;
        const ly = y - room.y;
        const dx = Math.min(lx, room.w - 1 - lx);
        const dy = Math.min(ly, room.h - 1 - ly);
        if (dx + dy < cut) continue;
        pushCell(x, y);
      }
    }
  } else if (shape === "capsule") {
    const horizontal = room.w >= room.h;
    if (horizontal) {
      const radius = Math.max(1, (room.h - 1) / 2);
      const cy = room.y + (room.h - 1) / 2;
      const left = room.x + radius;
      const right = room.x + room.w - 1 - radius;
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const dy = Math.abs(y - cy);
          if (dy > radius + 0.12) continue;
          if (x >= left && x <= right) {
            pushCell(x, y);
            continue;
          }
          const capX = x < left ? left : right;
          const nx = x - capX;
          const ny = y - cy;
          if (nx * nx + ny * ny <= (radius + 0.2) * (radius + 0.2)) {
            pushCell(x, y);
          }
        }
      }
    } else {
      const radius = Math.max(1, (room.w - 1) / 2);
      const cx = room.x + (room.w - 1) / 2;
      const top = room.y + radius;
      const bottom = room.y + room.h - 1 - radius;
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const dx = Math.abs(x - cx);
          if (dx > radius + 0.12) continue;
          if (y >= top && y <= bottom) {
            pushCell(x, y);
            continue;
          }
          const capY = y < top ? top : bottom;
          const nx = x - cx;
          const ny = y - capY;
          if (nx * nx + ny * ny <= (radius + 0.2) * (radius + 0.2)) {
            pushCell(x, y);
          }
        }
      }
    }
  } else {
    carveRect(cells, room, true);
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        carvedCells.push({ x, y });
      }
    }
  }

  if (carvedCells.length < Math.max(8, Math.floor(area * 0.52))) {
    carveRect(cells, room, true);
    const fallbackCells = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        fallbackCells.push({ x, y });
      }
    }
    return {
      shape: "rect",
      cells: fallbackCells,
    };
  }

  return {
    shape,
    cells: carvedCells,
  };
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

function resolveRoomLabelCell(room, cells) {
  const center = roomCenter(room);
  if (cells[center.y]?.[center.x]) {
    return center;
  }

  const maxRadius = Math.max(room.w, room.h);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = center.x + dx;
        const y = center.y + dy;
        if (x < room.x || y < room.y || x >= room.x + room.w || y >= room.y + room.h) {
          continue;
        }
        if (cells[y]?.[x]) {
          return { x, y };
        }
      }
    }
  }

  return center;
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

function buildRoomMask(width, height, roomFootprints) {
  const mask = Array.from({ length: height }, () => Array(width).fill(-1));
  roomFootprints.forEach((cells, idx) => {
    for (const cell of cells) {
      mask[cell.y][cell.x] = idx;
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
    const area = room.w * room.h;
    let type = "door";
    if (area >= 54 && rng() < 0.2) {
      type = "locked";
    } else if (rng() < 0.11) {
      type = "secret";
    }
    thresholds.push({ x: pick.x, y: pick.y, type });
  }

  return thresholds;
}

function synthesizeRoomFeatures(cells, rooms, thresholds, rng, options = {}) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const maxFeatures = Number.isFinite(options.maxFeatures)
    ? Math.max(0, Math.floor(options.maxFeatures))
    : 72;
  const reservedCells = Array.isArray(options.reservedCells)
    ? options.reservedCells.filter(
        (cell) => cell && Number.isFinite(cell.x) && Number.isFinite(cell.y),
      )
    : [];

  const features = [];
  const occupied = new Set(
    [
      ...(Array.isArray(thresholds) ? thresholds : []),
      ...reservedCells,
    ].map((entry) => `${entry.x},${entry.y}`),
  );

  const isFloor = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && cells[y][x];
  const isInsideRoom = (room, x, y) =>
    x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;

  const buildRoomCells = (room, inset = 1) => {
    const x0 = room.x + inset;
    const y0 = room.y + inset;
    const x1 = room.x + room.w - 1 - inset;
    const y1 = room.y + room.h - 1 - inset;
    const cellsInRoom = [];

    if (x0 > x1 || y0 > y1) {
      if (inset === 0) return cellsInRoom;
      return buildRoomCells(room, 0);
    }

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        cellsInRoom.push({ x, y });
      }
    }
    return cellsInRoom;
  };

  const shuffleInPlace = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = randInt(rng, 0, i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const placeFeature = (x, y, type) => {
    if (features.length >= maxFeatures) return false;
    const key = `${x},${y}`;
    if (occupied.has(key)) return false;
    if (!isFloor(x, y)) return false;
    occupied.add(key);
    features.push({ x, y, type });
    return true;
  };

  const tryPlaceNearCenter = (room, type, offsets = []) => {
    const center = roomCenter(room);
    const tries = offsets.length > 0 ? offsets : [[0, 0]];
    for (const [dx, dy] of tries) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!isInsideRoom(room, x, y)) continue;
      if (placeFeature(x, y, type)) return true;
    }
    return false;
  };

  const placeFeatureInRoom = (
    room,
    type,
    { inset = 1, preferEdge = false } = {},
  ) => {
    const roomCells = buildRoomCells(room, inset).filter((cell) =>
      isFloor(cell.x, cell.y),
    );
    if (roomCells.length === 0) return false;

    const edgeCells = roomCells.filter((cell) => {
      const wallInset = Math.max(0, inset);
      const edgeX0 = room.x + wallInset;
      const edgeY0 = room.y + wallInset;
      const edgeX1 = room.x + room.w - 1 - wallInset;
      const edgeY1 = room.y + room.h - 1 - wallInset;
      return (
        cell.x === edgeX0 ||
        cell.x === edgeX1 ||
        cell.y === edgeY0 ||
        cell.y === edgeY1
      );
    });

    const primary = preferEdge && edgeCells.length > 0 ? edgeCells : roomCells;
    const ordered = shuffleInPlace([...primary]);
    for (const candidate of ordered) {
      if (placeFeature(candidate.x, candidate.y, type)) return true;
    }

    if (primary !== roomCells) {
      const fallback = shuffleInPlace([...roomCells]);
      for (const candidate of fallback) {
        if (placeFeature(candidate.x, candidate.y, type)) return true;
      }
    }

    return false;
  };

  const placePillarCluster = (room, area) => {
    if (area < 24 || rng() >= 0.72) return;

    if (area >= 80 && rng() < 0.7) {
      const clusterOffsets = shuffleInPlace([
        [-2, -1],
        [2, -1],
        [-2, 1],
        [2, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]);
      const target = area >= 104 ? 4 : 3;
      let placed = 0;
      for (const offset of clusterOffsets) {
        if (tryPlaceNearCenter(room, "pillar", [offset])) {
          placed++;
        }
        if (placed >= target) break;
      }
      return;
    }

    if (area >= 48 && rng() < 0.62) {
      const axisOffsets =
        rng() < 0.5
          ? [
              [2, 0],
              [-2, 0],
              [1, 0],
              [-1, 0],
            ]
          : [
              [0, 2],
              [0, -2],
              [0, 1],
              [0, -1],
            ];
      let placed = 0;
      for (const offset of shuffleInPlace([...axisOffsets])) {
        if (tryPlaceNearCenter(room, "pillar", [offset])) {
          placed++;
        }
        if (placed >= 2) break;
      }
      if (placed > 0) return;
    }

    tryPlaceNearCenter(room, "pillar", [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [0, 0],
    ]);
  };

  const commonCenterOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [0, 0],
  ];

  const byAreaDesc = [...rooms]
    .map((room, idx) => ({ room, idx, area: room.w * room.h }))
    .sort((a, b) => b.area - a.area);

  if (byAreaDesc.length > 0) {
    tryPlaceNearCenter(
      byAreaDesc[0].room,
      "stairsDown",
      shuffleInPlace([...commonCenterOffsets]),
    );
  }
  if (byAreaDesc.length > 1) {
    tryPlaceNearCenter(
      byAreaDesc[1].room,
      "stairsUp",
      shuffleInPlace([...commonCenterOffsets]),
    );
  }

  for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
    const room = rooms[roomIdx];
    const area = room.w * room.h;

    placePillarCluster(room, area);

    if (area >= 44 && rng() < 0.18) {
      placeFeatureInRoom(room, rng() < 0.5 ? "well" : "altar", {
        inset: 1,
      });
    } else if (area >= 28 && rng() < 0.24) {
      placeFeatureInRoom(room, "statue", { inset: 1 });
    }

    if (area >= 20 && rng() < 0.17) {
      placeFeatureInRoom(room, "trap", { inset: 1 });
    }
    if (area >= 20 && rng() < 0.16) {
      placeFeatureInRoom(room, rng() < 0.52 ? "chest" : "coffin", {
        inset: 1,
        preferEdge: true,
      });
    }
    if (area >= 18 && rng() < 0.1) {
      placeFeatureInRoom(room, "curtain", { inset: 1, preferEdge: true });
    }
  }

  return features;
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

function normalizeMetricDistance(value, metricSummary, fallbackStd) {
  const mean = Number.isFinite(metricSummary?.mean) ? metricSummary.mean : 0;
  const stdDev = Number.isFinite(metricSummary?.stdDev)
    ? metricSummary.stdDev
    : fallbackStd;
  const denom = Math.max(fallbackStd, stdDev);
  return Math.abs(value - mean) / denom;
}

function scoreMapAgainstProposalModel(mapIr, proposalModel) {
  const metrics = computeMapIrStructuralMetrics(mapIr);

  let score = 0;
  score +=
    normalizeMetricDistance(
      metrics.floorCellRatio,
      proposalModel.metrics.floorCellRatio,
      0.02,
    ) * 4;
  score +=
    normalizeMetricDistance(
      metrics.floorsPerCell,
      proposalModel.metrics.floorsPerCell,
      0.01,
    ) * 1.4;
  score +=
    normalizeMetricDistance(
      metrics.wallsPerCell,
      proposalModel.metrics.wallsPerCell,
      0.02,
    ) * 1.2;
  score +=
    normalizeMetricDistance(
      metrics.thresholdsPerCell,
      proposalModel.metrics.thresholdsPerCell,
      0.00012,
    ) * 1;
  score +=
    normalizeMetricDistance(
      metrics.labelsPerCell,
      proposalModel.metrics.labelsPerCell,
      0.00018,
    ) * 0.8;

  const components =
    mapIr?.diagnostics?.generator?.connectedComponents ??
    metrics.connectedComponents ??
    0;
  if (components > 1) {
    score += (components - 1) * 50;
  }

  return score;
}

function sampleGeneratorParamsFromModel(proposalModel, rng, options = {}) {
  const width =
    Number.isFinite(options.width) && options.width > 0
      ? Math.floor(options.width)
      : pickDiscrete(
          rng,
          proposalModel.dimensions.width.values,
          Math.round(proposalModel.dimensions.width.stats.mean || 64),
        );
  const height =
    Number.isFinite(options.height) && options.height > 0
      ? Math.floor(options.height)
      : pickDiscrete(
          rng,
          proposalModel.dimensions.height.values,
          Math.round(proposalModel.dimensions.height.stats.mean || 64),
        );

  const roomMinSize = clamp(
    Math.round(
      randNormal(
        rng,
        proposalModel.generatorPriors.roomMinSize,
        Math.max(0.8, proposalModel.generatorPriors.roomMinSize * 0.1),
      ),
    ),
    3,
    20,
  );

  const roomMaxSize = clamp(
    Math.round(
      randNormal(
        rng,
        proposalModel.generatorPriors.roomMaxSize,
        Math.max(1.2, proposalModel.generatorPriors.roomMaxSize * 0.12),
      ),
    ),
    roomMinSize + 1,
    32,
  );

  const roomCountBase = randNormal(
    rng,
    proposalModel.generatorPriors.roomCountMean,
    proposalModel.generatorPriors.roomCountStd,
  );
  const roomCount = clamp(Math.round(roomCountBase), 8, 96);

  const extraConnectionRatio = clamp(
    randNormal(
      rng,
      proposalModel.generatorPriors.extraConnectionRatioMean,
      proposalModel.generatorPriors.extraConnectionRatioStd,
    ),
    0.15,
    0.8,
  );
  const extraConnections = clamp(
    Math.round(roomCount * extraConnectionRatio),
    0,
    roomCount * 2,
  );

  return {
    width,
    height,
    roomMinSize,
    roomMaxSize,
    roomCount,
    extraConnections,
    maxPlacementAttempts: proposalModel.generatorPriors.maxPlacementAttempts,
  };
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
  const roomFootprints = [];

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

    const carved = carveRoomShape(cells, room, rng);
    room.shape = carved.shape;
    rooms.push(room);
    roomFootprints.push(carved.cells);
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
  const labels = rooms.map((room, idx) => ({
    ...resolveRoomLabelCell(room, cells),
    text: String(idx + 1),
  }));

  const roomMask = buildRoomMask(width, height, roomFootprints);
  const thresholds = extractDoorThresholds(cells, roomMask, rooms, rng);
  const features = synthesizeRoomFeatures(cells, rooms, thresholds, rng, {
    maxFeatures: options.maxFeatures,
    reservedCells: labels.map((label) => ({ x: label.x, y: label.y })),
  });

  const floors = compressFloorRects(cells);
  const walls = deriveWallSegments(cells);

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
        thresholdCount: thresholds.length,
        featureCount: features.length,
      },
    },
    extensions: {
      rooms,
      links,
      features,
    },
  });
}

function generateLearnedProposalMapIr(options = {}) {
  const proposalModel = assertValidMapIrProposalModel(options.model);
  const seed = Number.isFinite(options.seed) ? options.seed : 1;
  const attempts = Number.isFinite(options.attempts)
    ? Math.max(1, Math.floor(options.attempts))
    : 32;
  const rng = createSeededRng(seed);

  let best = null;
  let successfulCandidates = 0;

  for (let i = 0; i < attempts; i++) {
    const sampled = sampleGeneratorParamsFromModel(proposalModel, rng, {
      width: options.width,
      height: options.height,
    });
    const candidateSeed = (seed + 1 + i * 7919) | 0;

    let candidate = null;
    try {
      candidate = generateConstrainedMapIr({
        ...sampled,
        seed: candidateSeed,
        cellSizeFt: Number.isFinite(options.cellSizeFt)
          ? options.cellSizeFt
          : 10,
        title:
          typeof options.title === "string" && options.title.trim()
            ? options.title.trim()
            : `Learned Proposal Map (seed ${seed})`,
      });
    } catch {
      continue;
    }

    successfulCandidates++;
    const proposalScore = scoreMapAgainstProposalModel(
      candidate,
      proposalModel,
    );
    if (!best || proposalScore < best.proposalScore) {
      best = {
        mapIr: candidate,
        proposalScore,
      };
    }
  }

  if (!best) {
    throw new Error(
      "learned proposal generator could not produce a valid candidate",
    );
  }

  const diagnostics = best.mapIr.diagnostics || {};
  const existingGenerator = diagnostics.generator || {};

  best.mapIr.meta.source = "map-ir-generator:learned-proposal";
  best.mapIr.diagnostics = {
    ...diagnostics,
    generator: {
      ...existingGenerator,
      strategy: "learned-proposal",
      baseSeed: seed,
      proposalScore: best.proposalScore,
      candidateAttempts: attempts,
      successfulCandidates,
      proposalModelVersion: proposalModel.version,
    },
  };

  return best.mapIr;
}

module.exports = {
  generateConstrainedMapIr,
  generateLearnedProposalMapIr,
  scoreMapAgainstProposalModel,
  sampleGeneratorParamsFromModel,
  createSeededRng,
  countConnectedComponents,
};
