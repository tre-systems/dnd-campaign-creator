"use strict";

const METRIC_KEYS = [
  "luminanceMean",
  "luminanceStd",
  "saturationMean",
  "blueCast",
  "inkCoverage",
  "edgeDensity",
  "orthogonalEdgeRatio",
  "textureDensity",
];

const DEFAULT_TOLERANCES = {
  luminanceMean: 0.06,
  luminanceStd: 0.05,
  saturationMean: 0.05,
  blueCast: 0.08,
  inkCoverage: 0.06,
  edgeDensity: 0.08,
  orthogonalEdgeRatio: 0.12,
  textureDensity: 0.08,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function computeMetrics(raw, width, height, channels = 4) {
  if (!raw || typeof raw.length !== "number") {
    throw new Error("raw pixel buffer is required");
  }
  assertFiniteNumber(width, "width");
  assertFiniteNumber(height, "height");
  assertFiniteNumber(channels, "channels");
  if (width <= 0 || height <= 0 || channels < 3) {
    throw new Error("invalid image dimensions or channels");
  }

  const pixelCount = width * height;
  const luma = new Float32Array(pixelCount);

  let sumLum = 0;
  let sumLumSq = 0;
  let sumSat = 0;
  let sumBlueCast = 0;

  for (let i = 0, p = 0; p < pixelCount; i += channels, p++) {
    const r = raw[i] / 255;
    const g = raw[i + 1] / 255;
    const b = raw[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    luma[p] = lum;
    sumLum += lum;
    sumLumSq += lum * lum;
    sumSat += sat;
    sumBlueCast += b - r;
  }

  const luminanceMean = sumLum / pixelCount;
  const luminanceVariance = Math.max(
    0,
    sumLumSq / pixelCount - luminanceMean * luminanceMean,
  );
  const luminanceStd = Math.sqrt(luminanceVariance);
  const saturationMean = sumSat / pixelCount;
  const blueCast = sumBlueCast / pixelCount;

  let edgeCount = 0;
  let orthogonalEdgeCount = 0;
  let gradientSampleCount = 0;
  let textureHits = 0;
  let textureSamples = 0;

  // These thresholds are tuned for 0..1 luma values post-normalization.
  const edgeThreshold = 0.18;
  const textureThreshold = 0.08;

  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      const rowAbove = (y - 1) * width;
      const rowBelow = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const p = row + x;
        const a = luma[rowAbove + (x - 1)];
        const b = luma[rowAbove + x];
        const c = luma[rowAbove + (x + 1)];
        const d = luma[row + (x - 1)];
        const f = luma[row + (x + 1)];
        const g = luma[rowBelow + (x - 1)];
        const h = luma[rowBelow + x];
        const i = luma[rowBelow + (x + 1)];

        const dx = -a - 2 * d - g + c + 2 * f + i;
        const dy = -a - 2 * b - c + g + 2 * h + i;
        const mag = Math.hypot(dx, dy) / 4;

        gradientSampleCount++;

        if (mag > edgeThreshold) {
          edgeCount++;

          // Distance to 0/90/180 degrees: closer implies orthogonal linework.
          const theta = Math.abs(Math.atan2(dy, dx));
          const d0 = Math.min(theta, Math.abs(Math.PI - theta));
          const d90 = Math.abs(theta - Math.PI / 2);
          const orthDist = Math.min(d0, d90);
          if (orthDist <= Math.PI / 8) {
            orthogonalEdgeCount++;
          }
        }

        const center = luma[p];
        if (Math.abs(center - luma[p + 1]) > textureThreshold) {
          textureHits++;
        }
        textureSamples++;

        if (Math.abs(center - luma[p + width]) > textureThreshold) {
          textureHits++;
        }
        textureSamples++;
      }
    }
  }

  const edgeDensity =
    gradientSampleCount > 0 ? edgeCount / gradientSampleCount : 0;
  const orthogonalEdgeRatio =
    edgeCount > 0 ? orthogonalEdgeCount / edgeCount : 0;
  const textureDensity = textureSamples > 0 ? textureHits / textureSamples : 0;

  const inkThreshold = clamp(luminanceMean - luminanceStd * 0.65, 0.08, 0.45);
  let inkCount = 0;
  for (let p = 0; p < pixelCount; p++) {
    if (luma[p] < inkThreshold) {
      inkCount++;
    }
  }
  const inkCoverage = inkCount / pixelCount;

  return {
    luminanceMean,
    luminanceStd,
    saturationMean,
    blueCast,
    inkCoverage,
    edgeDensity,
    orthogonalEdgeRatio,
    textureDensity,
  };
}

