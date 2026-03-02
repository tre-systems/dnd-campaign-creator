/**
 * Old-school SVG dungeon map renderer.
 * Produces TSR/Judges Guild style dungeon maps.
 * Layer 4 of the four-layer map system.
 *
 * @module map/render-svg
 */

const { CELL, isFloorLike } = require("./geometry");

/**
 * Compute wall segments from the grid.
 * A wall segment exists on every edge between a floor-like cell and a wall cell.
 *
 * @param {number[][]} cells - Grid
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {{x1: number, y1: number, x2: number, y2: number, direction: string}[]}
 */
function computeWallSegments(cells, width, height) {
  const segments = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFloorLike(cells[y][x])) continue;

      // Top edge
      if (y === 0 || !isFloorLike(cells[y - 1][x])) {
        segments.push({
          x1: x,
          y1: y,
          x2: x + 1,
          y2: y,
          direction: "horizontal",
        });
      }
      // Bottom edge
      if (y === height - 1 || !isFloorLike(cells[y + 1][x])) {
        segments.push({
          x1: x,
          y1: y + 1,
          x2: x + 1,
          y2: y + 1,
          direction: "horizontal",
        });
      }
      // Left edge
      if (x === 0 || !isFloorLike(cells[y][x - 1])) {
        segments.push({
          x1: x,
          y1: y,
          x2: x,
          y2: y + 1,
          direction: "vertical",
        });
      }
      // Right edge
      if (x === width - 1 || !isFloorLike(cells[y][x + 1])) {
        segments.push({
          x1: x + 1,
          y1: y,
          x2: x + 1,
          y2: y + 1,
          direction: "vertical",
        });
      }
    }
  }

  return mergeCollinearSegments(segments);
}

/**
 * Merge adjacent collinear wall segments for cleaner SVG output.
 *
 * @param {Object[]} segments - Raw wall segments
 * @returns {Object[]} Merged segments
 */
function mergeCollinearSegments(segments) {
  const merged = [];

  // Group horizontal segments by y, merge adjacent x ranges
  const horizontal = segments.filter((s) => s.direction === "horizontal");
  const byY = new Map();
  for (const seg of horizontal) {
    const key = seg.y1;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push(seg);
  }
  for (const [, segs] of byY) {
    segs.sort((a, b) => a.x1 - b.x1);
    let current = { ...segs[0] };
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].x1 === current.x2) {
        current.x2 = segs[i].x2;
      } else {
        merged.push(current);
        current = { ...segs[i] };
      }
    }
    merged.push(current);
  }

  // Group vertical segments by x, merge adjacent y ranges
  const vertical = segments.filter((s) => s.direction === "vertical");
  const byX = new Map();
  for (const seg of vertical) {
    const key = seg.x1;
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key).push(seg);
  }
  for (const [, segs] of byX) {
    segs.sort((a, b) => a.y1 - b.y1);
    let current = { ...segs[0] };
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].y1 === current.y2) {
        current.y2 = segs[i].y2;
      } else {
        merged.push(current);
        current = { ...segs[i] };
      }
    }
    merged.push(current);
  }

  return merged;
}

/**
 * Render an SVG symbol for a feature cell.
 *
 * @param {number} cellType - CELL constant
 * @param {number} px - Pixel x (top-left of cell)
 * @param {number} py - Pixel y (top-left of cell)
 * @param {number} cs - Cell size in pixels
 * @returns {string} SVG element string
 */
