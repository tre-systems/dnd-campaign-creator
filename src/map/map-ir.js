"use strict";

const MAP_IR_VERSION = "0.1.0";
const THRESHOLD_TYPES = new Set(["door", "locked", "secret"]);
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "version",
  "meta",
  "floors",
  "walls",
  "thresholds",
  "labels",
  "grid",
  "diagnostics",
  "extensions",
]);
const ALLOWED_META_KEYS = new Set([
  "width",
  "height",
  "cellSizeFt",
  "title",
  "source",
]);

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function validateUnknownKeys(value, allowedKeys, path, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "is not allowed in MapIR v0.1.0");
    }
  }
}

function validateRect(rect, path, errors, bounds = null) {
  if (!isObject(rect)) {
    pushError(errors, path, "must be an object");
    return;
  }

  const keys = ["x", "y", "w", "h"];
  for (const key of keys) {
    if (!isNonNegativeInt(rect[key])) {
      pushError(errors, `${path}.${key}`, "must be a non-negative integer");
    }
  }

  if (!isPositiveInt(rect.w)) {
    pushError(errors, `${path}.w`, "must be a positive integer");
  }
  if (!isPositiveInt(rect.h)) {
    pushError(errors, `${path}.h`, "must be a positive integer");
  }

  if (
    bounds &&
    isPositiveInt(bounds.width) &&
    isPositiveInt(bounds.height) &&
    isNonNegativeInt(rect.x) &&
    isNonNegativeInt(rect.y) &&
    isPositiveInt(rect.w) &&
    isPositiveInt(rect.h)
  ) {
    if (rect.x + rect.w > bounds.width) {
      pushError(errors, `${path}.x`, "rectangle exceeds meta.width bounds");
    }
    if (rect.y + rect.h > bounds.height) {
      pushError(errors, `${path}.y`, "rectangle exceeds meta.height bounds");
    }
  }
}

function validateWall(wall, path, errors, bounds = null) {
  if (!isObject(wall)) {
    pushError(errors, path, "must be an object");
    return;
  }

  const keys = ["x1", "y1", "x2", "y2"];
  for (const key of keys) {
    if (!isFiniteNumber(wall[key])) {
      pushError(errors, `${path}.${key}`, "must be a finite number");
    }
  }

  if (
    isFiniteNumber(wall.x1) &&
    isFiniteNumber(wall.y1) &&
    isFiniteNumber(wall.x2) &&
    isFiniteNumber(wall.y2)
  ) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    if (dx === 0 && dy === 0) {
      pushError(errors, path, "wall segment must have non-zero length");
    }
    if (dx !== 0 && dy !== 0) {
      pushError(errors, path, "wall segment must be axis-aligned");
    }
  }

  if (
    bounds &&
    isPositiveInt(bounds.width) &&
    isPositiveInt(bounds.height) &&
    isFiniteNumber(wall.x1) &&
    isFiniteNumber(wall.y1) &&
    isFiniteNumber(wall.x2) &&
    isFiniteNumber(wall.y2)
  ) {
    const points = [
      { x: wall.x1, y: wall.y1, key: "x1" },
      { x: wall.x2, y: wall.y2, key: "x2" },
    ];
    for (const point of points) {
      if (point.x < 0 || point.x > bounds.width) {
        pushError(
          errors,
          `${path}.${point.key}`,
          "must be within 0..meta.width (edge coordinates)",
        );
      }
      if (point.y < 0 || point.y > bounds.height) {
        const yKey = point.key === "x1" ? "y1" : "y2";
        pushError(
          errors,
          `${path}.${yKey}`,
          "must be within 0..meta.height (edge coordinates)",
        );
      }
    }
  }
}

function validateThreshold(threshold, path, errors, bounds = null) {
  if (!isObject(threshold)) {
    pushError(errors, path, "must be an object");
    return;
  }

  if (!isNonNegativeInt(threshold.x)) {
    pushError(errors, `${path}.x`, "must be a non-negative integer");
  }
  if (!isNonNegativeInt(threshold.y)) {
    pushError(errors, `${path}.y`, "must be a non-negative integer");
  }

  if (
    typeof threshold.type !== "string" ||
    !THRESHOLD_TYPES.has(threshold.type)
  ) {
    pushError(
      errors,
      `${path}.type`,
      `must be one of: ${Array.from(THRESHOLD_TYPES).join(", ")}`,
    );
  }

  if (
    bounds &&
    isPositiveInt(bounds.width) &&
    isPositiveInt(bounds.height) &&
    isNonNegativeInt(threshold.x) &&
    isNonNegativeInt(threshold.y)
  ) {
    if (threshold.x >= bounds.width) {
      pushError(errors, `${path}.x`, "must be within 0..meta.width-1");
    }
    if (threshold.y >= bounds.height) {
      pushError(errors, `${path}.y`, "must be within 0..meta.height-1");
    }
  }
}

