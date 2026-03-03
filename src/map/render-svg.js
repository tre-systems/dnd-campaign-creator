/**
 * Old-school SVG dungeon map renderer.
 * Produces TSR/Judges Guild style dungeon maps.
 * Layer 4 of the four-layer map system.
 *
 * @module map/render-svg
 */

const { CELL, isFloorLike } = require("./geometry");
const { roomLabelFromIndex } = require("./room-label");

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
 * Infer the orientation of a door-like symbol from neighbouring passable cells.
 * When movement is left-right through the cell, the symbol should be vertical, and vice versa.
 *
 * @param {number[][]} cells
 * @param {number} x
 * @param {number} y
 * @returns {"horizontal"|"vertical"}
 */
function inferDoorOrientation(cells, x, y) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;

  function isOpen(nx, ny) {
    return (
      nx >= 0 &&
      nx < width &&
      ny >= 0 &&
      ny < height &&
      isFloorLike(cells[ny][nx])
    );
  }

  const left = isOpen(x - 1, y);
  const right = isOpen(x + 1, y);
  const up = isOpen(x, y - 1);
  const down = isOpen(x, y + 1);

  const horizontalFlow = Number(left) + Number(right);
  const verticalFlow = Number(up) + Number(down);

  if (horizontalFlow > verticalFlow) return "vertical";
  if (verticalFlow > horizontalFlow) return "horizontal";
  if (left || right) return "vertical";
  return "horizontal";
}

/**
 * Render an SVG symbol for a feature cell.
 *
 * @param {number} cellType - CELL constant
 * @param {number} px - Pixel x (top-left of cell)
 * @param {number} py - Pixel y (top-left of cell)
 * @param {number} cs - Cell size in pixels
 * @param {"horizontal"|"vertical"} [orientation="horizontal"] - Symbol orientation for door-like glyphs
 * @returns {string} SVG element string
 */
