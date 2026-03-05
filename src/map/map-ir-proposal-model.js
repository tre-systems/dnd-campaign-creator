"use strict";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values, avg = mean(values)) {
  if (!Array.isArray(values) || values.length === 0 || avg === null)
    return null;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) /
    values.length;
  return Math.sqrt(variance);
}

function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p = clamp(q, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(p);
  const upper = Math.ceil(p);
  if (lower === upper) return sorted[lower];
  const t = p - lower;
  return sorted[lower] * (1 - t) + sorted[upper] * t;
}

function summarize(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      p10: null,
      p50: null,
      p90: null,
    };
  }

  const avg = mean(values);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: avg,
    stdDev: stdDev(values, avg),
    p10: quantile(values, 0.1),
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
  };
}

function makeBoolGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(false));
}

function floorGridFromMapIr(mapIr) {
  const width = mapIr?.meta?.width;
  const height = mapIr?.meta?.height;
  if (!Number.isInteger(width) || width <= 0) return null;
  if (!Number.isInteger(height) || height <= 0) return null;

  const cells = makeBoolGrid(width, height);
  const floors = Array.isArray(mapIr.floors) ? mapIr.floors : [];
  for (const rect of floors) {
    if (!rect || !Number.isInteger(rect.x) || !Number.isInteger(rect.y))
      continue;
    if (!Number.isInteger(rect.w) || !Number.isInteger(rect.h)) continue;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      if (y < 0 || y >= height) continue;
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 0 || x >= width) continue;
        cells[y][x] = true;
      }
    }
  }

  return cells;
}