function aggregateMetrics(metricsList) {
  if (!Array.isArray(metricsList) || metricsList.length === 0) {
    throw new Error("metricsList must contain at least one metrics object");
  }

  const aggregate = {};
  for (const key of METRIC_KEYS) {
    let sum = 0;
    for (const metrics of metricsList) {
      assertFiniteNumber(metrics[key], `metrics.${key}`);
      sum += metrics[key];
    }
    aggregate[key] = sum / metricsList.length;
  }
  return aggregate;
}

function metricDelta(sample, reference) {
  const delta = {};
  for (const key of METRIC_KEYS) {
    assertFiniteNumber(sample[key], `sample.${key}`);
    assertFiniteNumber(reference[key], `reference.${key}`);
    delta[key] = sample[key] - reference[key];
  }
  return delta;
}

function computeAlignmentScore(delta, tolerances = DEFAULT_TOLERANCES) {
  let total = 0;
  for (const key of METRIC_KEYS) {
    const tol = tolerances[key];
    assertFiniteNumber(delta[key], `delta.${key}`);
    assertFiniteNumber(tol, `tolerances.${key}`);
    const closeness = Math.max(0, 1 - Math.abs(delta[key]) / tol);
    total += closeness;
  }
  return (total / METRIC_KEYS.length) * 100;
}

function deriveRecommendations(sample, reference, delta) {
  const notes = [];

  if (delta.blueCast < -0.04) {
    notes.push(
      "Increase blue bias in fills/ink and reduce warm tones to better match old-school blueprint coloration.",
    );
  } else if (delta.blueCast > 0.05) {
    notes.push(
      "Blue cast is stronger than references; consider slightly neutralizing non-wall areas for balance.",
    );
  }

  if (delta.luminanceMean < -0.06) {
    notes.push(
      "Overall map value is darker than references; lighten paper/floor tones while preserving wall contrast.",
    );
  } else if (delta.luminanceMean > 0.06) {
    notes.push(
      "Overall map value is lighter than references; deepen floor/rock tone separation slightly.",
    );
  }

  if (delta.saturationMean > 0.05) {
    notes.push(
      "Color saturation is above reference set; desaturate fills and symbol strokes for a flatter period look.",
    );
  } else if (delta.saturationMean < -0.05) {
    notes.push(
      "Color saturation is below reference set; increase hue separation slightly so symbols stay legible.",
    );
  }

  if (delta.inkCoverage < -0.04) {
    notes.push(
      "Linework reads lighter than references; increase wall/symbol stroke weight or darken ink color.",
    );
  } else if (delta.inkCoverage > 0.05) {
    notes.push(
      "Ink coverage is denser than references; reduce heavy fill/stroke areas to avoid muddy output.",
    );
  }

  if (delta.edgeDensity < -0.05) {
    notes.push(
      "Structural detail is sparser than references; add more crisp boundaries in walls, doors, and hatching.",
    );
  }

  if (delta.orthogonalEdgeRatio < -0.07) {
    notes.push(
      "Orthogonal stroke bias is below reference set; emphasize straight ruled strokes over curved ornament.",
    );
  } else if (delta.orthogonalEdgeRatio > 0.1) {
    notes.push(
      "Orthogonal bias is higher than references; add subtle irregularity in rock and secondary symbols.",
    );
  }

  if (delta.textureDensity < -0.05) {
    notes.push(
      "Rock treatment is less active than references; increase secondary hatch/stipple/chisel frequency.",
    );
  } else if (delta.textureDensity > 0.06) {
    notes.push(
      "Rock texture appears busier than references; dial back tertiary texture layers for cleaner readability.",
    );
  }

  if (Math.abs(sample.luminanceStd - reference.luminanceStd) > 0.05) {
    notes.push(
      "Global contrast differs from references; tune floor-vs-rock and wall-vs-floor contrast separation.",
    );
  }

  return notes;
}

module.exports = {
  METRIC_KEYS,
  DEFAULT_TOLERANCES,
  computeMetrics,
  aggregateMetrics,
  metricDelta,
  computeAlignmentScore,
  deriveRecommendations,
};