function renderFeatureSymbol(cellType, px, py, cs) {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const r = cs * 0.3;

  switch (cellType) {
    case CELL.DOOR:
      // Classic door: filled rectangle across the opening
      return `<rect class="door" x="${cx - r}" y="${cy - r * 0.4}" width="${r * 2}" height="${r * 0.8}" rx="1"/>`;

    case CELL.DOOR_LOCKED:
      // Locked door: filled rectangle with keyhole circle
      return [
        `<rect class="door-locked" x="${cx - r}" y="${cy - r * 0.4}" width="${r * 2}" height="${r * 0.8}" rx="1"/>`,
        `<circle class="door-locked-key" cx="${cx}" cy="${cy}" r="${r * 0.2}"/>`,
      ].join("\n      ");

    case CELL.DOOR_SECRET:
      // Secret door: dashed line with S marker
      return [
        `<line class="door-secret" x1="${px + 2}" y1="${cy}" x2="${px + cs - 2}" y2="${cy}"/>`,
        `<text class="secret-label" x="${cx}" y="${cy + 1}" font-size="${cs * 0.4}" text-anchor="middle" dominant-baseline="central">S</text>`,
      ].join("\n      ");

    case CELL.DOUBLE_DOOR:
      // Double door: two rectangles side by side with gap
      return [
        `<rect class="door" x="${cx - r}" y="${cy - r * 0.4}" width="${r * 0.85}" height="${r * 0.8}" rx="1"/>`,
        `<rect class="door" x="${cx + r * 0.15}" y="${cy - r * 0.4}" width="${r * 0.85}" height="${r * 0.8}" rx="1"/>`,
      ].join("\n      ");

    case CELL.PORTCULLIS:
      // Portcullis: vertical bars (classic grate symbol)
      return [
        `<line class="portcullis" x1="${px + cs * 0.2}" y1="${py + cs * 0.15}" x2="${px + cs * 0.2}" y2="${py + cs * 0.85}"/>`,
        `<line class="portcullis" x1="${px + cs * 0.4}" y1="${py + cs * 0.15}" x2="${px + cs * 0.4}" y2="${py + cs * 0.85}"/>`,
        `<line class="portcullis" x1="${px + cs * 0.6}" y1="${py + cs * 0.15}" x2="${px + cs * 0.6}" y2="${py + cs * 0.85}"/>`,
        `<line class="portcullis" x1="${px + cs * 0.8}" y1="${py + cs * 0.15}" x2="${px + cs * 0.8}" y2="${py + cs * 0.85}"/>`,
        `<line class="portcullis" x1="${px + cs * 0.15}" y1="${py + cs * 0.35}" x2="${px + cs * 0.85}" y2="${py + cs * 0.35}"/>`,
        `<line class="portcullis" x1="${px + cs * 0.15}" y1="${py + cs * 0.65}" x2="${px + cs * 0.85}" y2="${py + cs * 0.65}"/>`,
      ].join("\n      ");

    case CELL.ARCHWAY:
      // Archway: open arch symbol (curved line over opening)
      return [
        `<path class="archway" d="M ${px + cs * 0.15} ${py + cs * 0.8} Q ${cx} ${py + cs * 0.15} ${px + cs * 0.85} ${py + cs * 0.8}"/>`,
        `<circle class="archway-base" cx="${px + cs * 0.15}" cy="${py + cs * 0.8}" r="${cs * 0.06}"/>`,
        `<circle class="archway-base" cx="${px + cs * 0.85}" cy="${py + cs * 0.8}" r="${cs * 0.06}"/>`,
      ].join("\n      ");

    case CELL.CURTAIN:
      // Curtain: wavy line across opening
      return `<path class="curtain" d="M ${px + cs * 0.1} ${cy} Q ${px + cs * 0.3} ${cy - r * 0.8} ${cx} ${cy} Q ${px + cs * 0.7} ${cy + r * 0.8} ${px + cs * 0.9} ${cy}"/>`;

    case CELL.STAIRS_DOWN:
      // Stairs down: parallel lines with down arrow
      return [
        `<line class="stairs" x1="${px + cs * 0.25}" y1="${py + cs * 0.2}" x2="${px + cs * 0.25}" y2="${py + cs * 0.8}"/>`,
        `<line class="stairs" x1="${px + cs * 0.5}" y1="${py + cs * 0.2}" x2="${px + cs * 0.5}" y2="${py + cs * 0.8}"/>`,
        `<line class="stairs" x1="${px + cs * 0.75}" y1="${py + cs * 0.2}" x2="${px + cs * 0.75}" y2="${py + cs * 0.8}"/>`,
        `<polygon class="stairs-arrow" points="${cx - r * 0.5},${py + cs * 0.55} ${cx + r * 0.5},${py + cs * 0.55} ${cx},${py + cs * 0.85}"/>`,
      ].join("\n      ");

    case CELL.STAIRS_UP:
      // Stairs up: parallel lines with up arrow
      return [
        `<line class="stairs" x1="${px + cs * 0.25}" y1="${py + cs * 0.2}" x2="${px + cs * 0.25}" y2="${py + cs * 0.8}"/>`,
        `<line class="stairs" x1="${px + cs * 0.5}" y1="${py + cs * 0.2}" x2="${px + cs * 0.5}" y2="${py + cs * 0.8}"/>`,
        `<line class="stairs" x1="${px + cs * 0.75}" y1="${py + cs * 0.2}" x2="${px + cs * 0.75}" y2="${py + cs * 0.8}"/>`,
        `<polygon class="stairs-arrow" points="${cx - r * 0.5},${py + cs * 0.45} ${cx + r * 0.5},${py + cs * 0.45} ${cx},${py + cs * 0.15}"/>`,
      ].join("\n      ");

    case CELL.PILLAR:
      // Pillar: filled circle (classic column symbol)
      return `<circle class="pillar" cx="${cx}" cy="${cy}" r="${r * 0.6}"/>`;

    case CELL.STATUE:
      // Statue: circle on a square base (classic statue symbol)
      return [
        `<rect class="statue-base" x="${cx - r * 0.7}" y="${cy - r * 0.7}" width="${r * 1.4}" height="${r * 1.4}"/>`,
        `<circle class="statue" cx="${cx}" cy="${cy}" r="${r * 0.45}"/>`,
      ].join("\n      ");

    case CELL.ALTAR:
      // Altar: rectangle with cross on top
      return [
        `<rect class="altar" x="${cx - r}" y="${cy - r * 0.5}" width="${r * 2}" height="${r * 1.2}" rx="1"/>`,
        `<line class="altar-cross" x1="${cx}" y1="${cy - r * 0.3}" x2="${cx}" y2="${cy + r * 0.3}"/>`,
        `<line class="altar-cross" x1="${cx - r * 0.3}" y1="${cy - r * 0.05}" x2="${cx + r * 0.3}" y2="${cy - r * 0.05}"/>`,
      ].join("\n      ");

    case CELL.WELL:
      // Well: concentric circles (classic well symbol)
      return [
        `<circle class="well-outer" cx="${cx}" cy="${cy}" r="${r * 0.8}"/>`,
        `<circle class="well-inner" cx="${cx}" cy="${cy}" r="${r * 0.4}"/>`,
      ].join("\n      ");

    case CELL.FOUNTAIN:
      // Fountain: concentric circles with small jets
      return [
        `<circle class="fountain-outer" cx="${cx}" cy="${cy}" r="${r * 0.9}"/>`,
        `<circle class="fountain-inner" cx="${cx}" cy="${cy}" r="${r * 0.35}"/>`,
        `<line class="fountain-jet" x1="${cx}" y1="${cy - r * 0.35}" x2="${cx}" y2="${cy - r * 0.8}"/>`,
        `<line class="fountain-jet" x1="${cx - r * 0.25}" y1="${cy + r * 0.25}" x2="${cx - r * 0.6}" y2="${cy + r * 0.6}"/>`,
        `<line class="fountain-jet" x1="${cx + r * 0.25}" y1="${cy + r * 0.25}" x2="${cx + r * 0.6}" y2="${cy + r * 0.6}"/>`,
      ].join("\n      ");

    case CELL.FIREPIT:
      // Firepit: circle with flame-like triangles
      return [
        `<circle class="firepit" cx="${cx}" cy="${cy}" r="${r * 0.7}"/>`,
        `<polygon class="firepit-flame" points="${cx},${cy - r * 0.5} ${cx - r * 0.2},${cy + r * 0.1} ${cx + r * 0.2},${cy + r * 0.1}"/>`,
        `<polygon class="firepit-flame" points="${cx - r * 0.3},${cy - r * 0.2} ${cx - r * 0.45},${cy + r * 0.2} ${cx - r * 0.15},${cy + r * 0.2}"/>`,
        `<polygon class="firepit-flame" points="${cx + r * 0.3},${cy - r * 0.2} ${cx + r * 0.15},${cy + r * 0.2} ${cx + r * 0.45},${cy + r * 0.2}"/>`,
      ].join("\n      ");

    case CELL.THRONE:
      // Throne: chair shape (classic throne symbol)
      return [
        `<rect class="throne" x="${cx - r * 0.6}" y="${cy - r * 0.8}" width="${r * 1.2}" height="${r * 1.6}" rx="2"/>`,
        `<rect class="throne-seat" x="${cx - r * 0.5}" y="${cy}" width="${r * 1.0}" height="${r * 0.6}"/>`,
        `<line class="throne-arm" x1="${cx - r * 0.6}" y1="${cy}" x2="${cx - r * 0.6}" y2="${cy + r * 0.5}"/>`,
        `<line class="throne-arm" x1="${cx + r * 0.6}" y1="${cy}" x2="${cx + r * 0.6}" y2="${cy + r * 0.5}"/>`,
      ].join("\n      ");

    case CELL.SARCOPHAGUS:
      // Sarcophagus: elongated rectangle with inner rectangle
      return [
        `<rect class="sarcophagus" x="${cx - r * 1.1}" y="${cy - r * 0.5}" width="${r * 2.2}" height="${r * 1.0}" rx="2"/>`,
        `<rect class="sarcophagus-lid" x="${cx - r * 0.8}" y="${cy - r * 0.3}" width="${r * 1.6}" height="${r * 0.6}" rx="1"/>`,
      ].join("\n      ");

    case CELL.BARS:
      // Iron bars/cell bars: vertical lines
      return [
        `<line class="bars" x1="${px + cs * 0.2}" y1="${py + cs * 0.1}" x2="${px + cs * 0.2}" y2="${py + cs * 0.9}"/>`,
        `<line class="bars" x1="${px + cs * 0.4}" y1="${py + cs * 0.1}" x2="${px + cs * 0.4}" y2="${py + cs * 0.9}"/>`,
        `<line class="bars" x1="${px + cs * 0.6}" y1="${py + cs * 0.1}" x2="${px + cs * 0.6}" y2="${py + cs * 0.9}"/>`,
        `<line class="bars" x1="${px + cs * 0.8}" y1="${py + cs * 0.1}" x2="${px + cs * 0.8}" y2="${py + cs * 0.9}"/>`,
      ].join("\n      ");

    case CELL.PIT:
      // Pit trap: square with diagonal cross-hatch
      return [
        `<rect class="pit" x="${px + cs * 0.15}" y="${py + cs * 0.15}" width="${cs * 0.7}" height="${cs * 0.7}"/>`,
        `<line class="pit-hatch" x1="${px + cs * 0.15}" y1="${py + cs * 0.15}" x2="${px + cs * 0.85}" y2="${py + cs * 0.85}"/>`,
        `<line class="pit-hatch" x1="${px + cs * 0.85}" y1="${py + cs * 0.15}" x2="${px + cs * 0.15}" y2="${py + cs * 0.85}"/>`,
      ].join("\n      ");

    case CELL.LEVER:
      // Lever: small circle with line (switch/mechanism)
      return [
        `<circle class="lever-base" cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.3}"/>`,
        `<line class="lever-arm" x1="${cx}" y1="${cy + r * 0.3}" x2="${cx + r * 0.5}" y2="${cy - r * 0.6}"/>`,
        `<circle class="lever-handle" cx="${cx + r * 0.5}" cy="${cy - r * 0.6}" r="${r * 0.15}"/>`,
      ].join("\n      ");

    case CELL.TRAP:
      // Trap: X mark (classic trap symbol)
      return [
        `<line class="trap" x1="${px + cs * 0.25}" y1="${py + cs * 0.25}" x2="${px + cs * 0.75}" y2="${py + cs * 0.75}"/>`,
        `<line class="trap" x1="${px + cs * 0.75}" y1="${py + cs * 0.25}" x2="${px + cs * 0.25}" y2="${py + cs * 0.75}"/>`,
      ].join("\n      ");

    case CELL.WATER:
      // Water: blue-filled rect with wave lines
      return [
        `<rect class="water" x="${px}" y="${py}" width="${cs}" height="${cs}"/>`,
        `<path class="water-wave" d="M ${px + cs * 0.1} ${cy - r * 0.2} Q ${px + cs * 0.3} ${cy - r * 0.6} ${cx} ${cy - r * 0.2} Q ${px + cs * 0.7} ${cy + r * 0.2} ${px + cs * 0.9} ${cy - r * 0.2}"/>`,
        `<path class="water-wave" d="M ${px + cs * 0.1} ${cy + r * 0.4} Q ${px + cs * 0.3} ${cy} ${cx} ${cy + r * 0.4} Q ${px + cs * 0.7} ${cy + r * 0.8} ${px + cs * 0.9} ${cy + r * 0.4}"/>`,
      ].join("\n      ");

    case CELL.TREASURE:
      // Treasure: diamond shape (classic hoard symbol)
      return `<polygon class="treasure" points="${cx},${py + cs * 0.2} ${px + cs * 0.8},${cy} ${cx},${py + cs * 0.8} ${px + cs * 0.2},${cy}"/>`;

    case CELL.COLLAPSED:
      // Collapsed passage: rubble fill with scattered dots
      return [
        `<rect class="collapsed" x="${px}" y="${py}" width="${cs}" height="${cs}"/>`,
        `<circle class="rubble-dot" cx="${cx - r * 0.5}" cy="${cy - r * 0.3}" r="${r * 0.15}"/>`,
        `<circle class="rubble-dot" cx="${cx + r * 0.3}" cy="${cy - r * 0.5}" r="${r * 0.2}"/>`,
        `<circle class="rubble-dot" cx="${cx}" cy="${cy + r * 0.2}" r="${r * 0.18}"/>`,
        `<circle class="rubble-dot" cx="${cx - r * 0.3}" cy="${cy + r * 0.5}" r="${r * 0.12}"/>`,
        `<circle class="rubble-dot" cx="${cx + r * 0.6}" cy="${cy + r * 0.3}" r="${r * 0.14}"/>`,
      ].join("\n      ");

    default:
      return "";
  }
}

