"use strict";

const MAP_IR_VERSION = "0.1.0";
const THRESHOLD_TYPES = new Set(["door", "locked", "secret"]);

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

function validateRect(rect, path, errors) {
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
}

function validateWall(wall, path, errors) {
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
}

function validateThreshold(threshold, path, errors) {
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
}

function validateLabel(label, path, errors) {
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
}

function validateMapIr(mapIr) {
  const errors = [];

  if (!isObject(mapIr)) {
    return {
      valid: false,
      errors: [{ path: "mapIr", message: "map IR must be an object" }],
    };
  }

  if (mapIr.version !== undefined && mapIr.version !== MAP_IR_VERSION) {
    pushError(
      errors,
      "version",
      `unsupported version \"${mapIr.version}\" (expected ${MAP_IR_VERSION})`,
    );
  }

  if (!isObject(mapIr.meta)) {
    pushError(errors, "meta", "must be an object");
  } else {
    if (!isPositiveInt(mapIr.meta.width)) {
      pushError(errors, "meta.width", "must be a positive integer");
    }
    if (!isPositiveInt(mapIr.meta.height)) {
      pushError(errors, "meta.height", "must be a positive integer");
    }
    if (
      mapIr.meta.cellSizeFt !== undefined &&
      !isFiniteNumber(mapIr.meta.cellSizeFt)
    ) {
      pushError(errors, "meta.cellSizeFt", "must be a finite number");
    }
  }

  if (!Array.isArray(mapIr.floors)) {
    pushError(errors, "floors", "must be an array");
  } else {
    mapIr.floors.forEach((rect, idx) => {
      validateRect(rect, `floors[${idx}]`, errors);
    });
  }

  if (!Array.isArray(mapIr.walls)) {
    pushError(errors, "walls", "must be an array");
  } else {
    mapIr.walls.forEach((wall, idx) => {
      validateWall(wall, `walls[${idx}]`, errors);
    });
  }

  if (mapIr.thresholds !== undefined) {
    if (!Array.isArray(mapIr.thresholds)) {
      pushError(errors, "thresholds", "must be an array if provided");
    } else {
      mapIr.thresholds.forEach((threshold, idx) => {
        validateThreshold(threshold, `thresholds[${idx}]`, errors);
      });
    }
  }

  if (mapIr.labels !== undefined) {
    if (!Array.isArray(mapIr.labels)) {
      pushError(errors, "labels", "must be an array if provided");
    } else {
      mapIr.labels.forEach((label, idx) => {
        validateLabel(label, `labels[${idx}]`, errors);
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

  return assertValidMapIr(mapIr);
}

module.exports = {
  MAP_IR_VERSION,
  THRESHOLD_TYPES,
  validateMapIr,
  assertValidMapIr,
  createMapIr,
};
