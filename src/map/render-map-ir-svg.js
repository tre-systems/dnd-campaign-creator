"use strict";

const { assertValidMapIr } = require("./map-ir");

const DEFAULT_PALETTE = {
  background: "#4393be",
  floor: "#fcfdfe",
  grid: "#cde2ec",
  wall: "#6aa7c7",
  symbol: "#5a98b8",
  label: "#4f89a8",
};

const ADAPTIVE_PALETTE = {
  targetFloorRatio: 0.48,
  sparseLightenScale: 1.92,
  denseDarkenScale: 0.96,
  maxMix: 0.9,
  darkBackground: "#2c76a6",
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const normalized = hex.trim().toLowerCase();
  const match = normalized.match(/^#([0-9a-f]{6})$/);
  if (!match) return null;

  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  return `#${rgb
    .map((component) =>
      Math.min(255, Math.max(0, Math.round(component)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mixHexColors(sourceHex, targetHex, amount) {
  const source = hexToRgb(sourceHex);
  const target = hexToRgb(targetHex);
  if (!source || !target) return sourceHex;

  const t = Math.min(1, Math.max(0, amount));
  const mixed = [
    source[0] * (1 - t) + target[0] * t,
    source[1] * (1 - t) + target[1] * t,
    source[2] * (1 - t) + target[2] * t,
  ];
  return rgbToHex(mixed) || sourceHex;
}

function resolvePalette(mapIr, options = {}) {
  const hasCustomPalette =
    options.palette && typeof options.palette === "object";
  const palette = {
    ...DEFAULT_PALETTE,
    ...(hasCustomPalette ? options.palette : {}),
  };

  if (hasCustomPalette || options.disableAdaptivePalette === true) {
    return palette;
  }

  const floorRatio = Number.isFinite(mapIr?.diagnostics?.floorCellRatio)
    ? mapIr.diagnostics.floorCellRatio
    : null;
  if (floorRatio === null) {
    return palette;
  }

  const delta = floorRatio - ADAPTIVE_PALETTE.targetFloorRatio;
  if (Math.abs(delta) < 1e-6) {
    return palette;
  }

  if (delta < 0) {
    const mixAmount = Math.min(
      ADAPTIVE_PALETTE.maxMix,
      -delta * ADAPTIVE_PALETTE.sparseLightenScale,
    );
    return {
      ...palette,
      background: mixHexColors(palette.background, "#ffffff", mixAmount),
    };
  }

  const mixAmount = Math.min(
    ADAPTIVE_PALETTE.maxMix,
    delta * ADAPTIVE_PALETTE.denseDarkenScale,
  );
  return {
    ...palette,
    background: mixHexColors(
      palette.background,
      ADAPTIVE_PALETTE.darkBackground,
      mixAmount,
    ),
  };
}

function renderThreshold(threshold, cellSize, palette) {
  const cx = (threshold.x + 0.5) * cellSize;
  const cy = (threshold.y + 0.5) * cellSize;
  const size = Math.max(2, cellSize * 0.35);

  if (threshold.type === "door") {
    return `<rect x="${(cx - size / 2).toFixed(2)}" y="${(cy - size / 4).toFixed(2)}" width="${size.toFixed(2)}" height="${(size / 2).toFixed(2)}" fill="none" stroke="${palette.symbol}" stroke-width="${Math.max(1, cellSize * 0.05).toFixed(2)}" />`;
  }

  if (threshold.type === "locked") {
    const stroke = Math.max(1, cellSize * 0.05).toFixed(2);
    return `<g stroke="${palette.symbol}" fill="none" stroke-width="${stroke}"><rect x="${(cx - size / 2).toFixed(2)}" y="${(cy - size / 4).toFixed(2)}" width="${size.toFixed(2)}" height="${(size / 2).toFixed(2)}" /><circle cx="${cx.toFixed(2)}" cy="${(cy - size * 0.35).toFixed(2)}" r="${(size * 0.14).toFixed(2)}" /></g>`;
  }

  // secret
  const dash = Math.max(1, cellSize * 0.06).toFixed(2);
  return `<line x1="${(cx - size / 2).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + size / 2).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="${palette.symbol}" stroke-width="${dash}" stroke-dasharray="${dash} ${dash}" />`;
}

function renderMapIrSvg(mapIr, options = {}) {
  assertValidMapIr(mapIr);

  const cellSize = Number.isFinite(options.cellSize)
    ? Math.max(6, options.cellSize)
    : 20;
  const palette = resolvePalette(mapIr, options);

  const width = mapIr.meta.width * cellSize;
  const height = mapIr.meta.height * cellSize;
  const wallStroke = Math.max(1.2, cellSize * 0.12);
  const gridStroke = Math.max(0.5, cellSize * 0.04);

  const floorRects = mapIr.floors
    .map((floor) => {
      const x = floor.x * cellSize;
      const y = floor.y * cellSize;
      const w = floor.w * cellSize;
      const h = floor.h * cellSize;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${palette.floor}" />`;
    })
    .join("\n");

  const gridLines = [];
  for (let x = 0; x <= mapIr.meta.width; x++) {
    const px = x * cellSize;
    gridLines.push(
      `<line x1="${px.toFixed(2)}" y1="0" x2="${px.toFixed(2)}" y2="${height.toFixed(2)}" />`,
    );
  }
  for (let y = 0; y <= mapIr.meta.height; y++) {
    const py = y * cellSize;
    gridLines.push(
      `<line x1="0" y1="${py.toFixed(2)}" x2="${width.toFixed(2)}" y2="${py.toFixed(2)}" />`,
    );
  }

  const wallLines = mapIr.walls
    .map((wall) => {
      return `<line x1="${(wall.x1 * cellSize).toFixed(2)}" y1="${(wall.y1 * cellSize).toFixed(2)}" x2="${(wall.x2 * cellSize).toFixed(2)}" y2="${(wall.y2 * cellSize).toFixed(2)}" />`;
    })
    .join("\n");

  const thresholds = (Array.isArray(mapIr.thresholds) ? mapIr.thresholds : [])
    .map((threshold) => renderThreshold(threshold, cellSize, palette))
    .join("\n");

  const labels = (Array.isArray(mapIr.labels) ? mapIr.labels : [])
    .map((label) => {
      const x = (label.x + 0.5) * cellSize;
      const y = (label.y + 0.62) * cellSize;
      return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle">${escapeXml(label.text)}</text>`;
    })
    .join("\n");

  const title =
    typeof mapIr.meta.title === "string" ? mapIr.meta.title.trim() : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" role="img" aria-label="MapIR render${title ? `: ${escapeXml(title)}` : ""}">
  <defs>
    <style>
      .grid { stroke: ${palette.grid}; stroke-width: ${gridStroke.toFixed(2)}; opacity: 0.72; }
      .walls { stroke: ${palette.wall}; stroke-width: ${wallStroke.toFixed(2)}; fill: none; stroke-linecap: square; }
      .thresholds { fill: none; stroke-linecap: round; }
      .labels { fill: ${palette.label}; font-size: ${(cellSize * 0.45).toFixed(2)}px; font-family: "Courier New", monospace; font-weight: 600; }
    </style>
  </defs>
  <rect x="0" y="0" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="${palette.background}" />
  <g class="floors">
${floorRects}
  </g>
  <g class="grid">
${gridLines.join("\n")}
  </g>
  <g class="walls">
${wallLines}
  </g>
  <g class="thresholds">
${thresholds}
  </g>
  <g class="labels">
${labels}
  </g>
</svg>`;
}

module.exports = {
  renderMapIrSvg,
  DEFAULT_PALETTE,
};