/**
 * Generate the SVG stylesheet.
 * Default style is classic blue-map (TSR blue dungeon map aesthetic).
 *
 * @param {number} cellSize
 * @param {string} [colorScheme='blue'] - 'blue' for classic blue, 'parchment' for warm tones
 * @returns {string}
 */
function generateStyles(cellSize, colorScheme) {
  const wallWidth = cellSize < 15 ? 2 : 3;

  if (colorScheme === "parchment") {
    return `<style>
    .bg { fill: #f5f0e6; }
    .floor { fill: #f9f7f2; }
    .corridor { fill: #eeebe2; }
    .grid-line { stroke: #e0ddd4; stroke-width: 0.5; }
    .wall { stroke: #1a1a1a; stroke-width: ${wallWidth}; stroke-linecap: square; }
    .door { fill: #8b6914; stroke: #1a1a1a; stroke-width: 1; }
    .door-locked { fill: #8b6914; stroke: #1a1a1a; stroke-width: 1.5; }
    .door-locked-key { fill: #1a1a1a; stroke: none; }
    .door-secret { fill: none; stroke: #888; stroke-width: 1.5; stroke-dasharray: 3,3; }
    .secret-label { font-family: Georgia, serif; }
    .stairs { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
    .pillar { fill: #888; stroke: #1a1a1a; stroke-width: 1; }
    .trap { fill: none; stroke: #cc3333; stroke-width: 1.5; }
    .water { fill: #b8d4e3; stroke: none; }
    .treasure { fill: #daa520; stroke: #1a1a1a; stroke-width: 1; }
    .rubble { fill: #d5d0c4; }
    .portcullis { fill: none; stroke: #555; stroke-width: 1.5; }
    .archway { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
    .archway-base { fill: #1a1a1a; stroke: none; }
    .curtain { fill: none; stroke: #996633; stroke-width: 1.5; stroke-dasharray: 4,2; }
    .statue-base { fill: none; stroke: #555; stroke-width: 1; }
    .statue { fill: #888; stroke: #555; stroke-width: 1; }
    .altar { fill: none; stroke: #555; stroke-width: 1.5; }
    .altar-cross { stroke: #555; stroke-width: 1.5; }
    .well-outer { fill: none; stroke: #555; stroke-width: 1.5; }
    .well-inner { fill: #b8d4e3; stroke: #555; stroke-width: 1; }
    .fountain-outer { fill: none; stroke: #555; stroke-width: 1.5; }
    .fountain-inner { fill: #b8d4e3; stroke: #555; stroke-width: 1; }
    .fountain-jet { stroke: #7799bb; stroke-width: 1; }
    .firepit { fill: none; stroke: #aa4444; stroke-width: 1.5; }
    .firepit-flame { fill: #cc6633; stroke: none; }
    .throne { fill: none; stroke: #8b6914; stroke-width: 1.5; }
    .throne-seat { fill: #8b6914; stroke: none; opacity: 0.3; }
    .throne-arm { stroke: #8b6914; stroke-width: 1.5; }
    .sarcophagus { fill: none; stroke: #666; stroke-width: 1.5; }
    .sarcophagus-lid { fill: #999; stroke: #666; stroke-width: 1; opacity: 0.3; }
    .bars { stroke: #666; stroke-width: 1.5; }
    .pit { fill: none; stroke: #555; stroke-width: 1.5; }
    .pit-hatch { stroke: #555; stroke-width: 1; }
    .lever-base { fill: #666; stroke: #333; stroke-width: 1; }
    .lever-arm { stroke: #333; stroke-width: 1.5; }
    .lever-handle { fill: #333; stroke: none; }
    .collapsed { fill: #c8c0b0; stroke: none; }
    .rubble-dot { fill: #888; stroke: none; }
    .water-wave { fill: none; stroke: #fff; stroke-width: 0.8; opacity: 0.4; }
    .room-number { font-family: Georgia, serif; font-size: ${Math.max(10, cellSize * 0.7)}px; font-weight: bold; fill: #333; text-anchor: middle; dominant-baseline: central; }
    .room-name { font-family: Georgia, serif; font-size: ${Math.max(7, cellSize * 0.4)}px; fill: #777; text-anchor: middle; dominant-baseline: central; }
    .title-text { font-family: Georgia, serif; font-size: ${cellSize * 0.6}px; fill: #333; }
    .compass-text { font-family: Georgia, serif; font-size: ${cellSize * 0.5}px; fill: #555; text-anchor: middle; }
    .rock-hatch { stroke: #ccc8bc; stroke-width: 0.5; }
  </style>`;
  }

  // Classic blue dungeon map style (default)
  // Inspired by the original TSR/Judges Guild blue-and-white maps
  return `<style>
    .bg { fill: #1a3a5c; }
    .floor { fill: #e8e4d8; }
    .corridor { fill: #ddd8c8; }
    .grid-line { stroke: #c8c0b0; stroke-width: 0.5; }
    .wall { stroke: #0d1f33; stroke-width: ${wallWidth}; stroke-linecap: square; }
    .door { fill: #c8a050; stroke: #0d1f33; stroke-width: 1; }
    .door-locked { fill: #c8a050; stroke: #0d1f33; stroke-width: 1.5; }
    .door-locked-key { fill: #0d1f33; stroke: none; }
    .door-secret { fill: none; stroke: #8899aa; stroke-width: 1.5; stroke-dasharray: 3,3; }
    .secret-label { font-family: Georgia, serif; fill: #8899aa; }
    .stairs { fill: none; stroke: #2a2a2a; stroke-width: 1.5; }
    .pillar { fill: #999; stroke: #2a2a2a; stroke-width: 1; }
    .trap { fill: none; stroke: #cc4444; stroke-width: 1.5; }
    .water { fill: #6699bb; stroke: none; }
    .treasure { fill: #daa520; stroke: #2a2a2a; stroke-width: 1; }
    .rubble { fill: #c0b8a8; }
    .portcullis { fill: none; stroke: #4a4a4a; stroke-width: 1.5; }
    .archway { fill: none; stroke: #0d1f33; stroke-width: 1.5; }
    .archway-base { fill: #0d1f33; stroke: none; }
    .curtain { fill: none; stroke: #8b6914; stroke-width: 1.5; stroke-dasharray: 4,2; }
    .statue-base { fill: none; stroke: #4a4a4a; stroke-width: 1; }
    .statue { fill: #999; stroke: #4a4a4a; stroke-width: 1; }
    .altar { fill: none; stroke: #4a4a4a; stroke-width: 1.5; }
    .altar-cross { stroke: #4a4a4a; stroke-width: 1.5; }
    .well-outer { fill: none; stroke: #4a4a4a; stroke-width: 1.5; }
    .well-inner { fill: #6699bb; stroke: #4a4a4a; stroke-width: 1; }
    .fountain-outer { fill: none; stroke: #4a4a4a; stroke-width: 1.5; }
    .fountain-inner { fill: #6699bb; stroke: #4a4a4a; stroke-width: 1; }
    .fountain-jet { stroke: #88aacc; stroke-width: 1; }
    .firepit { fill: none; stroke: #aa4444; stroke-width: 1.5; }
    .firepit-flame { fill: #cc6633; stroke: none; }
    .throne { fill: none; stroke: #c8a050; stroke-width: 1.5; }
    .throne-seat { fill: #c8a050; stroke: none; opacity: 0.3; }
    .throne-arm { stroke: #c8a050; stroke-width: 1.5; }
    .sarcophagus { fill: none; stroke: #555; stroke-width: 1.5; }
    .sarcophagus-lid { fill: #888; stroke: #555; stroke-width: 1; opacity: 0.3; }
    .bars { stroke: #555; stroke-width: 1.5; }
    .pit { fill: none; stroke: #4a4a4a; stroke-width: 1.5; }
    .pit-hatch { stroke: #4a4a4a; stroke-width: 1; }
    .lever-base { fill: #555; stroke: #2a2a2a; stroke-width: 1; }
    .lever-arm { stroke: #2a2a2a; stroke-width: 1.5; }
    .lever-handle { fill: #2a2a2a; stroke: none; }
    .collapsed { fill: #b8b0a0; stroke: none; }
    .rubble-dot { fill: #777; stroke: none; }
    .water-wave { fill: none; stroke: #88bbdd; stroke-width: 0.8; opacity: 0.5; }
    .room-number { font-family: Georgia, serif; font-size: ${Math.max(10, cellSize * 0.7)}px; font-weight: bold; fill: #2a2a2a; text-anchor: middle; dominant-baseline: central; }
    .room-name { font-family: Georgia, serif; font-size: ${Math.max(7, cellSize * 0.4)}px; fill: #555; text-anchor: middle; dominant-baseline: central; }
    .title-text { font-family: Georgia, serif; font-size: ${cellSize * 0.6}px; fill: #e8e4d8; }
    .compass-text { font-family: Georgia, serif; font-size: ${cellSize * 0.5}px; fill: #8899aa; text-anchor: middle; }
    .rock-hatch { stroke: #2a4a6a; stroke-width: 0.5; }
  </style>`;
}