function validateLabel(label, path, errors, bounds = null) {
  if (!isObject(label)) {
    pushError(errors, path, "must be an object");
    return;
  }

  if (typeof label.text !== "string" || label.text.trim().length === 0) {
    pushError(errors, `${path}.text`, "must be a non-empty string");
  }

  if (!isFiniteNumber(label.x)) {
    pushError(errors, `${path}.x`, "must be a finite number");
  }
  if (!isFiniteNumber(label.y)) {
    pushError(errors, `${path}.y`, "must be a finite number");
  }

  if (
    bounds &&
    isPositiveInt(bounds.width) &&
    isPositiveInt(bounds.height) &&
    isFiniteNumber(label.x) &&
    isFiniteNumber(label.y)
  ) {
    if (label.x < 0 || label.x >= bounds.width) {
      pushError(errors, `${path}.x`, "must be within 0..meta.width");
    }
    if (label.y < 0 || label.y >= bounds.height) {
      pushError(errors, `${path}.y`, "must be within 0..meta.height");
    }
  }
}

function validateMapIr(mapIr) {
  const errors = [];

  if (!isObject(mapIr)) {
    return {
      valid: false,
      errors: [{ path: "mapIr", message: "map IR must be an object" }],
    };
  }

  validateUnknownKeys(mapIr, ALLOWED_TOP_LEVEL_KEYS, "mapIr", errors);

  if (mapIr.version !== MAP_IR_VERSION) {
    pushError(errors, "version", `must equal ${MAP_IR_VERSION}`);
  }

  let metaWidth = null;
  let metaHeight = null;

  if (!isObject(mapIr.meta)) {
    pushError(errors, "meta", "must be an object");
  } else {
    validateUnknownKeys(mapIr.meta, ALLOWED_META_KEYS, "meta", errors);

    if (!isPositiveInt(mapIr.meta.width)) {
      pushError(errors, "meta.width", "must be a positive integer");
    } else {
      metaWidth = mapIr.meta.width;
    }
    if (!isPositiveInt(mapIr.meta.height)) {
      pushError(errors, "meta.height", "must be a positive integer");
    } else {
      metaHeight = mapIr.meta.height;
    }
    if (
      mapIr.meta.cellSizeFt !== undefined &&
      !isFiniteNumber(mapIr.meta.cellSizeFt)
    ) {
      pushError(errors, "meta.cellSizeFt", "must be a finite number");
    }
  }

  const bounds = {
    width: metaWidth,
    height: metaHeight,
  };

  if (!Array.isArray(mapIr.floors)) {
    pushError(errors, "floors", "must be an array");
  } else {
    mapIr.floors.forEach((rect, idx) => {
      validateRect(rect, `floors[${idx}]`, errors, bounds);
    });
  }

  if (!Array.isArray(mapIr.walls)) {
    pushError(errors, "walls", "must be an array");
  } else {
    mapIr.walls.forEach((wall, idx) => {
      validateWall(wall, `walls[${idx}]`, errors, bounds);
    });
  }

  if (mapIr.thresholds !== undefined) {
    if (!Array.isArray(mapIr.thresholds)) {
      pushError(errors, "thresholds", "must be an array if provided");
    } else {
      mapIr.thresholds.forEach((threshold, idx) => {
        validateThreshold(threshold, `thresholds[${idx}]`, errors, bounds);
      });
    }
  }

  if (mapIr.labels !== undefined) {
    if (!Array.isArray(mapIr.labels)) {
      pushError(errors, "labels", "must be an array if provided");
    } else {
      mapIr.labels.forEach((label, idx) => {
        validateLabel(label, `labels[${idx}]`, errors, bounds);
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertValidMapIr(mapIr) {
  const result = validateMapIr(mapIr);
  if (!result.valid) {
    const summary = result.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`Invalid MapIR: ${summary}`);
  }
  return mapIr;
}

function createMapIr(partial = {}) {
  if (!isObject(partial)) {
    throw new Error("partial map IR must be an object");
  }

  const mapIr = {
    version: MAP_IR_VERSION,
    meta: {
      width: 1,
      height: 1,
      cellSizeFt: 10,
      ...(isObject(partial.meta) ? partial.meta : {}),
    },
    floors: Array.isArray(partial.floors) ? partial.floors : [],
    walls: Array.isArray(partial.walls) ? partial.walls : [],
    thresholds: Array.isArray(partial.thresholds) ? partial.thresholds : [],
    labels: Array.isArray(partial.labels) ? partial.labels : [],
  };

  if (isObject(partial.grid)) {
    mapIr.grid = partial.grid;
  }

  if (isObject(partial.diagnostics)) {
    mapIr.diagnostics = partial.diagnostics;
  }

  if (isObject(partial.extensions)) {
    mapIr.extensions = partial.extensions;
  }

  return assertValidMapIr(mapIr);
}

module.exports = {
  MAP_IR_VERSION,
  THRESHOLD_TYPES,
  validateMapIr,
  assertValidMapIr,
  createMapIr,
};
