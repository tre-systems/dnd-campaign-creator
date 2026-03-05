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

  const floorLuminanceThreshold = Number.isFinite(
    options.floorLuminanceThreshold,
  )
    ? options.floorLuminanceThreshold
    : 0.78;

  const floorCellRatioThreshold = Number.isFinite(
    options.floorCellRatioThreshold,
  )
    ? options.floorCellRatioThreshold
    : 0.38;

  const maxCells = Number.isFinite(options.maxCells)
    ? Math.max(8, Math.floor(options.maxCells))
    : 128;

  const { luma, rowDarkness, colDarkness } = computeLumaAndDarkProfiles(
    raw,
    width,
    height,
    channels,
  );

  const xSpacing = detectGridSpacing(colDarkness, minGridPx, maxGridPx);
  const ySpacing = detectGridSpacing(rowDarkness, minGridPx, maxGridPx);

  const chosenSpacing = clamp(
    Math.round(
      ((xSpacing ? xSpacing.spacing : minGridPx) +
        (ySpacing ? ySpacing.spacing : minGridPx)) /
        (xSpacing && ySpacing ? 2 : 1),
    ),
    minGridPx,
    maxGridPx,
  );

  const phaseX = detectGridPhase(colDarkness, chosenSpacing);
  const phaseY = detectGridPhase(rowDarkness, chosenSpacing);

  const mask = buildFloorMask(luma, width, height, floorLuminanceThreshold);
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

  const floors = compressFloorRects(sampled.cells);
  const walls = deriveWallSegments(sampled.cells);

  const diagnostics = {
    pixelWidth: width,
    pixelHeight: height,
    xSpacing,
    ySpacing,
    chosenSpacing,
    phaseX,
    phaseY,
    bounds,
    floorCellCount: sampled.floorCellCount,
    floorCellRatio:
      gridWidth * gridHeight > 0
        ? sampled.floorCellCount / (gridWidth * gridHeight)
        : 0,
  };

  const mapIr = createMapIr({
    meta: {
      width: gridWidth,
      height: gridHeight,
      cellSizeFt: Number.isFinite(options.cellSizeFt) ? options.cellSizeFt : 10,
      title:
        typeof options.title === "string" && options.title.trim()
          ? options.title.trim()
          : undefined,
    },
    grid: {
      cellSizePx: chosenSpacing,
      originPx: {
        x: startX,
        y: startY,
      },
      boundsPx: bounds,
    },
    floors,
    walls,
    thresholds: [],
    labels: [],
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
  compressFloorRects,
  deriveWallSegments,
};
