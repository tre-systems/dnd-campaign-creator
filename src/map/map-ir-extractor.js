"use strict";

const sharp = require("sharp");

const { createMapIr } = require("./map-ir");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function assertFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function computeLumaAndDarkProfiles(raw, width, height, channels) {
  const pixelCount = width * height;
  const luma = new Float32Array(pixelCount);
  const rowDarkness = new Float32Array(height);
  const colDarkness = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowStart + x) * channels;
      const r = raw[idx] / 255;
      const g = raw[idx + 1] / 255;
      const b = raw[idx + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const darkness = 1 - lum;

      luma[rowStart + x] = lum;
      rowDarkness[y] += darkness;
      colDarkness[x] += darkness;
    }
  }

  for (let y = 0; y < height; y++) {
    rowDarkness[y] /= width;
  }

  for (let x = 0; x < width; x++) {
    colDarkness[x] /= height;
  }

  return {
    luma,
    rowDarkness,
    colDarkness,
  };
}

function detectGridSpacing(profile, minLag, maxLag) {
  if (!profile || profile.length < minLag * 3) {
    return null;
  }

  const n = profile.length;
  const normalized = new Float64Array(n);

  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += profile[i];
  }
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const value = profile[i] - mean;
    normalized[i] = value;
    variance += value * value;
  }

  if (variance <= 1e-6) {
    return null;
  }

  let bestLag = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const lagMin = Math.max(2, Math.floor(minLag));
  const lagMax = Math.min(Math.floor(maxLag), Math.floor(n / 2));

  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += normalized[i] * normalized[i + lag];
      count++;
    }

    if (count === 0) continue;
    const score = sum / count;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag === null || bestScore <= variance / n / 6) {
    return null;
  }

  return {
    spacing: bestLag,
    confidence: clamp(bestScore / (variance / n), 0, 1),
  };
}

function detectGridPhase(profile, spacing) {
  if (!profile || !Number.isFinite(spacing) || spacing < 2) {
    return 0;
  }

  let bestOffset = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  const period = Math.max(2, Math.floor(spacing));

  for (let offset = 0; offset < period; offset++) {
    let score = 0;
    for (let i = offset; i < profile.length; i += period) {
      score += profile[i];
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

function chooseGridSpacing(xSpacing, ySpacing, minGridPx, maxGridPx) {
  let chosen = minGridPx;

  if (xSpacing && ySpacing) {
    const sx = xSpacing.spacing;
    const sy = ySpacing.spacing;
    const small = Math.min(sx, sy);
    const large = Math.max(sx, sy);
    const ratio = large / Math.max(1, small);

    // If one axis likely landed on a doubled harmonic, keep the smaller base period.
    if (ratio >= 1.6 && ratio <= 2.4) {
      chosen = small;
    } else {
      const cx = Number.isFinite(xSpacing.confidence)
        ? xSpacing.confidence
        : 0.5;
      const cy = Number.isFinite(ySpacing.confidence)
        ? ySpacing.confidence
        : 0.5;
      const weight = Math.max(1e-6, cx + cy);
      chosen = Math.round((sx * cx + sy * cy) / weight);
    }
  } else if (xSpacing) {
    chosen = xSpacing.spacing;
  } else if (ySpacing) {
    chosen = ySpacing.spacing;
  }

  return clamp(chosen, minGridPx, maxGridPx);
}

function computeOtsuThreshold(luma) {
  if (!luma || luma.length === 0) return 0.78;

  const bins = new Uint32Array(256);
  for (let i = 0; i < luma.length; i++) {
    const idx = clamp(Math.round(luma[i] * 255), 0, 255);
    bins[idx]++;
  }

  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += bins[i];
    sum += i * bins[i];
  }
  if (total === 0) return 0.78;

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let threshold = 199;

  for (let i = 0; i < 256; i++) {
    wB += bins[i];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * bins[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold / 255;
}

function buildFloorMask(luma, width, height, threshold) {
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < mask.length; i++) {
    mask[i] = luma[i] >= threshold ? 1 : 0;
  }

  // One denoise pass to eliminate isolated speckles.
  if (width >= 3 && height >= 3) {
    const denoised = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            neighbors += mask[(y + dy) * width + (x + dx)];
          }
        }
        if (mask[idx] === 1 && neighbors <= 1) {
          denoised[idx] = 0;
        } else if (mask[idx] === 0 && neighbors >= 7) {
          denoised[idx] = 1;
        }
      }
    }
    return denoised;
  }

  return mask;
}

function findMaskBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowStart + x] !== 1) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function alignGridStart(phase, minBound, spacing) {
  let start = phase;

  while (start > minBound) {
    start -= spacing;
  }
  while (start + spacing <= minBound) {
    start += spacing;
  }

  return start;
}

function sampleFloorCell(
  mask,
  width,
  height,
  x0,
  y0,
  x1,
  y1,
  floorCellRatioThreshold,
) {
  const marginX = Math.max(1, Math.floor((x1 - x0 + 1) * 0.2));
  const marginY = Math.max(1, Math.floor((y1 - y0 + 1) * 0.2));

  const sx0 = clamp(x0 + marginX, 0, width - 1);
  const sy0 = clamp(y0 + marginY, 0, height - 1);
  const sx1 = clamp(x1 - marginX, 0, width - 1);
  const sy1 = clamp(y1 - marginY, 0, height - 1);

  const fromX = Math.min(sx0, sx1);
  const toX = Math.max(sx0, sx1);
  const fromY = Math.min(sy0, sy1);
  const toY = Math.max(sy0, sy1);

  let total = 0;
  let hits = 0;

  for (let y = fromY; y <= toY; y++) {
    const rowStart = y * width;
    for (let x = fromX; x <= toX; x++) {
      total++;
      if (mask[rowStart + x] === 1) {
        hits++;
      }
    }
  }

  if (total === 0) {
    return false;
  }

  return hits / total >= floorCellRatioThreshold;
}

function sampleCellGrid(mask, width, height, layout, options) {
  const {
    startX,
    startY,
    spacing,
    gridWidth,
    gridHeight,
    floorCellRatioThreshold,
  } = layout;

  const cells = Array.from({ length: gridHeight }, () =>
    Array(gridWidth).fill(false),
  );

  let floorCellCount = 0;

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const x0 = Math.floor(startX + gx * spacing);
      const y0 = Math.floor(startY + gy * spacing);
      const x1 = Math.floor(startX + (gx + 1) * spacing) - 1;
      const y1 = Math.floor(startY + (gy + 1) * spacing) - 1;

      if (x1 < 0 || y1 < 0 || x0 >= width || y0 >= height) {
        continue;
      }

      const isFloor = sampleFloorCell(
        mask,
        width,
        height,
        x0,
        y0,
        x1,
        y1,
        floorCellRatioThreshold,
      );

      cells[gy][gx] = isFloor;
      if (isFloor) floorCellCount++;
    }
  }

  const minFloorCells = Number.isFinite(options.minFloorCells)
    ? options.minFloorCells
    : 6;
  if (floorCellCount < minFloorCells) {
    // Fallback: consider the full bbox as floor to avoid empty extraction output.
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        cells[gy][gx] = true;
      }
    }
    floorCellCount = gridWidth * gridHeight;
  }

  return {
    cells,
    floorCellCount,
  };
}