/**
 * Render grid lines over floor areas only.
 *
 * @param {number[][]} cells
 * @param {number} width
 * @param {number} height
 * @param {number} cs - Cell size
 * @returns {string} SVG group string
 */
function renderGridLines(cells, width, height, cs) {
  const lines = [];

  // Horizontal grid lines
  for (let y = 0; y <= height; y++) {
    // Find runs of floor-like cells at this y boundary
    let inFloor = false;
    let startX = 0;
    for (let x = 0; x < width; x++) {
      const above = y > 0 && isFloorLike(cells[y - 1][x]);
      const below = y < height && isFloorLike(cells[y][x]);
      const isFloor = above || below;
      if (isFloor && !inFloor) {
        startX = x;
        inFloor = true;
      } else if (!isFloor && inFloor) {
        lines.push(
          `<line class="grid-line" x1="${startX * cs}" y1="${y * cs}" x2="${x * cs}" y2="${y * cs}"/>`,
        );
        inFloor = false;
      }
    }
    if (inFloor) {
      lines.push(
        `<line class="grid-line" x1="${startX * cs}" y1="${y * cs}" x2="${width * cs}" y2="${y * cs}"/>`,
      );
    }
  }

  // Vertical grid lines
  for (let x = 0; x <= width; x++) {
    let inFloor = false;
    let startY = 0;
    for (let y = 0; y < height; y++) {
      const leftOf = x > 0 && isFloorLike(cells[y][x - 1]);
      const rightOf = x < width && isFloorLike(cells[y][x]);
      const isFloor = leftOf || rightOf;
      if (isFloor && !inFloor) {
        startY = y;
        inFloor = true;
      } else if (!isFloor && inFloor) {
        lines.push(
          `<line class="grid-line" x1="${x * cs}" y1="${startY * cs}" x2="${x * cs}" y2="${y * cs}"/>`,
        );
        inFloor = false;
      }
    }
    if (inFloor) {
      lines.push(
        `<line class="grid-line" x1="${x * cs}" y1="${startY * cs}" x2="${x * cs}" y2="${height * cs}"/>`,
      );
    }
  }

  return lines.join("\n    ");
}