function renderFeatureSymbol(cellType, px, py, cs, orientation = "horizontal") {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const r = cs * 0.3;

  switch (cellType) {
    case CELL.DOOR: {
      // Classic old-school door: small square notch on the wall
      const dr = r * 1.3;
      if (orientation === "vertical") {
        return `<rect class="door" x="${cx - dr * 0.4}" y="${cy - dr * 0.9}" width="${dr * 0.8}" height="${dr * 1.8}" rx="1"/>`;
      }
      return `<rect class="door" x="${cx - dr * 0.9}" y="${cy - dr * 0.4}" width="${dr * 1.8}" height="${dr * 0.8}" rx="1"/>`;
    }

    case CELL.DOOR_LOCKED: {
      // Locked door: filled rectangle with keyhole circle
      const dlr = r * 1.3;
      if (orientation === "vertical") {
        return [
          `<rect class="door-locked" x="${cx - dlr * 0.4}" y="${cy - dlr * 0.9}" width="${dlr * 0.8}" height="${dlr * 1.8}" rx="1"/>`,
          `<circle class="door-locked-key" cx="${cx}" cy="${cy}" r="${dlr * 0.18}"/>`,
        ].join("\n      ");
      }
      return [
        `<rect class="door-locked" x="${cx - dlr * 0.9}" y="${cy - dlr * 0.4}" width="${dlr * 1.8}" height="${dlr * 0.8}" rx="1"/>`,
        `<circle class="door-locked-key" cx="${cx}" cy="${cy}" r="${dlr * 0.18}"/>`,
      ].join("\n      ");
    }

    case CELL.DOOR_SECRET:
      // Secret door: dashed line with S marker
      if (orientation === "vertical") {
        return [
          `<line class="door-secret" x1="${cx}" y1="${py + 2}" x2="${cx}" y2="${py + cs - 2}"/>`,
          `<text class="secret-label" x="${cx}" y="${cy + 1}" font-size="${cs * 0.45}" text-anchor="middle" dominant-baseline="central">S</text>`,
        ].join("\n      ");
      }
      return [
        `<line class="door-secret" x1="${px + 2}" y1="${cy}" x2="${px + cs - 2}" y2="${cy}"/>`,
        `<text class="secret-label" x="${cx}" y="${cy + 1}" font-size="${cs * 0.45}" text-anchor="middle" dominant-baseline="central">S</text>`,
      ].join("\n      ");

    case CELL.DOUBLE_DOOR:
      // Double door: two rectangles side by side with gap
      if (orientation === "vertical") {
        return [
          `<rect class="door" x="${cx - r * 0.45}" y="${cy - r * 1.05}" width="${r * 0.9}" height="${r * 0.92}" rx="1"/>`,
          `<rect class="door" x="${cx - r * 0.45}" y="${cy + r * 0.13}" width="${r * 0.9}" height="${r * 0.92}" rx="1"/>`,
        ].join("\n      ");
      }
      return [
        `<rect class="door" x="${cx - r * 1.05}" y="${cy - r * 0.45}" width="${r * 0.92}" height="${r * 0.9}" rx="1"/>`,
        `<rect class="door" x="${cx + r * 0.13}" y="${cy - r * 0.45}" width="${r * 0.92}" height="${r * 0.9}" rx="1"/>`,
      ].join("\n      ");

    case CELL.PORTCULLIS:
      // Portcullis: compact grate symbol aligned to opening
      if (orientation === "vertical") {
        return [
          `<line class="portcullis" x1="${cx - r * 0.2}" y1="${cy - r}" x2="${cx - r * 0.2}" y2="${cy + r}"/>`,
          `<line class="portcullis" x1="${cx + r * 0.2}" y1="${cy - r}" x2="${cx + r * 0.2}" y2="${cy + r}"/>`,
          `<line class="portcullis" x1="${cx - r * 0.45}" y1="${cy - r * 0.55}" x2="${cx + r * 0.45}" y2="${cy - r * 0.55}"/>`,
          `<line class="portcullis" x1="${cx - r * 0.45}" y1="${cy}" x2="${cx + r * 0.45}" y2="${cy}"/>`,
          `<line class="portcullis" x1="${cx - r * 0.45}" y1="${cy + r * 0.55}" x2="${cx + r * 0.45}" y2="${cy + r * 0.55}"/>`,
        ].join("\n      ");
      }
      return [
        `<line class="portcullis" x1="${cx - r}" y1="${cy - r * 0.2}" x2="${cx + r}" y2="${cy - r * 0.2}"/>`,
        `<line class="portcullis" x1="${cx - r}" y1="${cy + r * 0.2}" x2="${cx + r}" y2="${cy + r * 0.2}"/>`,
        `<line class="portcullis" x1="${cx - r * 0.55}" y1="${cy - r * 0.45}" x2="${cx - r * 0.55}" y2="${cy + r * 0.45}"/>`,
        `<line class="portcullis" x1="${cx}" y1="${cy - r * 0.45}" x2="${cx}" y2="${cy + r * 0.45}"/>`,
        `<line class="portcullis" x1="${cx + r * 0.55}" y1="${cy - r * 0.45}" x2="${cx + r * 0.55}" y2="${cy + r * 0.45}"/>`,
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
  const wallWidth = cellSize < 15 ? 3 : 4;

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
    .compass-line { stroke: #555; stroke-width: 1; }
    .compass-text { font-family: Georgia, serif; font-size: ${cellSize * 0.5}px; fill: #555; text-anchor: middle; }
    .rock-hatch { stroke: #ccc8bc; stroke-width: 0.5; }
  </style>`;
  }

  // Classic blue dungeon map style (default)
  // Inspired by old-school Paratime blue/white dungeon keymaps.
  const sym = "#3b7a9e"; // symbol colour (darker than bg, lighter than wall)
  return `<style>
    .bg { fill: #4a90b8; }
    .floor { fill: #f5fafd; }
    .corridor { fill: #f5fafd; }
    .grid-line { stroke: #d0e0ec; stroke-width: 0.5; }
    .wall { stroke: #16516d; stroke-width: ${wallWidth}; stroke-linecap: square; stroke-linejoin: miter; }
    .door { fill: #f0f6fa; stroke: ${sym}; stroke-width: 2; }
    .door-locked { fill: #f0f6fa; stroke: ${sym}; stroke-width: 2; }
    .door-locked-key { fill: ${sym}; stroke: none; }
    .door-secret { fill: none; stroke: ${sym}; stroke-width: 1.8; stroke-dasharray: 2,2; }
    .secret-label { font-family: Georgia, serif; font-weight: bold; fill: ${sym}; }
    .stairs { fill: none; stroke: ${sym}; stroke-width: 1.8; }
    .stairs-arrow { fill: ${sym}; stroke: none; }
    .pillar { fill: ${sym}; stroke: none; }
    .trap { fill: none; stroke: ${sym}; stroke-width: 1.8; }
    .water { fill: #dce9f2; stroke: ${sym}; stroke-width: 0.8; }
    .treasure { fill: none; stroke: ${sym}; stroke-width: 1.5; }
    .rubble { fill: #e4edf3; }
    .portcullis { fill: none; stroke: ${sym}; stroke-width: 1.5; }
    .archway { fill: none; stroke: ${sym}; stroke-width: 1.6; }
    .archway-base { fill: ${sym}; stroke: none; }
    .curtain { fill: none; stroke: ${sym}; stroke-width: 1.5; stroke-dasharray: 4,2; }
    .statue-base { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .statue { fill: ${sym}; stroke: none; }
    .altar { fill: none; stroke: ${sym}; stroke-width: 1.5; }
    .altar-cross { stroke: ${sym}; stroke-width: 1.5; }
    .well-outer { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .well-inner { fill: none; stroke: ${sym}; stroke-width: 1; }
    .fountain-outer { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .fountain-inner { fill: none; stroke: ${sym}; stroke-width: 1; }
    .fountain-jet { stroke: ${sym}; stroke-width: 1; }
    .firepit { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .firepit-flame { fill: ${sym}; stroke: none; opacity: 0.4; }
    .throne { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .throne-seat { fill: ${sym}; stroke: none; opacity: 0.25; }
    .throne-arm { stroke: ${sym}; stroke-width: 1.4; }
    .sarcophagus { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .sarcophagus-lid { fill: none; stroke: ${sym}; stroke-width: 1; opacity: 0.9; }
    .bars { stroke: ${sym}; stroke-width: 1.4; }
    .pit { fill: none; stroke: ${sym}; stroke-width: 1.4; }
    .pit-hatch { stroke: ${sym}; stroke-width: 1; }
    .lever-base { fill: ${sym}; stroke: ${sym}; stroke-width: 1; }
    .lever-arm { stroke: ${sym}; stroke-width: 1.4; }
    .lever-handle { fill: ${sym}; stroke: none; }
    .collapsed { fill: #dae6ee; stroke: none; }
    .rubble-dot { fill: #7eaec8; stroke: none; }
    .water-wave { fill: none; stroke: ${sym}; stroke-width: 0.8; opacity: 0.5; }
    .room-number { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(10, cellSize * 0.6)}px; font-weight: bold; fill: #1b5a78; text-anchor: start; dominant-baseline: central; }
    .title-text { font-family: Georgia, serif; font-size: ${cellSize * 0.6}px; fill: #f3fbff; }
    .compass-fill { fill: #f0f6fa; }
    .compass-stroke { fill: none; stroke: #1b5a78; stroke-width: 1.5; }
    .compass-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(10, cellSize * 0.55)}px; font-weight: bold; fill: #f0f6fa; text-anchor: middle; }
    .legend-box { fill: #f0f6fa; stroke: #1b5a78; stroke-width: 2; }
    .legend-title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(10, cellSize * 0.55)}px; font-weight: bold; fill: #1b5a78; }
    .legend-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(8, cellSize * 0.4)}px; fill: #1b5a78; }
    .legend-sym { stroke: ${sym}; stroke-width: 1.5; fill: none; }
    .legend-sym-filled { fill: ${sym}; stroke: none; }
    .scale-box { fill: #f0f6fa; stroke: #1b5a78; stroke-width: 1; }
    .rock-hatch { stroke: #67a0c2; stroke-width: 0.5; }
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
  const step = Math.max(4, Math.floor(cs * 0.45));

  // Define old-school angled hatch pattern for rock.
  parts.push(`<defs>
    <pattern id="rock-hatch" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
      <line class="rock-hatch" x1="0" y1="${step}" x2="${step}" y2="0"/>
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
 * Render a decorative north arrow in the Paratime style.
 * Large arrow with "North" label, placed at the bottom-right of the map.
 *
 * @param {number} svgW - SVG width
 * @param {number} svgH - SVG height
 * @param {number} cs - Cell size
 * @returns {string} SVG group string
 */
function renderCompass(svgW, svgH, cs) {
  const cx = svgW - cs * 2.5;
  const cy = svgH - cs * 3.5;
  const s = cs * 1.2; // arrow scale

  // Arrow pointing up with a decorative base
  return [
    `<g class="compass" transform="translate(${cx},${cy})">`,
    // Arrow shaft
    `  <polygon class="compass-fill" points="0,${-s * 1.4} ${s * 0.45},${s * 0.3} ${s * 0.12},${s * 0.3} ${s * 0.12},${s * 1.0} ${-s * 0.12},${s * 1.0} ${-s * 0.12},${s * 0.3} ${-s * 0.45},${s * 0.3}"/>`,
    `  <polygon class="compass-stroke" points="0,${-s * 1.4} ${s * 0.45},${s * 0.3} ${s * 0.12},${s * 0.3} ${s * 0.12},${s * 1.0} ${-s * 0.12},${s * 1.0} ${-s * 0.12},${s * 0.3} ${-s * 0.45},${s * 0.3}"/>`,
    // Base circle
    `  <circle class="compass-fill" cx="0" cy="${s * 1.2}" r="${s * 0.25}"/>`,
    `  <circle class="compass-stroke" cx="0" cy="${s * 1.2}" r="${s * 0.25}"/>`,
    // "North" label
    `  <text class="compass-text" x="0" y="${s * 1.8}" dominant-baseline="hanging">North</text>`,
    `</g>`,
  ].join("\n    ");
}

/**
 * Detect which feature cell types are present in the map.
 *
 * @param {number[][]} cells
 * @param {number} width
 * @param {number} height
 * @returns {Set<number>}
 */
function detectUsedFeatures(cells, width, height) {
  const used = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cells[y][x];
      if (c !== CELL.WALL && c !== CELL.FLOOR && c !== CELL.CORRIDOR) {
        used.add(c);
      }
    }
  }
  return used;
}

/**
 * Render a legend box in the Paratime style.
 * Only shows symbols that actually appear on the map.
 *
 * @param {Set<number>} usedFeatures - Feature types present
 * @param {number} x - Legend top-left x
 * @param {number} y - Legend top-left y
 * @param {number} cs - Cell size
 * @returns {string} SVG group
 */
function renderLegend(usedFeatures, x, y, cs) {
  // Map of cell types to legend label
  const legendItems = [
    [CELL.DOOR, "Door"],
    [CELL.DOOR_LOCKED, "Locked Door"],
    [CELL.DOOR_SECRET, "Secret Door"],
    [CELL.DOUBLE_DOOR, "Double Door"],
    [CELL.PORTCULLIS, "Portcullis"],
    [CELL.ARCHWAY, "Archway"],
    [CELL.STAIRS_DOWN, "Stairs Down"],
    [CELL.STAIRS_UP, "Stairs Up"],
    [CELL.PILLAR, "Column"],
    [CELL.STATUE, "Statue"],
    [CELL.ALTAR, "Altar"],
    [CELL.WELL, "Well"],
    [CELL.FOUNTAIN, "Fountain"],
    [CELL.FIREPIT, "Fire Pit"],
    [CELL.THRONE, "Throne"],
    [CELL.SARCOPHAGUS, "Sarcophagus"],
    [CELL.BARS, "Bars"],
    [CELL.PIT, "Covered Pit"],
    [CELL.LEVER, "Lever"],
    [CELL.TRAP, "Trap"],
    [CELL.WATER, "Water"],
    [CELL.TREASURE, "Treasure"],
    [CELL.COLLAPSED, "Collapsed"],
    [CELL.CURTAIN, "Curtain"],
    [CELL.RUBBLE, "Rubble"],
  ];

  const active = legendItems.filter(([type]) => usedFeatures.has(type));
  if (active.length === 0) return "";

  const colW = cs * 5.5;
  const rowH = cs * 1.2;
  const cols = Math.min(4, active.length);
  const rows = Math.ceil(active.length / cols);
  const pad = cs * 0.5;
  const titleH = cs * 1.0;
  const boxW = cols * colW + pad * 2;
  const boxH = rows * rowH + titleH + pad * 2;

  const parts = [];
  parts.push(`<g class="legend" transform="translate(${x},${y})">`);
  // Box
  parts.push(
    `  <rect class="legend-box" x="0" y="0" width="${boxW}" height="${boxH}" rx="3"/>`,
  );
  // Title
  parts.push(
    `  <text class="legend-title" x="${pad}" y="${pad + titleH * 0.65}">LEGEND</text>`,
  );
  // Scale indicator
  parts.push(
    `  <rect class="scale-box" x="${boxW - pad - cs * 2.5}" y="${pad + titleH * 0.1}" width="${cs}" height="${cs}"/>`,
  );
  parts.push(
    `  <text class="legend-text" x="${boxW - pad - cs * 1.3}" y="${pad + titleH * 0.65}">= 10ft.</text>`,
  );

  // Underline
  parts.push(
    `  <line class="legend-sym" x1="${pad}" y1="${pad + titleH}" x2="${boxW - pad}" y2="${pad + titleH}" stroke-width="0.5"/>`,
  );

  // Items
  for (let i = 0; i < active.length; i++) {
    const [cellType, label] = active[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ix = pad + col * colW;
    const iy = pad + titleH + row * rowH + rowH * 0.5;
    const symSize = cs * 0.7;

    // Render a mini symbol
    const sym = renderFeatureSymbol(cellType, ix, iy - symSize / 2, symSize);
    if (sym) parts.push(`  ${sym}`);
    parts.push(
      `  <text class="legend-text" x="${ix + symSize + cs * 0.2}" y="${iy}" dominant-baseline="central">${label}</text>`,
    );
  }

  parts.push(`</g>`);
  return parts.join("\n    ");
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
 * @param {boolean} [options.showLegend=true] - Show legend box
 * @param {string} [options.colorScheme='blue'] - 'blue' for classic blue, 'parchment' for warm tones
 * @returns {string} Complete SVG document as string
 */
function renderSvg(geometry, graph, intent, options) {
  options = options || {};
  const cs = options.cellSize || 20;
  const showGrid = options.showGrid !== false;
  const showLabels = options.showLabels !== false;
  const showRockHatch = options.showRockHatch !== false; // Default ON for old-school wall fill
  const showCompass = options.showCompass !== false;
  const showLegend = options.showLegend !== false;
  const colorScheme = options.colorScheme || "blue";

  const mapW = geometry.width * cs;
  const mapH = geometry.height * cs;

  // Detect used features for legend
  const usedFeatures = detectUsedFeatures(
    geometry.cells,
    geometry.width,
    geometry.height,
  );

  // Compute legend dimensions to add to total SVG height
  const legendItems = [
    CELL.DOOR,
    CELL.DOOR_LOCKED,
    CELL.DOOR_SECRET,
    CELL.DOUBLE_DOOR,
    CELL.PORTCULLIS,
    CELL.ARCHWAY,
    CELL.STAIRS_DOWN,
    CELL.STAIRS_UP,
    CELL.PILLAR,
    CELL.STATUE,
    CELL.ALTAR,
    CELL.WELL,
    CELL.FOUNTAIN,
    CELL.FIREPIT,
    CELL.THRONE,
    CELL.SARCOPHAGUS,
    CELL.BARS,
    CELL.PIT,
    CELL.LEVER,
    CELL.TRAP,
    CELL.WATER,
    CELL.TREASURE,
    CELL.COLLAPSED,
    CELL.CURTAIN,
    CELL.RUBBLE,
  ].filter((t) => usedFeatures.has(t));

  let legendH = 0;
  if (showLegend && legendItems.length > 0) {
    const cols = Math.min(4, legendItems.length);
    const rows = Math.ceil(legendItems.length / cols);
    legendH = rows * cs * 1.2 + cs * 1.0 + cs * 1.0 + cs;
  }

  const svgW = mapW;
  const svgH = mapH + legendH;

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
        const orientation = inferDoorOrientation(geometry.cells, x, y);
        const symbol = renderFeatureSymbol(
          cell,
          x * cs,
          y * cs,
          cs,
          orientation,
        );
        if (symbol) {
          parts.push(`    ${symbol}`);
        }
      }
    }
  }
  parts.push(`  </g>`);

  // Room labels (Paratime style: small bold number in top-left corner, no names)
  if (showLabels && geometry.rooms) {
    parts.push(`  <g class="labels">`);
    for (let i = 0; i < geometry.rooms.length; i++) {
      const room = geometry.rooms[i];
      // Position in the top-left area of the room
      const lx = (room.x + 0.3) * cs;
      const ly = (room.y + 0.75) * cs;

      // Room number only (no names on the map - those go in a separate key)
      const num = roomLabelFromIndex(i);
      parts.push(
        `    <text class="room-number" x="${lx}" y="${ly}">${num}</text>`,
      );
    }
    parts.push(`  </g>`);
  }

  // Compass rose (placed relative to map area, not legend)
  if (showCompass) {
    parts.push(`  <g class="compass-group">`);
    parts.push(`    ${renderCompass(mapW, mapH, cs)}`);
    parts.push(`  </g>`);
  }

  // Legend box below map
  if (showLegend && legendItems.length > 0) {
    const legendX = cs;
    const legendY = mapH + cs * 0.5;
    parts.push(`  ${renderLegend(usedFeatures, legendX, legendY, cs)}`);
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