function compressFloorRects(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const visited = Array.from({ length: height }, () =>
    Array(width).fill(false),
  );

  const rects = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x] || visited[y][x]) continue;

      let rectWidth = 0;
      while (
        x + rectWidth < width &&
        cells[y][x + rectWidth] &&
        !visited[y][x + rectWidth]
      ) {
        rectWidth++;
      }

      let rectHeight = 1;
      let canExtend = true;
      while (y + rectHeight < height && canExtend) {
        for (let dx = 0; dx < rectWidth; dx++) {
          if (
            !cells[y + rectHeight][x + dx] ||
            visited[y + rectHeight][x + dx]
          ) {
            canExtend = false;
            break;
          }
        }
        if (canExtend) {
          rectHeight++;
        }
      }

      for (let dy = 0; dy < rectHeight; dy++) {
        for (let dx = 0; dx < rectWidth; dx++) {
          visited[y + dy][x + dx] = true;
        }
      }

      rects.push({
        x,
        y,
        w: rectWidth,
        h: rectHeight,
      });
    }
  }

  return rects;
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      if (current.end > last.end) {
        last.end = current.end;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function deriveWallSegments(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;

  const horizontal = new Map();
  const vertical = new Map();

  const addHorizontal = (y, x0, x1) => {
    const key = String(y);
    if (!horizontal.has(key)) {
      horizontal.set(key, []);
    }
    horizontal.get(key).push({ start: x0, end: x1 });
  };

  const addVertical = (x, y0, y1) => {
    const key = String(x);
    if (!vertical.has(key)) {
      vertical.set(key, []);
    }
    vertical.get(key).push({ start: y0, end: y1 });
  };

  const isFloor = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return cells[y][x];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x]) continue;

      if (!isFloor(x, y - 1)) addHorizontal(y, x, x + 1);
      if (!isFloor(x, y + 1)) addHorizontal(y + 1, x, x + 1);
      if (!isFloor(x - 1, y)) addVertical(x, y, y + 1);
      if (!isFloor(x + 1, y)) addVertical(x + 1, y, y + 1);
    }
  }

  const segments = [];

  for (const [key, intervals] of horizontal.entries()) {
    const y = Number.parseFloat(key);
    const merged = mergeIntervals(intervals);
    for (const interval of merged) {
      segments.push({
        x1: interval.start,
        y1: y,
        x2: interval.end,
        y2: y,
      });
    }
  }

  for (const [key, intervals] of vertical.entries()) {
    const x = Number.parseFloat(key);
    const merged = mergeIntervals(intervals);
    for (const interval of merged) {
      segments.push({
        x1: x,
        y1: interval.start,
        x2: x,
        y2: interval.end,
      });
    }
  }

  return segments;
}

function buildArticulationSet(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const keys = [];
  const floorSet = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x]) continue;
      const key = `${x},${y}`;
      keys.push(key);
      floorSet.add(key);
    }
  }

  const disc = new Map();
  const low = new Map();
  const parent = new Map();
  const articulation = new Set();
  let time = 0;

  const neighbors = (x, y) => {
    const out = [];
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of deltas) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (floorSet.has(key)) out.push({ x: nx, y: ny, key });
    }
    return out;
  };

  const dfs = (x, y, key) => {
    disc.set(key, ++time);
    low.set(key, disc.get(key));
    let children = 0;

    for (const neighbor of neighbors(x, y)) {
      if (!disc.has(neighbor.key)) {
        children++;
        parent.set(neighbor.key, key);
        dfs(neighbor.x, neighbor.y, neighbor.key);

        low.set(key, Math.min(low.get(key), low.get(neighbor.key)));

        if (!parent.has(key) && children > 1) {
          articulation.add(key);
        }
        if (
          parent.has(key) &&
          low.get(neighbor.key) >= (disc.get(key) || Number.POSITIVE_INFINITY)
        ) {
          articulation.add(key);
        }
      } else if (parent.get(key) !== neighbor.key) {
        low.set(key, Math.min(low.get(key), disc.get(neighbor.key)));
      }
    }
  };

  for (const key of keys) {
    if (disc.has(key)) continue;
    const [x, y] = key.split(",").map((part) => Number.parseInt(part, 10));
    dfs(x, y, key);
  }

  return articulation;
}