/**
 * Render crosshatch pattern on wall/rock areas.
 *
 * @param {number[][]} cells
 * @param {number} width
 * @param {number} height
 * @param {number} cs - Cell size
 * @returns {string} SVG defs and pattern usage
 */
function renderRockHatch(cells, width, height, cs) {
  const parts = [];

  // Define crosshatch pattern
  parts.push(`<defs>
    <pattern id="rock-hatch" width="${cs}" height="${cs}" patternUnits="userSpaceOnUse">
      <line class="rock-hatch" x1="0" y1="0" x2="${cs}" y2="${cs}"/>
      <line class="rock-hatch" x1="${cs}" y1="0" x2="0" y2="${cs}"/>
    </pattern>
  </defs>`);

  // Apply to wall cells that are adjacent to at least one floor cell
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== CELL.WALL) continue;
      // Check if any neighbour is floor-like
      const hasFloorNeighbour =
        (y > 0 && isFloorLike(cells[y - 1][x])) ||
        (y < height - 1 && isFloorLike(cells[y + 1][x])) ||
        (x > 0 && isFloorLike(cells[y][x - 1])) ||
        (x < width - 1 && isFloorLike(cells[y][x + 1]));
      if (hasFloorNeighbour) {
        parts.push(
          `<rect x="${x * cs}" y="${y * cs}" width="${cs}" height="${cs}" fill="url(#rock-hatch)" opacity="0.3"/>`,
        );
      }
    }
  }

  return parts.join("\n    ");
}

