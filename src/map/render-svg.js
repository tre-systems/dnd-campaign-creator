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
      // Classic old-school door: wall notch with center slit and hinge pin.
      const dr = r * 1.3;
      if (orientation === "vertical") {
        const dw = dr * 0.85;
        const dh = dr * 1.9;
        return [
          `<rect class="door" x="${cx - dw * 0.5}" y="${cy - dh * 0.5}" width="${dw}" height="${dh}" rx="1"/>`,
          `<line class="door-slit" x1="${cx - dw * 0.3}" y1="${cy}" x2="${cx + dw * 0.3}" y2="${cy}"/>`,
          `<circle class="door-pin" cx="${cx}" cy="${cy - dh * 0.25}" r="${Math.max(0.6, cs * 0.045)}"/>`,
        ].join("\n      ");
      }
      const dw = dr * 1.9;
      const dh = dr * 0.85;
      return [
        `<rect class="door" x="${cx - dw * 0.5}" y="${cy - dh * 0.5}" width="${dw}" height="${dh}" rx="1"/>`,
        `<line class="door-slit" x1="${cx}" y1="${cy - dh * 0.3}" x2="${cx}" y2="${cy + dh * 0.3}"/>`,
        `<circle class="door-pin" cx="${cx + dw * 0.25}" cy="${cy}" r="${Math.max(0.6, cs * 0.045)}"/>`,
      ].join("\n      ");
    }

    case CELL.DOOR_LOCKED: {
      // Locked door: standard door with hasp bar and keyhole.
      const dlr = r * 1.3;
      if (orientation === "vertical") {
        const dw = dlr * 0.85;
        const dh = dlr * 1.9;
        const keyR = dlr * 0.16;
        return [
          `<rect class="door-locked" x="${cx - dw * 0.5}" y="${cy - dh * 0.5}" width="${dw}" height="${dh}" rx="1"/>`,
          `<line class="door-hasp" x1="${cx - dw * 0.34}" y1="${cy}" x2="${cx + dw * 0.34}" y2="${cy}"/>`,
          `<circle class="door-locked-key" cx="${cx}" cy="${cy + keyR * 0.15}" r="${keyR}"/>`,
          `<line class="door-locked-key-stem" x1="${cx}" y1="${cy + keyR * 0.65}" x2="${cx}" y2="${cy + keyR * 1.65}"/>`,
        ].join("\n      ");
      }
      const dw = dlr * 1.9;
      const dh = dlr * 0.85;
      const keyR = dlr * 0.16;
      return [
        `<rect class="door-locked" x="${cx - dw * 0.5}" y="${cy - dh * 0.5}" width="${dw}" height="${dh}" rx="1"/>`,
        `<line class="door-hasp" x1="${cx}" y1="${cy - dh * 0.34}" x2="${cx}" y2="${cy + dh * 0.34}"/>`,
        `<circle class="door-locked-key" cx="${cx + keyR * 0.15}" cy="${cy}" r="${keyR}"/>`,
        `<line class="door-locked-key-stem" x1="${cx + keyR * 0.65}" y1="${cy}" x2="${cx + keyR * 1.65}" y2="${cy}"/>`,
      ].join("\n      ");
    }

    case CELL.DOOR_SECRET:
      // Secret door: dashed cut-line with terminal ticks and circled S.
      if (orientation === "vertical") {
        return [
          `<line class="door-secret" x1="${cx}" y1="${py + 2}" x2="${cx}" y2="${py + cs - 2}"/>`,
          `<line class="door-secret-tick" x1="${cx - r * 0.45}" y1="${py + cs * 0.2}" x2="${cx + r * 0.45}" y2="${py + cs * 0.2}"/>`,
          `<line class="door-secret-tick" x1="${cx - r * 0.45}" y1="${py + cs * 0.8}" x2="${cx + r * 0.45}" y2="${py + cs * 0.8}"/>`,
          `<circle class="secret-ring" cx="${cx}" cy="${cy}" r="${cs * 0.2}"/>`,
          `<text class="secret-label" x="${cx}" y="${cy + 1}" font-size="${cs * 0.45}" text-anchor="middle" dominant-baseline="central">S</text>`,
        ].join("\n      ");
      }
      return [
        `<line class="door-secret" x1="${px + 2}" y1="${cy}" x2="${px + cs - 2}" y2="${cy}"/>`,
        `<line class="door-secret-tick" x1="${px + cs * 0.2}" y1="${cy - r * 0.45}" x2="${px + cs * 0.2}" y2="${cy + r * 0.45}"/>`,
        `<line class="door-secret-tick" x1="${px + cs * 0.8}" y1="${cy - r * 0.45}" x2="${px + cs * 0.8}" y2="${cy + r * 0.45}"/>`,
        `<circle class="secret-ring" cx="${cx}" cy="${cy}" r="${cs * 0.2}"/>`,
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
      // Stairs down: tapered treads descending toward bottom with down marker.
      return [
        `<line class="stairs" x1="${px + cs * 0.14}" y1="${py + cs * 0.2}" x2="${px + cs * 0.86}" y2="${py + cs * 0.2}"/>`,
        `<line class="stairs" x1="${px + cs * 0.2}" y1="${py + cs * 0.34}" x2="${px + cs * 0.8}" y2="${py + cs * 0.34}"/>`,
        `<line class="stairs" x1="${px + cs * 0.26}" y1="${py + cs * 0.48}" x2="${px + cs * 0.74}" y2="${py + cs * 0.48}"/>`,
        `<line class="stairs" x1="${px + cs * 0.32}" y1="${py + cs * 0.62}" x2="${px + cs * 0.68}" y2="${py + cs * 0.62}"/>`,
        `<line class="stairs" x1="${px + cs * 0.38}" y1="${py + cs * 0.76}" x2="${px + cs * 0.62}" y2="${py + cs * 0.76}"/>`,
        `<polygon class="stairs-arrow" points="${cx - r * 0.45},${py + cs * 0.68} ${cx + r * 0.45},${py + cs * 0.68} ${cx},${py + cs * 0.9}"/>`,
      ].join("\n      ");

    case CELL.STAIRS_UP:
      // Stairs up: tapered treads ascending toward top with up marker.
      return [
        `<line class="stairs" x1="${px + cs * 0.38}" y1="${py + cs * 0.24}" x2="${px + cs * 0.62}" y2="${py + cs * 0.24}"/>`,
        `<line class="stairs" x1="${px + cs * 0.32}" y1="${py + cs * 0.38}" x2="${px + cs * 0.68}" y2="${py + cs * 0.38}"/>`,
        `<line class="stairs" x1="${px + cs * 0.26}" y1="${py + cs * 0.52}" x2="${px + cs * 0.74}" y2="${py + cs * 0.52}"/>`,
        `<line class="stairs" x1="${px + cs * 0.2}" y1="${py + cs * 0.66}" x2="${px + cs * 0.8}" y2="${py + cs * 0.66}"/>`,
        `<line class="stairs" x1="${px + cs * 0.14}" y1="${py + cs * 0.8}" x2="${px + cs * 0.86}" y2="${py + cs * 0.8}"/>`,
        `<polygon class="stairs-arrow" points="${cx - r * 0.45},${py + cs * 0.32} ${cx + r * 0.45},${py + cs * 0.32} ${cx},${py + cs * 0.1}"/>`,
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
  const wallUnderWidth = wallWidth + 1.4;
  const wallHighlightWidth = Math.max(1, wallWidth * 0.33);

  if (colorScheme === "parchment") {
    return `<style>
    .bg { fill: #f5f0e6; }
    .bg-wash { fill: #e8dcc7; opacity: 0.14; }
    .paper-grain { fill: #efe5d4; opacity: 0.2; }
    .frame-outer { fill: none; stroke: #2a2520; stroke-width: 2.4; }
    .frame-inner { fill: none; stroke: #8b7b63; stroke-width: 1.1; opacity: 0.8; }
    .floor { fill: #f9f7f2; }
    .corridor { fill: #eeebe2; }
    .grid-line { stroke: #e0ddd4; stroke-width: 0.5; }
    .grid-line-major { stroke: #c6c0b3; stroke-width: 0.9; }
    .wall-under { stroke: #1a1a1a; stroke-width: ${wallUnderWidth}; stroke-linecap: square; stroke-linejoin: miter; }
    .wall { stroke: #24211d; stroke-width: ${wallWidth}; stroke-linecap: square; stroke-linejoin: miter; }
    .wall-highlight { stroke: #8e7b67; stroke-width: ${wallHighlightWidth}; stroke-linecap: square; stroke-linejoin: miter; opacity: 0.35; }
    .door { fill: #8b6914; stroke: #1a1a1a; stroke-width: 1; }
    .door-slit { stroke: #1a1a1a; stroke-width: 0.9; }
    .door-pin { fill: #1a1a1a; stroke: none; }
    .door-locked { fill: #8b6914; stroke: #1a1a1a; stroke-width: 1.5; }
    .door-hasp { stroke: #1a1a1a; stroke-width: 1; }
    .door-locked-key { fill: #1a1a1a; stroke: none; }
    .door-locked-key-stem { stroke: #1a1a1a; stroke-width: 1; stroke-linecap: round; }
    .door-secret { fill: none; stroke: #888; stroke-width: 1.5; stroke-dasharray: 3,3; }
    .door-secret-tick { stroke: #888; stroke-width: 1.3; }
    .secret-ring { fill: none; stroke: #888; stroke-width: 1.1; }
    .secret-label { font-family: Georgia, serif; font-weight: bold; fill: #666; }
    .stairs { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
    .stairs-arrow { fill: #1a1a1a; stroke: none; }
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
    .room-tag { fill: #f3ecdf; stroke: #8b7b63; stroke-width: 0.9; }
    .room-number { font-family: Georgia, serif; font-size: ${Math.max(10, cellSize * 0.7)}px; font-weight: bold; fill: #333; stroke: #f5f0e6; stroke-width: ${Math.max(0.8, cellSize * 0.05)}; paint-order: stroke fill; text-anchor: middle; dominant-baseline: central; }
    .room-name { font-family: Georgia, serif; font-size: ${Math.max(7, cellSize * 0.4)}px; fill: #777; text-anchor: middle; dominant-baseline: central; }
    .title-text { font-family: Georgia, serif; font-size: ${cellSize * 0.6}px; fill: #333; }
    .compass-fill { fill: #e9decd; }
    .compass-stroke { fill: none; stroke: #555; stroke-width: 1.2; }
    .compass-dark { fill: #555; }
    .compass-light { fill: #f5f0e6; }
    .compass-text { font-family: Georgia, serif; font-size: ${cellSize * 0.5}px; fill: #555; text-anchor: middle; font-weight: bold; }
    .legend-box { fill: #f3eadb; stroke: #665949; stroke-width: 1.8; }
    .legend-title { font-family: Georgia, serif; font-size: ${Math.max(11, cellSize * 0.6)}px; font-weight: bold; fill: #554a3d; }
    .legend-text { font-family: Georgia, serif; font-size: ${Math.max(9, cellSize * 0.46)}px; fill: #665949; }
    .legend-sym { stroke: #555; stroke-width: 1.4; fill: none; }
    .scale-box { fill: #f9f2e5; stroke: #665949; stroke-width: 1; }
    .rock-tone { fill: #d6ccba; }
    .rock-hatch-major { stroke: #b7ae9c; stroke-width: 0.56; }
    .rock-hatch-minor { stroke: #ccc2af; stroke-width: 0.43; }
    .rock-stipple-dot { fill: #b1a58f; opacity: 0.72; }
    .rock-chisel-mark { stroke: #9e927b; stroke-width: 0.52; stroke-linecap: round; }
    .title-block-box { fill: #f3eadb; stroke: #665949; stroke-width: 1.6; }
    .title-block-divider { stroke: #9a8a72; stroke-width: 0.9; }
    .title-label { font-family: Georgia, serif; font-size: ${Math.max(7, cellSize * 0.34)}px; fill: #8a7a63; letter-spacing: 0.4px; }
    .title-value { font-family: Georgia, serif; font-size: ${Math.max(9, cellSize * 0.42)}px; fill: #4d4338; font-weight: bold; }
    .sheet-border-outer { fill: none; stroke: #665949; stroke-width: 1.4; }
    .sheet-border-inner { fill: none; stroke: #a79780; stroke-width: 0.9; }
    .sheet-tick { stroke: #8e7f67; stroke-width: 0.8; }
  </style>`;
  }

  // Classic blue dungeon map style (default)
  // Inspired by old-school Paratime blue/white dungeon keymaps.
  const sym = "#3b7a9e"; // symbol colour (darker than bg, lighter than wall)
  return `<style>
    .bg { fill: #4a90b8; }
    .bg-wash { fill: #6ea8c8; opacity: 0.22; }
    .paper-grain { fill: #75aac9; opacity: 0.16; }
    .frame-outer { fill: none; stroke: #0f4158; stroke-width: 2.6; }
    .frame-inner { fill: none; stroke: #9ec3d9; stroke-width: 1.1; opacity: 0.75; }
    .floor { fill: #eef6fb; }
    .corridor { fill: #eef6fb; }
    .grid-line { stroke: #d0e0ec; stroke-width: 0.5; }
    .grid-line-major { stroke: #a9c5d8; stroke-width: 0.9; }
    .wall-under { stroke: #0f4966; stroke-width: ${wallUnderWidth}; stroke-linecap: square; stroke-linejoin: miter; }
    .wall { stroke: #16516d; stroke-width: ${wallWidth}; stroke-linecap: square; stroke-linejoin: miter; }
    .wall-highlight { stroke: #8fb7cd; stroke-width: ${wallHighlightWidth}; stroke-linecap: square; stroke-linejoin: miter; opacity: 0.45; }
    .door { fill: #f0f6fa; stroke: ${sym}; stroke-width: 2; }
    .door-slit { stroke: ${sym}; stroke-width: 1.1; }
    .door-pin { fill: ${sym}; stroke: none; }
    .door-locked { fill: #f0f6fa; stroke: ${sym}; stroke-width: 2; }
    .door-hasp { stroke: ${sym}; stroke-width: 1.15; }
    .door-locked-key { fill: ${sym}; stroke: none; }
    .door-locked-key-stem { stroke: ${sym}; stroke-width: 1.2; stroke-linecap: round; }
    .door-secret { fill: none; stroke: ${sym}; stroke-width: 1.8; stroke-dasharray: 2,2; }
    .door-secret-tick { stroke: ${sym}; stroke-width: 1.4; }
    .secret-ring { fill: none; stroke: ${sym}; stroke-width: 1.3; }
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
    .room-tag { fill: #f0f6fa; stroke: #3c7392; stroke-width: 1; }
    .room-number { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(10, cellSize * 0.6)}px; font-weight: bold; fill: #1b5a78; stroke: #eef6fb; stroke-width: ${Math.max(0.9, cellSize * 0.05)}; paint-order: stroke fill; text-anchor: middle; dominant-baseline: central; }
    .title-text { font-family: Georgia, serif; font-size: ${cellSize * 0.6}px; fill: #f3fbff; }
    .compass-fill { fill: #f0f6fa; }
    .compass-stroke { fill: none; stroke: #1b5a78; stroke-width: 1.5; }
    .compass-dark { fill: #1b5a78; }
    .compass-light { fill: #f0f6fa; }
    .compass-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(10, cellSize * 0.55)}px; font-weight: bold; fill: #f0f6fa; text-anchor: middle; }
    .legend-box { fill: #f0f6fa; stroke: #1b5a78; stroke-width: 2; }
    .legend-title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(11, cellSize * 0.6)}px; font-weight: bold; fill: #1b5a78; }
    .legend-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(9, cellSize * 0.46)}px; fill: #1b5a78; }
    .legend-sym { stroke: ${sym}; stroke-width: 1.5; fill: none; }
    .legend-sym-filled { fill: ${sym}; stroke: none; }
    .scale-box { fill: #f0f6fa; stroke: #1b5a78; stroke-width: 1; }
    .rock-tone { fill: #2f6786; }
    .rock-hatch-major { stroke: #3d7393; stroke-width: 0.58; }
    .rock-hatch-minor { stroke: #5b8eac; stroke-width: 0.46; }
    .rock-stipple-dot { fill: #4f88ab; opacity: 0.72; }
    .rock-chisel-mark { stroke: #2e627f; stroke-width: 0.54; stroke-linecap: round; }
    .title-block-box { fill: #f0f6fa; stroke: #1b5a78; stroke-width: 1.8; }
    .title-block-divider { stroke: #95b9cf; stroke-width: 1; }
    .title-label { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(7, cellSize * 0.34)}px; fill: #5f90ac; letter-spacing: 0.5px; }
    .title-value { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${Math.max(9, cellSize * 0.43)}px; fill: #1b5a78; font-weight: bold; }
    .sheet-border-outer { fill: none; stroke: #1b5a78; stroke-width: 1.4; }
    .sheet-border-inner { fill: none; stroke: #8fb4cb; stroke-width: 0.9; }
    .sheet-tick { stroke: #8fb4cb; stroke-width: 0.8; }
  </style>`;
}

/**
 * Render a tonal wash over the map area so the sheet feels less flat.
 *
 * @param {number} svgW
 * @param {number} mapH
 * @param {string} colorScheme
 * @returns {string}
 */
function renderBlueprintWash(svgW, mapH, colorScheme) {
  const gradId =
    colorScheme === "parchment" ? "parchment-wash" : "blueprint-wash";
  const dark = colorScheme === "parchment" ? "#c8b696" : "#205b79";
  const light = colorScheme === "parchment" ? "#f8f0de" : "#78b0cd";
  return [
    `<defs>`,
    `  <radialGradient id="${gradId}" cx="50%" cy="42%" r="70%">`,
    `    <stop offset="0%" stop-color="${light}" stop-opacity="0.85"/>`,
    `    <stop offset="62%" stop-color="${light}" stop-opacity="0.38"/>`,
    `    <stop offset="100%" stop-color="${dark}" stop-opacity="0.7"/>`,
    `  </radialGradient>`,
    `</defs>`,
    `<rect class="bg-wash" x="0" y="0" width="${svgW}" height="${mapH}" fill="url(#${gradId})"/>`,
  ].join("\n    ");
}

/**
 * Render a subtle paper-grain texture layer.
 *
 * @param {number} svgW
 * @param {number} svgH
 * @param {number} cs
 * @returns {string}
 */
function renderPaperGrain(svgW, svgH, cs) {
  const dotStep = Math.max(8, Math.floor(cs * 0.6));
  return [
    `<defs>`,
    `  <pattern id="blueprint-grain" width="${dotStep}" height="${dotStep}" patternUnits="userSpaceOnUse">`,
    `    <circle cx="${Math.max(1, Math.floor(dotStep * 0.25))}" cy="${Math.max(1, Math.floor(dotStep * 0.3))}" r="0.6" fill="#fff" opacity="0.35"/>`,
    `    <circle cx="${Math.max(2, Math.floor(dotStep * 0.72))}" cy="${Math.max(2, Math.floor(dotStep * 0.75))}" r="0.5" fill="#fff" opacity="0.28"/>`,
    `  </pattern>`,
    `</defs>`,
    `<rect class="paper-grain" x="0" y="0" width="${svgW}" height="${svgH}" fill="url(#blueprint-grain)"/>`,
  ].join("\n    ");
}

/**
 * Render an outer sheet border with registration ticks.
 *
 * @param {number} svgW
 * @param {number} svgH
 * @param {number} cs
 * @returns {string}
 */
function renderSheetBorder(svgW, svgH, cs) {
  const outerPad = Math.max(1.2, cs * 0.05);
  const innerPad = outerPad + Math.max(2, cs * 0.16);
  const tickStep = Math.max(cs * 5, 30);
  const tickLen = Math.max(4, cs * 0.3);
  const parts = [
    `<g class="sheet-border">`,
    `  <rect class="sheet-border-outer" x="${outerPad}" y="${outerPad}" width="${Math.max(1, svgW - outerPad * 2)}" height="${Math.max(1, svgH - outerPad * 2)}" rx="${Math.max(1, cs * 0.04)}"/>`,
    `  <rect class="sheet-border-inner" x="${innerPad}" y="${innerPad}" width="${Math.max(1, svgW - innerPad * 2)}" height="${Math.max(1, svgH - innerPad * 2)}" rx="${Math.max(1, cs * 0.03)}"/>`,
  ];

  for (
    let x = innerPad + tickStep;
    x < svgW - innerPad - tickStep * 0.35;
    x += tickStep
  ) {
    parts.push(
      `  <line class="sheet-tick" x1="${x}" y1="${innerPad}" x2="${x}" y2="${innerPad + tickLen}"/>`,
    );
    parts.push(
      `  <line class="sheet-tick" x1="${x}" y1="${svgH - innerPad}" x2="${x}" y2="${svgH - innerPad - tickLen}"/>`,
    );
  }
  for (
    let y = innerPad + tickStep;
    y < svgH - innerPad - tickStep * 0.35;
    y += tickStep
  ) {
    parts.push(
      `  <line class="sheet-tick" x1="${innerPad}" y1="${y}" x2="${innerPad + tickLen}" y2="${y}"/>`,
    );
    parts.push(
      `  <line class="sheet-tick" x1="${svgW - innerPad}" y1="${y}" x2="${svgW - innerPad - tickLen}" y2="${y}"/>`,
    );
  }

  parts.push(`</g>`);
  return parts.join("\n    ");
}

/**
 * Render a double-line map frame around the map area.
 *
 * @param {number} mapW
 * @param {number} mapH
 * @param {number} cs
 * @returns {string}
 */
function renderMapFrame(mapW, mapH, cs) {
  const outerPad = Math.max(1.5, cs * 0.08);
  const innerPad = outerPad + Math.max(2, cs * 0.14);
  return [
    `<g class="map-frame">`,
    `  <rect class="frame-outer" x="${outerPad}" y="${outerPad}" width="${Math.max(1, mapW - outerPad * 2)}" height="${Math.max(1, mapH - outerPad * 2)}" rx="${Math.max(1, cs * 0.04)}"/>`,
    `  <rect class="frame-inner" x="${innerPad}" y="${innerPad}" width="${Math.max(1, mapW - innerPad * 2)}" height="${Math.max(1, mapH - innerPad * 2)}" rx="${Math.max(1, cs * 0.03)}"/>`,
    `</g>`,
  ].join("\n    ");
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
        const lineClass = y % 5 === 0 ? "grid-line-major" : "grid-line";
        lines.push(
          `<line class="${lineClass}" x1="${startX * cs}" y1="${y * cs}" x2="${x * cs}" y2="${y * cs}"/>`,
        );
        inFloor = false;
      }
    }
    if (inFloor) {
      const lineClass = y % 5 === 0 ? "grid-line-major" : "grid-line";
      lines.push(
        `<line class="${lineClass}" x1="${startX * cs}" y1="${y * cs}" x2="${width * cs}" y2="${y * cs}"/>`,
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
        const lineClass = x % 5 === 0 ? "grid-line-major" : "grid-line";
        lines.push(
          `<line class="${lineClass}" x1="${x * cs}" y1="${startY * cs}" x2="${x * cs}" y2="${y * cs}"/>`,
        );
        inFloor = false;
      }
    }
    if (inFloor) {
      const lineClass = x % 5 === 0 ? "grid-line-major" : "grid-line";
      lines.push(
        `<line class="${lineClass}" x1="${x * cs}" y1="${startY * cs}" x2="${x * cs}" y2="${height * cs}"/>`,
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
  const majorStep = Math.max(3, Math.floor(cs * 0.34));
  const minorStep = Math.max(4, Math.floor(cs * 0.52));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const hashNoise2d = (x, y, salt = 0) => {
    let h = Math.imul(x + 1 + salt, 0x9e3779b1);
    h ^= Math.imul(y + 1 + salt * 3, 0x85ebca6b);
    h ^= h >>> 16;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967295;
  };
  const majorOffset = (majorStep / 2).toFixed(2);
  const minorOffset = (minorStep / 2).toFixed(2);

  // Layered hatch/stipple variants create denser, period-style rock texture.
  parts.push(`<defs>
    <pattern id="rock-hatch-major-a" width="${majorStep}" height="${majorStep}" patternUnits="userSpaceOnUse">
      <line class="rock-hatch-major" x1="0" y1="${majorStep}" x2="${majorStep}" y2="0"/>
    </pattern>
    <pattern id="rock-hatch-major-b" width="${majorStep}" height="${majorStep}" patternUnits="userSpaceOnUse" patternTransform="translate(${majorOffset} ${majorOffset})">
      <line class="rock-hatch-major" x1="0" y1="${majorStep}" x2="${majorStep}" y2="0"/>
    </pattern>
    <pattern id="rock-hatch-minor-a" width="${minorStep}" height="${minorStep}" patternUnits="userSpaceOnUse">
      <line class="rock-hatch-minor" x1="0" y1="0" x2="${minorStep}" y2="${minorStep}"/>
    </pattern>
    <pattern id="rock-hatch-minor-b" width="${minorStep}" height="${minorStep}" patternUnits="userSpaceOnUse" patternTransform="translate(${minorOffset} ${minorOffset})">
      <line class="rock-hatch-minor" x1="0" y1="0" x2="${minorStep}" y2="${minorStep}"/>
    </pattern>
    <pattern id="rock-stipple-a" width="${minorStep}" height="${minorStep}" patternUnits="userSpaceOnUse">
      <circle class="rock-stipple-dot" cx="${Math.max(1, Math.floor(minorStep * 0.22))}" cy="${Math.max(1, Math.floor(minorStep * 0.3))}" r="0.45"/>
      <circle class="rock-stipple-dot" cx="${Math.max(2, Math.floor(minorStep * 0.72))}" cy="${Math.max(2, Math.floor(minorStep * 0.76))}" r="0.35"/>
    </pattern>
    <pattern id="rock-stipple-b" width="${minorStep}" height="${minorStep}" patternUnits="userSpaceOnUse">
      <circle class="rock-stipple-dot" cx="${Math.max(1, Math.floor(minorStep * 0.18))}" cy="${Math.max(1, Math.floor(minorStep * 0.72))}" r="0.4"/>
      <circle class="rock-stipple-dot" cx="${Math.max(2, Math.floor(minorStep * 0.65))}" cy="${Math.max(2, Math.floor(minorStep * 0.28))}" r="0.3"/>
      <circle class="rock-stipple-dot" cx="${Math.max(2, Math.floor(minorStep * 0.82))}" cy="${Math.max(2, Math.floor(minorStep * 0.82))}" r="0.28"/>
    </pattern>
  </defs>`);

  // Apply across rock mass, with stronger texture near playable space.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== CELL.WALL) continue;
      let nearestFloor = Infinity;
      for (let oy = -3; oy <= 3; oy++) {
        for (let ox = -3; ox <= 3; ox++) {
          const dist = Math.abs(ox) + Math.abs(oy);
          if (dist === 0 || dist > 3) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (isFloorLike(cells[ny][nx])) {
            nearestFloor = Math.min(nearestFloor, dist);
          }
        }
      }

      const intensity =
        nearestFloor === 1
          ? 1
          : nearestFloor === 2
            ? 0.78
            : nearestFloor === 3
              ? 0.62
              : 0.42;
      const noiseA = hashNoise2d(x, y, 11);
      const noiseB = hashNoise2d(x, y, 23);
      const noiseC = hashNoise2d(x, y, 47);
      const tonalMod = 0.9 + (noiseB - 0.5) * 0.24;
      const jitter = 0.82 + noiseA * 0.36;
      const tunedIntensity = clamp(intensity * tonalMod, 0.34, 1.12);
      const toneOpacity = clamp(
        0.08 + tunedIntensity * 0.16 + (noiseC - 0.5) * 0.05,
        0.06,
        0.32,
      );
      const majorOpacity =
        clamp(0.2 + tunedIntensity * 0.3, 0.2, 0.86) * jitter;
      const minorOpacity =
        clamp(0.14 + tunedIntensity * 0.2, 0.12, 0.64) * (0.9 + noiseC * 0.22);
      const stippleOpacity =
        clamp(0.12 + tunedIntensity * 0.17, 0.1, 0.52) * (0.9 + noiseB * 0.18);
      const px = x * cs;
      const py = y * cs;
      const majorPatternId =
        noiseB > 0.5 ? "rock-hatch-major-a" : "rock-hatch-major-b";
      const minorPatternId =
        noiseA > 0.45 ? "rock-hatch-minor-a" : "rock-hatch-minor-b";
      const stipplePatternId =
        noiseC > 0.52 ? "rock-stipple-a" : "rock-stipple-b";
      const showMinor = nearestFloor <= 2 || noiseC > 0.4;
      const chiselChance =
        nearestFloor === 1
          ? 0.62
          : nearestFloor === 2
            ? 0.47
            : nearestFloor === 3
              ? 0.34
              : 0.2;

      parts.push(
        `<rect class="rock-tone" x="${px}" y="${py}" width="${cs}" height="${cs}" opacity="${toneOpacity.toFixed(3)}"/>`,
      );

      parts.push(
        `<rect x="${px}" y="${py}" width="${cs}" height="${cs}" fill="url(#${majorPatternId})" opacity="${majorOpacity.toFixed(3)}"/>`,
      );
      if (showMinor) {
        parts.push(
          `<rect x="${px}" y="${py}" width="${cs}" height="${cs}" fill="url(#${minorPatternId})" opacity="${minorOpacity.toFixed(3)}"/>`,
        );
      }
      parts.push(
        `<rect x="${px}" y="${py}" width="${cs}" height="${cs}" fill="url(#${stipplePatternId})" opacity="${stippleOpacity.toFixed(3)}"/>`,
      );

      if (noiseA < chiselChance) {
        const chiselLen = cs * (nearestFloor <= 2 ? 0.42 : 0.32);
        const sx = px + cs * (0.18 + noiseB * 0.58);
        const sy = py + cs * (0.22 + noiseC * 0.52);
        const dir = noiseB > 0.5 ? 1 : -1;
        const ex = clamp(sx + chiselLen * dir, px + 1, px + cs - 1);
        const ey = clamp(sy + chiselLen * 0.52, py + 1, py + cs - 1);
        const chiselOpacity = clamp(0.26 + tunedIntensity * 0.22, 0.2, 0.62);
        parts.push(
          `<line class="rock-chisel-mark" x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" opacity="${chiselOpacity.toFixed(3)}"/>`,
        );
        if (nearestFloor === 1 && noiseC > 0.58) {
          const cLen = chiselLen * 0.42;
          const cex = clamp(sx - cLen * dir * 0.7, px + 1, px + cs - 1);
          const cey = clamp(sy + cLen * 0.55, py + 1, py + cs - 1);
          parts.push(
            `<line class="rock-chisel-mark" x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${cex.toFixed(2)}" y2="${cey.toFixed(2)}" opacity="${(chiselOpacity * 0.82).toFixed(3)}"/>`,
          );
        }
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
  const s = cs * 1.05;

  // Four-point old-school compass rose
  return [
    `<g class="compass" transform="translate(${cx},${cy})">`,
    `  <circle class="compass-fill" cx="0" cy="0" r="${s * 0.95}"/>`,
    `  <circle class="compass-stroke" cx="0" cy="0" r="${s * 0.95}"/>`,
    `  <polygon class="compass-dark" points="0,${-s * 1.2} ${s * 0.3},0 0,${s * 0.45} ${-s * 0.3},0"/>`,
    `  <polygon class="compass-light" points="${-s * 1.2},0 0,${s * 0.3} ${s * 0.45},0 0,${-s * 0.3}"/>`,
    `  <polygon class="compass-stroke" points="0,${-s * 1.2} ${s * 0.3},0 0,${s * 0.45} ${-s * 0.3},0"/>`,
    `  <polygon class="compass-stroke" points="${-s * 1.2},0 0,${s * 0.3} ${s * 0.45},0 0,${-s * 0.3}"/>`,
    `  <circle class="compass-dark" cx="0" cy="${s * 1.35}" r="${s * 0.14}"/>`,
    `  <circle class="compass-fill" cx="0" cy="${s * 1.35}" r="${s * 0.08}"/>`,
    `  <text class="compass-text" x="0" y="${s * 1.75}" dominant-baseline="hanging">North</text>`,
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

const LEGEND_ITEM_DEFS = [
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

/**
 * Compute legend layout dimensions so SVG sizing and rendering stay in sync.
 *
 * @param {number} itemCount
 * @param {number} cs
 * @returns {{colW:number,rowH:number,cols:number,rows:number,pad:number,titleH:number,boxW:number,boxH:number}}
 */
function computeLegendLayout(itemCount, cs) {
  const colW = cs * 6.6;
  const rowH = cs * 1.6;
  const cols = itemCount <= 9 ? Math.min(3, itemCount) : Math.min(4, itemCount);
  const rows = Math.ceil(itemCount / Math.max(1, cols));
  const pad = cs * 0.62;
  const titleH = cs * 1.35;
  const boxW = cols * colW + pad * 2;
  const boxH = rows * rowH + titleH + pad * 2;
  return { colW, rowH, cols, rows, pad, titleH, boxW, boxH };
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
  const active = LEGEND_ITEM_DEFS.filter(([type]) => usedFeatures.has(type));
  if (active.length === 0) return "";

  const { colW, rowH, cols, pad, titleH, boxW, boxH } = computeLegendLayout(
    active.length,
    cs,
  );

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
    `  <line class="legend-sym" x1="${pad}" y1="${pad + titleH}" x2="${boxW - pad}" y2="${pad + titleH}" stroke-width="0.8"/>`,
  );

  // Items
  for (let i = 0; i < active.length; i++) {
    const [cellType, label] = active[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ix = pad + col * colW;
    const iy = pad + titleH + row * rowH + rowH * 0.5;
    const symSize = cs * 0.82;

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
 * Render a classic map title block in the lower sheet area.
 *
 * @param {Object} intent
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {string}
 */
function renderTitleBlock(intent, x, y, w, h) {
  const title = escapeXml(
    (intent.theme || intent.id || "Dungeon Section").toUpperCase(),
  );
  const sectionId = escapeXml((intent.id || "UNKNOWN").toUpperCase());
  const chapter = escapeXml(
    (intent.chapter ? String(intent.chapter) : "UNSPECIFIED").toUpperCase(),
  );
  const level = Number.isFinite(intent.level)
    ? `LEVEL ${intent.level}`
    : "LEVEL ?";

  const pad = Math.max(6, h * 0.12);
  const midY = y + h * 0.53;
  const rightCol = x + w * 0.74;

  return [
    `<g class="title-block">`,
    `  <rect class="title-block-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`,
    `  <line class="title-block-divider" x1="${x}" y1="${midY}" x2="${x + w}" y2="${midY}"/>`,
    `  <line class="title-block-divider" x1="${rightCol}" y1="${y}" x2="${rightCol}" y2="${y + h}"/>`,
    `  <text class="title-label" x="${x + pad}" y="${y + pad * 1.2}">SECTION</text>`,
    `  <text class="title-value" x="${x + pad}" y="${y + h * 0.38}" dominant-baseline="middle">${title}</text>`,
    `  <text class="title-label" x="${x + pad}" y="${midY + pad * 1.2}">ID / CHAPTER</text>`,
    `  <text class="title-value" x="${x + pad}" y="${y + h * 0.82}" dominant-baseline="middle">${sectionId} · ${chapter}</text>`,
    `  <text class="title-label" x="${rightCol + pad * 0.65}" y="${y + pad * 1.2}">LEVEL</text>`,
    `  <text class="title-value" x="${rightCol + pad * 0.65}" y="${y + h * 0.34}" dominant-baseline="middle">${escapeXml(level)}</text>`,
    `  <text class="title-label" x="${rightCol + pad * 0.65}" y="${midY + pad * 1.2}">SCALE</text>`,
    `  <text class="title-value" x="${rightCol + pad * 0.65}" y="${y + h * 0.82}" dominant-baseline="middle">1 SQ = 10 FT</text>`,
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
 * @param {boolean} [options.showRockHatch=true] - Show rock crosshatch
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

  const activeLegendItems = LEGEND_ITEM_DEFS.filter(([type]) =>
    usedFeatures.has(type),
  );
  const legendLayout =
    showLegend && activeLegendItems.length > 0
      ? computeLegendLayout(activeLegendItems.length, cs)
      : null;
  const legendH = legendLayout ? cs * 0.5 + legendLayout.boxH + cs * 0.5 : 0;
  const titleH = cs * 2.75;
  const titleBandH = cs * 0.45 + titleH + cs * 0.55;

  const svgW = mapW;
  const svgH = mapH + legendH + titleBandH;
  const titleW = Math.max(120, Math.min(mapW - cs * 1.6, cs * 20));
  const titleX = Math.max(cs * 0.5, mapW - titleW - cs * 0.6);
  const titleY = mapH + legendH + cs * 0.45;

  const parts = [];

  // SVG header
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`,
  );

  // Stylesheet
  parts.push(generateStyles(cs, colorScheme));

  // Background
  parts.push(`  <rect class="bg" width="${svgW}" height="${svgH}"/>`);
  parts.push(`  <g class="bg-wash-layer">`);
  parts.push(`    ${renderBlueprintWash(svgW, mapH, colorScheme)}`);
  parts.push(`  </g>`);
  parts.push(`  <g class="paper-grain-layer">`);
  parts.push(`    ${renderPaperGrain(svgW, svgH, cs)}`);
  parts.push(`  </g>`);

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
      `    <line class="wall-under" x1="${seg.x1 * cs}" y1="${seg.y1 * cs}" x2="${seg.x2 * cs}" y2="${seg.y2 * cs}"/>`,
    );
    parts.push(
      `    <line class="wall" x1="${seg.x1 * cs}" y1="${seg.y1 * cs}" x2="${seg.x2 * cs}" y2="${seg.y2 * cs}"/>`,
    );
    parts.push(
      `    <line class="wall-highlight" x1="${seg.x1 * cs}" y1="${seg.y1 * cs}" x2="${seg.x2 * cs}" y2="${seg.y2 * cs}"/>`,
    );
  }
  parts.push(`  </g>`);

  // Map frame after walls and floors
  parts.push(`  ${renderMapFrame(mapW, mapH, cs)}`);

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
      // Room number only (no names on the map - those go in a separate key)
      const num = roomLabelFromIndex(i);
      const tagX = (room.x + 0.08) * cs;
      const tagY = (room.y + 0.18) * cs;
      const tagW = Math.max(cs * 0.64, cs * (0.36 + num.length * 0.33));
      const tagH = cs * 0.56;
      const lx = tagX + tagW / 2;
      const ly = tagY + tagH * 0.58;
      parts.push(
        `    <rect class="room-tag" x="${tagX}" y="${tagY}" width="${tagW}" height="${tagH}" rx="${Math.max(1, cs * 0.08)}"/>`,
      );
      parts.push(
        `    <text class="room-number" x="${lx}" y="${ly}">${escapeXml(num)}</text>`,
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
  if (legendLayout) {
    const legendX = cs;
    const legendY = mapH + cs * 0.5;
    parts.push(`  ${renderLegend(usedFeatures, legendX, legendY, cs)}`);
  }

  // Map metadata title block in the lower sheet area
  parts.push(`  <g class="title-block-group">`);
  parts.push(`    ${renderTitleBlock(intent, titleX, titleY, titleW, titleH)}`);
  parts.push(`  </g>`);

  // Sheet frame around the full map + legend/title area.
  parts.push(`  ${renderSheetBorder(svgW, svgH, cs)}`);

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