function sampleCellDarkness(
  luma,
  pixelWidth,
  pixelHeight,
  grid,
  cellX,
  cellY,
  innerRatio = 0.25,
) {
  const x0 = grid.startX + cellX * grid.spacing;
  const y0 = grid.startY + cellY * grid.spacing;
  const x1 = grid.startX + (cellX + 1) * grid.spacing - 1;
  const y1 = grid.startY + (cellY + 1) * grid.spacing - 1;

  const marginX = Math.max(1, Math.floor((x1 - x0 + 1) * innerRatio));
  const marginY = Math.max(1, Math.floor((y1 - y0 + 1) * innerRatio));

  const fromX = clamp(Math.floor(x0 + marginX), 0, pixelWidth - 1);
  const toX = clamp(Math.floor(x1 - marginX), 0, pixelWidth - 1);
  const fromY = clamp(Math.floor(y0 + marginY), 0, pixelHeight - 1);
  const toY = clamp(Math.floor(y1 - marginY), 0, pixelHeight - 1);

  let sumDark = 0;
  let count = 0;

  for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) {
    const rowStart = y * pixelWidth;
    for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x++) {
      sumDark += 1 - luma[rowStart + x];
      count++;
    }
  }

  if (count === 0) return 0;
  return sumDark / count;
}

function extractHighConfidenceDoorThresholds(
  cells,
  luma,
  pixelWidth,
  pixelHeight,
  grid,
  options = {},
) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const articulation = buildArticulationSet(cells);

  const minDarkness = Number.isFinite(options.minDoorDarkness)
    ? options.minDoorDarkness
    : 0.16;
  const maxDoors = Number.isFinite(options.maxDoorThresholds)
    ? Math.max(0, Math.floor(options.maxDoorThresholds))
    : 48;

  const thresholds = [];

  const isFloor = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return cells[y][x];
  };

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!cells[y][x]) continue;

      const key = `${x},${y}`;
      if (!articulation.has(key)) continue;

      const left = isFloor(x - 1, y);
      const right = isFloor(x + 1, y);
      const up = isFloor(x, y - 1);
      const down = isFloor(x, y + 1);

      const horizontalChoke = left && right && !up && !down;
      const verticalChoke = up && down && !left && !right;

      if (!horizontalChoke && !verticalChoke) continue;

      const darkness = sampleCellDarkness(
        luma,
        pixelWidth,
        pixelHeight,
        grid,
        x,
        y,
        0.28,
      );
      if (darkness < minDarkness) continue;

      thresholds.push({
        x,
        y,
        type: "door",
        _score: darkness,
      });
    }
  }

  thresholds.sort((a, b) => b._score - a._score);
  return thresholds.slice(0, maxDoors).map((threshold) => ({
    x: threshold.x,
    y: threshold.y,
    type: threshold.type,
  }));
}

function extractHighConfidenceLabels(
  floors,
  luma,
  pixelWidth,
  pixelHeight,
  grid,
  options = {},
) {
  const minArea = Number.isFinite(options.minLabelRectArea)
    ? Math.max(4, Math.floor(options.minLabelRectArea))
    : 24;
  const minDarkness = Number.isFinite(options.minLabelDarkness)
    ? options.minLabelDarkness
    : 0.12;
  const maxDarkness = Number.isFinite(options.maxLabelDarkness)
    ? options.maxLabelDarkness
    : 0.36;
  const maxLabels = Number.isFinite(options.maxLabelCount)
    ? Math.max(0, Math.floor(options.maxLabelCount))
    : 72;

  const labels = [];
  let next = 1;

  for (const floor of floors) {
    const area = floor.w * floor.h;
    if (area < minArea) continue;

    const aspect =
      Math.max(floor.w, floor.h) / Math.max(1, Math.min(floor.w, floor.h));
    if (aspect > 3.5) continue;

    const cx = Math.floor(floor.x + floor.w / 2);
    const cy = Math.floor(floor.y + floor.h / 2);

    const darkness = sampleCellDarkness(
      luma,
      pixelWidth,
      pixelHeight,
      grid,
      clamp(cx, 0, grid.gridWidth - 1),
      clamp(cy, 0, grid.gridHeight - 1),
      0.3,
    );

    if (darkness < minDarkness || darkness > maxDarkness) continue;

    labels.push({
      text: String(next++),
      x: clamp(cx, 0, grid.gridWidth - 1),
      y: clamp(cy, 0, grid.gridHeight - 1),
      _score: darkness,
    });
  }

  labels.sort((a, b) => b._score - a._score);
  return labels.slice(0, maxLabels).map((label) => ({
    text: label.text,
    x: label.x,
    y: label.y,
  }));
}