/**
 * Render a compass rose in the top-right corner.
 *
 * @param {number} svgW - SVG width
 * @param {number} cs - Cell size
 * @returns {string} SVG group string
 */
function renderCompass(svgW, cs) {
  const cx = svgW - cs * 2;
  const cy = cs * 2;
  const r = cs * 0.8;
  return [
    `<g class="compass" transform="translate(${cx},${cy})">`,
    `  <line stroke="#999" stroke-width="1" x1="0" y1="${-r}" x2="0" y2="${r}"/>`,
    `  <line stroke="#999" stroke-width="1" x1="${-r}" y1="0" x2="${r}" y2="0"/>`,
    `  <text class="compass-text" x="0" y="${-r - 4}">N</text>`,
    `</g>`,
  ].join("\n    ");
}

/**
 * Render a dungeon map as an SVG string.
 *
 * @param {Object} geometry - Geometry with cells, rooms, corridors
 * @param {Object} graph - TopologyGraph for room labels
 * @param {Object} intent - Section metadata for title
 * @param {Object} [options] - Rendering options
 * @param {number} [options.cellSize=20] - Pixels per grid square
 * @param {boolean} [options.showGrid=true] - Show grid lines
 * @param {boolean} [options.showLabels=true] - Show room labels
 * @param {boolean} [options.showRockHatch=false] - Show rock crosshatch
 * @param {boolean} [options.showCompass=true] - Show compass rose
 * @param {string} [options.colorScheme='blue'] - 'blue' for classic blue, 'parchment' for warm tones
 * @returns {string} Complete SVG document as string
 */
