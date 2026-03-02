/**
 * Section intent definition and validation.
 * Layer 1 of the four-layer map system.
 *
 * @module map/intent
 */

const VALID_PRESSURES = [
  "faction",
  "pursuit",
  "hazard",
  "puzzle",
  "boss",
  "mixed",
];
const VALID_SESSION_LOADS = ["light", "standard", "heavy"];
const VALID_LAYOUT_STRATEGIES = ["constructed", "organic", "hybrid", "dense"];
const VALID_DENSITIES = ["sparse", "standard", "dense"];

const MAX_GRID_WIDTH = 30;
const MAX_GRID_HEIGHT = 44;

/**
 * Validate a section definition and return a normalised Intent object.
 *
 * @param {Object} section - Raw section definition from JSON
 * @returns {Object} Validated Intent object
 * @throws {Error} If required fields are missing or invalid
 */
function buildIntent(section) {
  if (!section || typeof section !== "object") {
    throw new Error("Section definition must be a non-null object");
  }

  const required = ["id", "theme", "pressure", "sessionLoad", "promise"];
  for (const field of required) {
    if (!section[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!VALID_PRESSURES.includes(section.pressure)) {
    throw new Error(
      `Invalid pressure type: "${section.pressure}". Must be one of: ${VALID_PRESSURES.join(", ")}`,
    );
  }

  if (!VALID_SESSION_LOADS.includes(section.sessionLoad)) {
    throw new Error(
      `Invalid session load: "${section.sessionLoad}". Must be one of: ${VALID_SESSION_LOADS.join(", ")}`,
    );
  }

  const layoutStrategy = section.layoutStrategy || "constructed";
  if (!VALID_LAYOUT_STRATEGIES.includes(layoutStrategy)) {
    throw new Error(
      `Invalid layout strategy: "${layoutStrategy}". Must be one of: ${VALID_LAYOUT_STRATEGIES.join(", ")}`,
    );
  }

  const density = section.density || "standard";
  if (!VALID_DENSITIES.includes(density)) {
    throw new Error(
      `Invalid density: "${density}". Must be one of: ${VALID_DENSITIES.join(", ")}`,
    );
  }

  const grid = section.grid || {
    width: MAX_GRID_WIDTH,
    height: MAX_GRID_HEIGHT,
  };
  if (grid.width > MAX_GRID_WIDTH || grid.height > MAX_GRID_HEIGHT) {
    throw new Error(
      `Grid dimensions ${grid.width}x${grid.height} exceed maximum ${MAX_GRID_WIDTH}x${MAX_GRID_HEIGHT}`,
    );
  }
  if (grid.width < 10 || grid.height < 10) {
    throw new Error(
      `Grid dimensions ${grid.width}x${grid.height} are too small (minimum 10x10)`,
    );
  }

  return {
    id: section.id,
    level: section.level || 1,
    chapter: section.chapter || "",
    theme: section.theme,
    pressure: section.pressure,
    sessionLoad: section.sessionLoad,
    promise: section.promise,
    layoutStrategy,
    grid: { width: grid.width, height: grid.height },
    density,
  };
}

/**
 * Create a seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces floats in [0, 1).
 *
 * @param {number} seed - Integer seed value
 * @returns {Function} RNG function returning floats in [0, 1)
 */
function createRng(seed) {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  buildIntent,
  createRng,
  MAX_GRID_WIDTH,
  MAX_GRID_HEIGHT,
  VALID_PRESSURES,
  VALID_SESSION_LOADS,
  VALID_LAYOUT_STRATEGIES,
  VALID_DENSITIES,
};