function extractMapIrFromRaw(raw, width, height, channels = 4, options = {}) {
  if (!raw || typeof raw.length !== "number") {
    throw new Error("raw pixel buffer is required");
  }

  assertFiniteNumber(width, "width");
  assertFiniteNumber(height, "height");
  assertFiniteNumber(channels, "channels");

  if (width <= 0 || height <= 0 || channels < 3) {
    throw new Error("invalid image dimensions or channels");
  }

  const minGridPx = Number.isFinite(options.minGridPx) ? options.minGridPx : 8;
  const maxGridPx = Number.isFinite(options.maxGridPx) ? options.maxGridPx : 80;

  const explicitFloorLuminanceThreshold = Number.isFinite(
    options.floorLuminanceThreshold,
  )
    ? options.floorLuminanceThreshold
    : null;

  const floorCellRatioThreshold = Number.isFinite(
    options.floorCellRatioThreshold,
  )
    ? options.floorCellRatioThreshold
    : 0.38;

  const { luma, rowDarkness, colDarkness } = computeLumaAndDarkProfiles(
    raw,
    width,
    height,
    channels,
  );

  const xSpacing = detectGridSpacing(colDarkness, minGridPx, maxGridPx);
  const ySpacing = detectGridSpacing(rowDarkness, minGridPx, maxGridPx);

  const chosenSpacing = chooseGridSpacing(
    xSpacing,
    ySpacing,
    minGridPx,
    maxGridPx,
  );

  const phaseX = detectGridPhase(colDarkness, chosenSpacing);
  const phaseY = detectGridPhase(rowDarkness, chosenSpacing);

  const maxCells = Number.isFinite(options.maxCells)
    ? Math.max(8, Math.floor(options.maxCells))
    : 128;

  const floorRatioMin = Number.isFinite(options.floorRatioMin)
    ? options.floorRatioMin
    : 0.36;
  const floorRatioMax = Number.isFinite(options.floorRatioMax)
    ? options.floorRatioMax
    : 0.52;
  const thresholdTuningStep = Number.isFinite(options.thresholdTuningStep)
    ? options.thresholdTuningStep
    : 0.02;
  const thresholdTuningAttempts = Number.isFinite(
    options.thresholdTuningAttempts,
  )
    ? Math.max(0, Math.floor(options.thresholdTuningAttempts))
    : 5;

  const initialFloorThreshold =
    explicitFloorLuminanceThreshold !== null
      ? explicitFloorLuminanceThreshold
      : computeOtsuThreshold(luma);

  const sampleAtThreshold = (threshold) => {
    const mask = buildFloorMask(luma, width, height, threshold);
    const bounds = findMaskBounds(mask, width, height) || {
      minX: 0,
      minY: 0,
      maxX: width - 1,
      maxY: height - 1,
    };

    const startX = alignGridStart(phaseX, bounds.minX, chosenSpacing);
    const startY = alignGridStart(phaseY, bounds.minY, chosenSpacing);

    const gridWidth = clamp(
      Math.floor((bounds.maxX + 1 - startX) / chosenSpacing),
      1,
      maxCells,
    );
    const gridHeight = clamp(
      Math.floor((bounds.maxY + 1 - startY) / chosenSpacing),
      1,
      maxCells,
    );

    const sampled = sampleCellGrid(
      mask,
      width,
      height,
      {
        startX,
        startY,
        spacing: chosenSpacing,
        gridWidth,
        gridHeight,
        floorCellRatioThreshold,
      },
      options,
    );

    const floorCellRatio =
      gridWidth * gridHeight > 0
        ? sampled.floorCellCount / (gridWidth * gridHeight)
        : 0;

    return {
      threshold,
      mask,
      bounds,
      startX,
      startY,
      gridWidth,
      gridHeight,
      sampled,
      floorCellRatio,
    };
  };

  let extraction = sampleAtThreshold(initialFloorThreshold);
  const thresholdHistory = [initialFloorThreshold];

  if (explicitFloorLuminanceThreshold === null) {
    for (let attempt = 0; attempt < thresholdTuningAttempts; attempt++) {
      if (
        extraction.floorCellRatio >= floorRatioMin &&
        extraction.floorCellRatio <= floorRatioMax
      ) {
        break;
      }

      let nextThreshold = extraction.threshold;
      if (extraction.floorCellRatio > floorRatioMax) {
        nextThreshold += thresholdTuningStep;
      } else if (extraction.floorCellRatio < floorRatioMin) {
        nextThreshold -= thresholdTuningStep;
      }
      nextThreshold = clamp(nextThreshold, 0.52, 0.92);

      if (Math.abs(nextThreshold - extraction.threshold) < 1e-6) {
        break;
      }

      thresholdHistory.push(nextThreshold);
      extraction = sampleAtThreshold(nextThreshold);
    }
  }

  const floors = compressFloorRects(extraction.sampled.cells);
  const walls = deriveWallSegments(extraction.sampled.cells);

  const gridInfo = {
    startX: extraction.startX,
    startY: extraction.startY,
    spacing: chosenSpacing,
    gridWidth: extraction.gridWidth,
    gridHeight: extraction.gridHeight,
  };

  const thresholds =
    options.extractThresholds === false
      ? []
      : extractHighConfidenceDoorThresholds(
          extraction.sampled.cells,
          luma,
          width,
          height,
          gridInfo,
          options,
        );
  const labels =
    options.extractLabels === false
      ? []
      : extractHighConfidenceLabels(
          floors,
          luma,
          width,
          height,
          gridInfo,
          options,
        );

  const diagnostics = {
    pixelWidth: width,
    pixelHeight: height,
    xSpacing,
    ySpacing,
    chosenSpacing,
    phaseX,
    phaseY,
    bounds: extraction.bounds,
    floorLuminanceThreshold: extraction.threshold,
    floorThresholdMode:
      explicitFloorLuminanceThreshold !== null ? "manual" : "adaptive-otsu",
    floorThresholdHistory: thresholdHistory,
    floorCellCount: extraction.sampled.floorCellCount,
    floorCellRatio: extraction.floorCellRatio,
    thresholdCount: thresholds.length,
    labelCount: labels.length,
  };

  const mapIr = createMapIr({
    meta: {
      width: extraction.gridWidth,
      height: extraction.gridHeight,
      cellSizeFt: Number.isFinite(options.cellSizeFt) ? options.cellSizeFt : 10,
      title:
        typeof options.title === "string" && options.title.trim()
          ? options.title.trim()
          : undefined,
    },
    grid: {
      cellSizePx: chosenSpacing,
      originPx: {
        x: extraction.startX,
        y: extraction.startY,
      },
      boundsPx: extraction.bounds,
    },
    floors,
    walls,
    thresholds,
    labels,
    diagnostics,
  });

  return {
    mapIr,
    diagnostics,
  };
}

async function extractMapIrFromImage(imagePath, options = {}) {
  if (typeof imagePath !== "string" || imagePath.trim().length === 0) {
    throw new Error("imagePath must be a non-empty string");
  }

  const maxSize = Number.isFinite(options.maxSize)
    ? Math.max(256, Math.floor(options.maxSize))
    : 1600;

  const { data, info } = await sharp(imagePath)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return extractMapIrFromRaw(data, info.width, info.height, info.channels, {
    ...options,
    sourcePath: imagePath,
  });
}

module.exports = {
  extractMapIrFromRaw,
  extractMapIrFromImage,
  detectGridSpacing,
  detectGridPhase,
  chooseGridSpacing,
  computeOtsuThreshold,
  compressFloorRects,
  deriveWallSegments,
  extractHighConfidenceDoorThresholds,
  extractHighConfidenceLabels,
};