function renderSvg(geometry, graph, intent, options) {
  options = options || {};
  const cs = options.cellSize || 20;
  const showGrid = options.showGrid !== false;
  const showLabels = options.showLabels !== false;
  const showRockHatch = options.showRockHatch !== false; // Default ON for blue maps
  const showCompass = options.showCompass !== false;
  const colorScheme = options.colorScheme || "blue";

  const svgW = geometry.width * cs;
  const svgH = geometry.height * cs;

  const parts = [];

  // SVG header
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`,
  );

  // Stylesheet
  parts.push(generateStyles(cs, colorScheme));

  // Background
  parts.push(`  <rect class="bg" width="${svgW}" height="${svgH}"/>`);

  // Rock hatching (optional, before floors so floors draw on top)
  if (showRockHatch) {
    parts.push(`  <g class="rock-hatch-layer">`);
    parts.push(
      `    ${renderRockHatch(geometry.cells, geometry.width, geometry.height, cs)}`,
    );
    parts.push(`  </g>`);
  }

  // Floor tiles
  parts.push(`  <g class="floors">`);
  for (let y = 0; y < geometry.height; y++) {
    for (let x = 0; x < geometry.width; x++) {
      const cell = geometry.cells[y][x];
      if (cell === CELL.FLOOR) {
        parts.push(
          `    <rect class="floor" x="${x * cs}" y="${y * cs}" width="${cs}" height="${cs}"/>`,
        );
      } else if (cell === CELL.CORRIDOR) {
        parts.push(
          `    <rect class="corridor" x="${x * cs}" y="${y * cs}" width="${cs}" height="${cs}"/>`,
        );
      } else if (cell === CELL.RUBBLE) {
        parts.push(
          `    <rect class="rubble" x="${x * cs}" y="${y * cs}" width="${cs}" height="${cs}"/>`,
        );
      } else if (isFloorLike(cell) && cell !== CELL.WALL) {
        // Other floor-like cells (doors, stairs, etc.) get a floor background
        parts.push(
          `    <rect class="floor" x="${x * cs}" y="${y * cs}" width="${cs}" height="${cs}"/>`,
        );
      }
    }
  }
  parts.push(`  </g>`);

  // Grid lines (only over floor areas)
  if (showGrid) {
    parts.push(`  <g class="grid">`);
    parts.push(
      `    ${renderGridLines(geometry.cells, geometry.width, geometry.height, cs)}`,
    );
    parts.push(`  </g>`);
  }

  // Walls
  const wallSegments = computeWallSegments(
    geometry.cells,
    geometry.width,
    geometry.height,
  );
  parts.push(`  <g class="walls">`);
  for (const seg of wallSegments) {
    parts.push(
      `    <line class="wall" x1="${seg.x1 * cs}" y1="${seg.y1 * cs}" x2="${seg.x2 * cs}" y2="${seg.y2 * cs}"/>`,
    );
  }
  parts.push(`  </g>`);

  // Features (doors, stairs, pillars, traps, treasure, water)
  parts.push(`  <g class="features">`);
  for (let y = 0; y < geometry.height; y++) {
    for (let x = 0; x < geometry.width; x++) {
      const cell = geometry.cells[y][x];
      if (
        cell !== CELL.WALL &&
        cell !== CELL.FLOOR &&
        cell !== CELL.CORRIDOR &&
        cell !== CELL.RUBBLE
      ) {
        const symbol = renderFeatureSymbol(cell, x * cs, y * cs, cs);
        if (symbol) {
          parts.push(`    ${symbol}`);
        }
      }
    }
  }
  parts.push(`  </g>`);

  // Room labels
  if (showLabels && geometry.rooms) {
    parts.push(`  <g class="labels">`);
    for (let i = 0; i < geometry.rooms.length; i++) {
      const room = geometry.rooms[i];
      const cx = (room.x + room.w / 2) * cs;
      const cy = (room.y + room.h / 2) * cs;

      // Room number
      const num = i < 9 ? String(i + 1) : String.fromCharCode(65 + i - 9);
      parts.push(
        `    <text class="room-number" x="${cx}" y="${cy - cs * 0.2}">${num}</text>`,
      );

      // Room name (smaller, below number)
      const node = graph.nodeMap.get(room.nodeId);
      if (node && room.w >= 4 && room.h >= 4) {
        // Only show name if room is large enough
        const name =
          node.name.length > 12
            ? node.name.substring(0, 11) + "\u2026"
            : node.name;
        parts.push(
          `    <text class="room-name" x="${cx}" y="${cy + cs * 0.4}">${escapeXml(name)}</text>`,
        );
      }
    }
    parts.push(`  </g>`);
  }

  // Compass rose
  if (showCompass) {
    parts.push(`  <g class="compass-group">`);
    parts.push(`    ${renderCompass(svgW, cs)}`);
    parts.push(`  </g>`);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

/**
 * Escape special characters for XML/SVG text content.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  renderSvg,
  computeWallSegments,
  mergeCollinearSegments,
  renderFeatureSymbol,
  escapeXml,
};