function countConnectedComponents(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const seen = Array.from({ length: height }, () => Array(width).fill(false));

  let components = 0;
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x] || seen[y][x]) continue;
      components++;

      const queue = [{ x, y }];
      let head = 0;
      seen[y][x] = true;

      while (head < queue.length) {
        const point = queue[head++];
        for (const [dx, dy] of deltas) {
          const nx = point.x + dx;
          const ny = point.y + dy;
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

function computeMapIrStructuralMetrics(mapIr) {
  const width = mapIr?.meta?.width;
  const height = mapIr?.meta?.height;
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("mapIr.meta.width must be a positive integer");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("mapIr.meta.height must be a positive integer");
  }

  const area = width * height;
  const floorRatioFromDiagnostics = mapIr?.diagnostics?.floorCellRatio;

  let floorCellRatio = Number.isFinite(floorRatioFromDiagnostics)
    ? floorRatioFromDiagnostics
    : null;
  let connectedComponents = null;

  if (floorCellRatio === null || !Number.isFinite(connectedComponents)) {
    const cells = floorGridFromMapIr(mapIr);
    if (cells) {
      const floorCellCount = cells.reduce(
        (sum, row) => sum + row.filter(Boolean).length,
        0,
      );
      if (floorCellRatio === null) {
        floorCellRatio = area > 0 ? floorCellCount / area : 0;
      }
      connectedComponents = countConnectedComponents(cells);
    }
  }

  if (!Number.isFinite(floorCellRatio)) {
    floorCellRatio = 0;
  }
  if (!Number.isFinite(connectedComponents)) {
    connectedComponents = null;
  }

  return {
    width,
    height,
    area,
    floorCellRatio,
    floorsPerCell:
      (Array.isArray(mapIr.floors) ? mapIr.floors.length : 0) / area,
    wallsPerCell: (Array.isArray(mapIr.walls) ? mapIr.walls.length : 0) / area,
    thresholdsPerCell:
      (Array.isArray(mapIr.thresholds) ? mapIr.thresholds.length : 0) / area,
    labelsPerCell:
      (Array.isArray(mapIr.labels) ? mapIr.labels.length : 0) / area,
    connectedComponents,
  };
}

function collectRoomLikeRectStats(mapIrs) {
  const shortSides = [];
  const longSides = [];

  for (const mapIr of mapIrs) {
    const floors = Array.isArray(mapIr.floors) ? mapIr.floors : [];
    for (const rect of floors) {
      if (!rect || !Number.isInteger(rect.w) || !Number.isInteger(rect.h))
        continue;
      if (rect.w <= 1 || rect.h <= 1) continue;
      const shortSide = Math.min(rect.w, rect.h);
      const longSide = Math.max(rect.w, rect.h);
      const area = rect.w * rect.h;
      const aspect = longSide / Math.max(1, shortSide);
      if (area < 9 || aspect > 3.5) continue;
      shortSides.push(shortSide);
      longSides.push(longSide);
    }
  }

  return {
    shortSides,
    longSides,
  };
}

function trainMapIrProposalModel(mapIrs, options = {}) {
  if (!Array.isArray(mapIrs) || mapIrs.length === 0) {
    throw new Error("mapIrs must be a non-empty array");
  }

  const metrics = mapIrs.map((mapIr) => computeMapIrStructuralMetrics(mapIr));
  const widths = metrics.map((metric) => metric.width);
  const heights = metrics.map((metric) => metric.height);
  const areas = metrics.map((metric) => metric.area);

  const floorCellRatios = metrics.map((metric) => metric.floorCellRatio);
  const floorsPerCell = metrics.map((metric) => metric.floorsPerCell);
  const wallsPerCell = metrics.map((metric) => metric.wallsPerCell);
  const thresholdsPerCell = metrics.map((metric) => metric.thresholdsPerCell);
  const labelsPerCell = metrics.map((metric) => metric.labelsPerCell);
  const labelCounts = mapIrs.map((mapIr) =>
    Array.isArray(mapIr.labels) ? mapIr.labels.length : 0,
  );

  const roomRectStats = collectRoomLikeRectStats(mapIrs);
  const derivedRoomMin =
    quantile(roomRectStats.shortSides, 0.25) ?? options.defaultRoomMinSize ?? 4;
  const derivedRoomMax =
    quantile(roomRectStats.longSides, 0.85) ?? options.defaultRoomMaxSize ?? 12;

  const roomMinSize = clamp(Math.round(derivedRoomMin), 3, 16);
  const roomMaxSize = clamp(Math.round(derivedRoomMax), roomMinSize + 1, 30);

  const meanArea = mean(areas) ?? 4096;
  const targetFloorCells = meanArea * (mean(floorCellRatios) ?? 0.42);
  const representativeRoomSpan = (roomMinSize + roomMaxSize) / 2;
  const representativeRoomArea = Math.max(
    36,
    representativeRoomSpan * representativeRoomSpan * 3.6,
  );
  const roomCountFromFloor = targetFloorCells / representativeRoomArea;
  const labelsToRoomMultiplier = Number.isFinite(options.labelsToRoomMultiplier)
    ? Math.max(1, options.labelsToRoomMultiplier)
    : 4;
  const roomCountFromLabels = (mean(labelCounts) ?? 6) * labelsToRoomMultiplier;
  const roomCountMean = clamp(
    roomCountFromFloor * 0.65 + roomCountFromLabels * 0.35,
    8,
    72,
  );
  const roomCountStd = Math.max(2, roomCountMean * 0.18);

  return {
    version: "0.1.0",
    kind: "map-ir-proposal-model",
    trainedAt:
      typeof options.trainedAt === "string"
        ? options.trainedAt
        : new Date().toISOString(),
    corpus: {
      mapCount: mapIrs.length,
      sourceDir:
        typeof options.sourceDir === "string" ? options.sourceDir : undefined,
    },
    dimensions: {
      width: {
        values: [...new Set(widths)].sort((a, b) => a - b),
        stats: summarize(widths),
      },
      height: {
        values: [...new Set(heights)].sort((a, b) => a - b),
        stats: summarize(heights),
      },
    },
    metrics: {
      floorCellRatio: summarize(floorCellRatios),
      floorsPerCell: summarize(floorsPerCell),
      wallsPerCell: summarize(wallsPerCell),
      thresholdsPerCell: summarize(thresholdsPerCell),
      labelsPerCell: summarize(labelsPerCell),
    },
    generatorPriors: {
      roomMinSize,
      roomMaxSize,
      roomCountMean,
      roomCountStd,
      extraConnectionRatioMean: Number.isFinite(
        options.extraConnectionRatioMean,
      )
        ? options.extraConnectionRatioMean
        : 0.35,
      extraConnectionRatioStd: Number.isFinite(options.extraConnectionRatioStd)
        ? options.extraConnectionRatioStd
        : 0.08,
      maxPlacementAttempts: Number.isFinite(options.maxPlacementAttempts)
        ? Math.max(200, Math.floor(options.maxPlacementAttempts))
        : 1200,
    },
  };
}

function assertValidMapIrProposalModel(model) {
  if (!model || typeof model !== "object") {
    throw new Error("proposal model must be an object");
  }
  if (model.kind !== "map-ir-proposal-model") {
    throw new Error("proposal model kind must be map-ir-proposal-model");
  }
  if (model.version !== "0.1.0") {
    throw new Error("proposal model version must be 0.1.0");
  }

  const widthValues = model?.dimensions?.width?.values;
  const heightValues = model?.dimensions?.height?.values;
  if (!Array.isArray(widthValues) || widthValues.length === 0) {
    throw new Error("proposal model dimensions.width.values must be non-empty");
  }
  if (!Array.isArray(heightValues) || heightValues.length === 0) {
    throw new Error(
      "proposal model dimensions.height.values must be non-empty",
    );
  }

  const priors = model.generatorPriors || {};
  if (!Number.isFinite(priors.roomMinSize) || priors.roomMinSize < 3) {
    throw new Error("proposal model generatorPriors.roomMinSize is invalid");
  }
  if (
    !Number.isFinite(priors.roomMaxSize) ||
    priors.roomMaxSize <= priors.roomMinSize
  ) {
    throw new Error("proposal model generatorPriors.roomMaxSize is invalid");
  }
  if (!Number.isFinite(priors.roomCountMean) || priors.roomCountMean < 4) {
    throw new Error("proposal model generatorPriors.roomCountMean is invalid");
  }
  if (!Number.isFinite(priors.roomCountStd) || priors.roomCountStd <= 0) {
    throw new Error("proposal model generatorPriors.roomCountStd is invalid");
  }

  return model;
}

module.exports = {
  computeMapIrStructuralMetrics,
  trainMapIrProposalModel,
  assertValidMapIrProposalModel,
};
