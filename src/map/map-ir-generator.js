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

  const features = [];
  const occupied = new Set(
    (Array.isArray(thresholds) ? thresholds : []).map(
      (threshold) => `${threshold.x},${threshold.y}`,
    ),
  );

  const isFloor = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && cells[y][x];

  const placeFeature = (x, y, type) => {
    if (features.length >= maxFeatures) return false;
    const key = `${x},${y}`;
    if (occupied.has(key)) return false;
    if (!isFloor(x, y)) return false;
    occupied.add(key);
    features.push({ x, y, type });
    return true;
  };

  const tryPlaceNearCenter = (room, type, offsets = null) => {
    const center = roomCenter(room);
    const tries = offsets || [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (const [dx, dy] of tries) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (
        x < room.x ||
        y < room.y ||
        x >= room.x + room.w ||
        y >= room.y + room.h
      ) {
        continue;
      }
      if (placeFeature(x, y, type)) return true;
    }
    return false;
  };

  const byAreaDesc = [...rooms]
    .map((room, idx) => ({ room, idx, area: room.w * room.h }))
    .sort((a, b) => b.area - a.area);

  if (byAreaDesc.length > 0) {
    tryPlaceNearCenter(byAreaDesc[0].room, "stairsDown");
  }
  if (byAreaDesc.length > 1) {
    tryPlaceNearCenter(byAreaDesc[1].room, "stairsUp");
  }

  for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
    const room = rooms[roomIdx];
    const area = room.w * room.h;

    if (area >= 24 && rng() < 0.65) {
      tryPlaceNearCenter(room, "pillar");
    }
    if (area >= 56 && rng() < 0.45) {
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
      tryPlaceNearCenter(room, "pillar", axisOffsets);
    }

    if (area >= 40 && roomIdx % 6 === 0) {
      tryPlaceNearCenter(room, "well");
    } else if (area >= 28 && rng() < 0.16) {
      tryPlaceNearCenter(room, "statue");
    }

    if (area >= 20 && rng() < 0.14) {
      tryPlaceNearCenter(room, "trap");
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
  const features = synthesizeRoomFeatures(cells, rooms, thresholds, rng, {
    maxFeatures: options.maxFeatures,
  });

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
