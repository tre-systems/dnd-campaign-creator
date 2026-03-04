"use strict";

const { CELL } = require("./geometry");
const { evaluateAlignmentGate } = require("./style-audit");

const DOOR_CELLS = new Set([
  CELL.DOOR,
  CELL.DOOR_LOCKED,
  CELL.DOOR_SECRET,
  CELL.DOUBLE_DOOR,
]);

const PASSAGE_CELLS = new Set([
  CELL.CORRIDOR,
  CELL.DOOR,
  CELL.DOOR_LOCKED,
  CELL.DOOR_SECRET,
  CELL.DOUBLE_DOOR,
]);

const FEATURE_TAG_BY_CELL = new Map([
  [CELL.DOOR, "door"],
  [CELL.DOOR_LOCKED, "lockedDoor"],
  [CELL.DOOR_SECRET, "secretDoor"],
  [CELL.DOUBLE_DOOR, "doubleDoor"],
  [CELL.STAIRS_UP, "stairsUp"],
  [CELL.STAIRS_DOWN, "stairsDown"],
  [CELL.PILLAR, "columns"],
  [CELL.STATUE, "statues"],
  [CELL.ALTAR, "altar"],
  [CELL.THRONE, "throne"],
  [CELL.PIT, "pit"],
  [CELL.WATER, "water"],
  [CELL.RUBBLE, "rubble"],
  [CELL.TREASURE, "treasure"],
  [CELL.PORTCULLIS, "portcullis"],
  [CELL.ARCHWAY, "archway"],
  [CELL.CURTAIN, "curtain"],
  [CELL.WELL, "well"],
  [CELL.FIREPIT, "firepit"],
  [CELL.SARCOPHAGUS, "sarcophagus"],
  [CELL.BARS, "bars"],
  [CELL.LEVER, "lever"],
  [CELL.FOUNTAIN, "fountain"],
  [CELL.COLLAPSED, "collapsed"],
  [CELL.TRAP, "trap"],
]);

const EDGE_WIDTH_CLASSES = ["tight", "standard", "wide"];
const GATED_EDGE_TYPES = new Set(["door", "locked", "secret"]);

function safeRatio(num, den, fallback = 1) {
  if (!Number.isFinite(den) || den <= 0) return fallback;
  return num / den;
}

function edgeTypeMatchesDoorCell(edgeType, cell) {
  if (edgeType === "door") {
    return DOOR_CELLS.has(cell);
  }
  if (edgeType === "locked") {
    return cell === CELL.DOOR_LOCKED;
  }
  if (edgeType === "secret") {
    return cell === CELL.DOOR_SECRET;
  }
  return false;
}

function normalizeWeights(weights) {
  const style = Number.isFinite(weights.style) ? weights.style : 0.4;
  const content = Number.isFinite(weights.content) ? weights.content : 0.3;
  const semantics = Number.isFinite(weights.semantics)
    ? weights.semantics
    : 0.3;
  const total = style + content + semantics;
  if (total <= 0) {
    return { style: 0.4, content: 0.3, semantics: 0.3 };
  }
  return {
    style: style / total,
    content: content / total,
    semantics: semantics / total,
  };
}

function computeCompositeScore(bucketScores, weights) {
  const norm = normalizeWeights(weights || {});
  return (
    bucketScores.style * norm.style +
    bucketScores.content * norm.content +
    bucketScores.semantics * norm.semantics
  );
}

function roomContainsAnyCell(geometry, room, targetCells) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (targetCells.has(geometry.cells[y][x])) {
        return true;
      }
    }
  }
  return false;
}

function analyzeMapGeometry(geometry, graph, topologyStats) {
  const featureCounts = {};
  for (const value of FEATURE_TAG_BY_CELL.values()) {
    featureCounts[value] = 0;
  }

  let playableCellCount = 0;
  let featureCellCount = 0;
  let doorTotal = 0;
  let doorValid = 0;
  const distinctFeatureTags = new Set();

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = 0; y < geometry.height; y++) {
    for (let x = 0; x < geometry.width; x++) {
      const cell = geometry.cells[y][x];
      if (cell !== CELL.WALL) {
        playableCellCount++;
      }
      const featureTag = FEATURE_TAG_BY_CELL.get(cell);
      if (featureTag) {
        featureCounts[featureTag]++;
        distinctFeatureTags.add(featureTag);
        featureCellCount++;
      }

      if (!DOOR_CELLS.has(cell)) continue;
      doorTotal++;

      let hasPassageAdjacency = false;
      let hasRoomAdjacency = false;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= geometry.width || ny < 0 || ny >= geometry.height) {
          continue;
        }
        const adj = geometry.cells[ny][nx];
        if (PASSAGE_CELLS.has(adj)) {
          hasPassageAdjacency = true;
        } else if (adj !== CELL.WALL) {
          hasRoomAdjacency = true;
        }
      }

      if (hasPassageAdjacency && hasRoomAdjacency) {
        doorValid++;
      }
    }
  }

  const shapeCounts = {};
  let nonRectRooms = 0;
  let circleRooms = 0;
  let caveRooms = 0;
  for (const room of geometry.rooms) {
    const shape = room.shape || "rect";
    shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
    if (shape !== "rect") nonRectRooms++;
    if (shape === "circle") circleRooms++;
    if (shape === "cave") caveRooms++;
  }

  const entryNodes = graph.nodes.filter((node) => node.type === "entry");
  const exitNodes = graph.nodes.filter((node) => node.type === "exit");
  const roomByNodeId = new Map(
    geometry.rooms.map((room) => [room.nodeId, room]),
  );
  const transitionCells = new Set([CELL.STAIRS_UP, CELL.STAIRS_DOWN]);

  let entriesWithTransition = 0;
  for (const node of entryNodes) {
    const room = roomByNodeId.get(node.id);
    if (room && roomContainsAnyCell(geometry, room, transitionCells)) {
      entriesWithTransition++;
    }
  }

  let exitsWithTransition = 0;
  for (const node of exitNodes) {
    const room = roomByNodeId.get(node.id);
    if (room && roomContainsAnyCell(geometry, room, transitionCells)) {
      exitsWithTransition++;
    }
  }

  const hasEdgeType = {
    door: graph.edges.some((edge) => edge.type === "door"),
    locked: graph.edges.some((edge) => edge.type === "locked"),
    secret: graph.edges.some((edge) => edge.type === "secret"),
  };

  const hasDoorSymbol = {
    door: featureCounts.door + featureCounts.doubleDoor > 0,
    locked: featureCounts.lockedDoor > 0,
    secret: featureCounts.secretDoor > 0,
  };

  const widthClassCounts = { tight: 0, standard: 0, wide: 0 };
  for (const edge of graph.edges) {
    const widthClass = EDGE_WIDTH_CLASSES.includes(edge.width)
      ? edge.width
      : "standard";
    widthClassCounts[widthClass]++;
  }

  const corridorBuckets = new Map();
  for (const corridor of geometry.corridors || []) {
    if (corridor.connector) continue;
    const key = `${corridor.from}->${corridor.to}`;
    if (!corridorBuckets.has(key)) {
      corridorBuckets.set(key, []);
    }
    corridorBuckets.get(key).push(corridor);
  }

  let gatedEdgeTotal = 0;
  let gatedEdgePlaced = 0;
  let gatedEdgeSymbolMatched = 0;
  for (const edge of graph.edges) {
    if (!GATED_EDGE_TYPES.has(edge.type)) continue;
    gatedEdgeTotal++;

    const key = `${edge.from}->${edge.to}`;
    const candidates = corridorBuckets.get(key) || [];
    const corridor = candidates.length > 0 ? candidates.shift() : null;
    if (!corridor) continue;

    const doorPositions = Array.isArray(corridor.doorPositions)
      ? corridor.doorPositions
      : [];
    if (doorPositions.length > 0) {
      gatedEdgePlaced++;
    }

    const matched = doorPositions.some((door) => {
      const row = geometry.cells[door.y];
      if (!row) return false;
      const cell = row[door.x];
      return edgeTypeMatchesDoorCell(edge.type, cell);
    });
    if (matched) {
      gatedEdgeSymbolMatched++;
    }
  }

  return {
    roomCount: geometry.rooms.length,
    shapeCounts,
    nonRectRooms,
    circleRooms,
    caveRooms,
    featureCounts,
    distinctFeatureTags: Array.from(distinctFeatureTags).sort(),
    featureTagCount: distinctFeatureTags.size,
    playableCellCount,
    featureCellCount,
    featureCellDensity: safeRatio(featureCellCount, playableCellCount, 0),
    doorTotal,
    doorValid,
    entryCount: entryNodes.length,
    entriesWithTransition,
    exitCount: exitNodes.length,
    exitsWithTransition,
    hasEdgeType,
    hasDoorSymbol,
    widthClassCounts,
    gatedEdgeTotal,
    gatedEdgePlaced,
    gatedEdgeSymbolMatched,
    gatedEdgePlacementCoverage: safeRatio(gatedEdgePlaced, gatedEdgeTotal, 1),
    gatedEdgeSymbolMatchCoverage: safeRatio(
      gatedEdgeSymbolMatched,
      gatedEdgeTotal,
      1,
    ),
    cycleCount: topologyStats.cycleCount,
    disjointPaths: topologyStats.disjointPaths,
  };
}

function aggregateMapMetrics(mapMetrics) {
  const aggregate = {
    mapCount: mapMetrics.length,
    roomCount: 0,
    nonRectRooms: 0,
    circleRooms: 0,
    caveRooms: 0,
    mapsWithCaves: 0,
    shapeCounts: {},
    doorTotal: 0,
    doorValid: 0,
    entryCount: 0,
    entriesWithTransition: 0,
    exitCount: 0,
    exitsWithTransition: 0,
    mapsWithLoops: 0,
    mapsWithDisjointPaths: 0,
    corridorWidthClassCounts: { tight: 0, standard: 0, wide: 0 },
    corridorWidthVariety: 0,
    edgeTypeCoverage: {
      door: { mapsWithType: 0, mapsWithSymbol: 0 },
      locked: { mapsWithType: 0, mapsWithSymbol: 0 },
      secret: { mapsWithType: 0, mapsWithSymbol: 0 },
    },
    featureCellCount: 0,
    playableCellCount: 0,
    featureCounts: {},
    distinctFeatureTags: [],
    averageFeatureTagCountPerMap: 0,
    featureCellDensity: 0,
    nonRectRoomFraction: 0,
    circleRoomFraction: 0,
    caveRoomFraction: 0,
    doorValidityRatio: 1,
    entryTransitionCoverage: 1,
    exitTransitionCoverage: 1,
    loopCoverage: 1,
    disjointPathCoverage: 1,
    gatedEdgePlacementCoverage: 1,
    gatedEdgeSymbolMatchCoverage: 1,
    edgeSymbolCoverage: {
      door: 1,
      locked: 1,
      secret: 1,
    },
  };

  const featureTagSet = new Set();
  const widthClassSet = new Set();
  let featureTagCountSum = 0;

  for (const metrics of mapMetrics) {
    aggregate.roomCount += metrics.roomCount;
    aggregate.nonRectRooms += metrics.nonRectRooms;
    aggregate.circleRooms += metrics.circleRooms;
    aggregate.caveRooms += metrics.caveRooms;
    if (metrics.caveRooms > 0) aggregate.mapsWithCaves++;

    for (const [shape, count] of Object.entries(metrics.shapeCounts)) {
      aggregate.shapeCounts[shape] =
        (aggregate.shapeCounts[shape] || 0) + count;
    }

    aggregate.featureCellCount += metrics.featureCellCount || 0;
    aggregate.playableCellCount += metrics.playableCellCount || 0;
    aggregate.doorTotal += metrics.doorTotal;
    aggregate.doorValid += metrics.doorValid;
    aggregate.entryCount += metrics.entryCount;
    aggregate.entriesWithTransition += metrics.entriesWithTransition;
    aggregate.exitCount += metrics.exitCount;
    aggregate.exitsWithTransition += metrics.exitsWithTransition;

    if (metrics.cycleCount >= 1) aggregate.mapsWithLoops++;
    if (metrics.disjointPaths >= 2) aggregate.mapsWithDisjointPaths++;

    for (const [widthClass, count] of Object.entries(
      metrics.widthClassCounts || {},
    )) {
      if (!EDGE_WIDTH_CLASSES.includes(widthClass)) continue;
      aggregate.corridorWidthClassCounts[widthClass] += count;
      if (count > 0) {
        widthClassSet.add(widthClass);
      }
    }

    for (const edgeType of ["door", "locked", "secret"]) {
      if (metrics.hasEdgeType[edgeType]) {
        aggregate.edgeTypeCoverage[edgeType].mapsWithType++;
        if (metrics.hasDoorSymbol[edgeType]) {
          aggregate.edgeTypeCoverage[edgeType].mapsWithSymbol++;
        }
      }
    }

    for (const [tag, count] of Object.entries(metrics.featureCounts)) {
      aggregate.featureCounts[tag] =
        (aggregate.featureCounts[tag] || 0) + count;
      if (count > 0) featureTagSet.add(tag);
    }
    featureTagCountSum += metrics.featureTagCount;
  }

  aggregate.distinctFeatureTags = Array.from(featureTagSet).sort();
  aggregate.averageFeatureTagCountPerMap = safeRatio(
    featureTagCountSum,
    aggregate.mapCount,
    0,
  );
  aggregate.corridorWidthVariety = widthClassSet.size;
  aggregate.featureCellDensity = safeRatio(
    aggregate.featureCellCount,
    aggregate.playableCellCount,
    0,
  );

  aggregate.nonRectRoomFraction = safeRatio(
    aggregate.nonRectRooms,
    aggregate.roomCount,
    0,
  );
  aggregate.circleRoomFraction = safeRatio(
    aggregate.circleRooms,
    aggregate.roomCount,
    0,
  );
  aggregate.caveRoomFraction = safeRatio(
    aggregate.caveRooms,
    aggregate.roomCount,
    0,
  );
  aggregate.doorValidityRatio = safeRatio(
    aggregate.doorValid,
    aggregate.doorTotal,
    1,
  );
  aggregate.entryTransitionCoverage = safeRatio(
    aggregate.entriesWithTransition,
    aggregate.entryCount,
    1,
  );
  aggregate.exitTransitionCoverage = safeRatio(
    aggregate.exitsWithTransition,
    aggregate.exitCount,
    1,
  );
  aggregate.loopCoverage = safeRatio(
    aggregate.mapsWithLoops,
    aggregate.mapCount,
    1,
  );
  aggregate.disjointPathCoverage = safeRatio(
    aggregate.mapsWithDisjointPaths,
    aggregate.mapCount,
    1,
  );
  aggregate.gatedEdgePlacementCoverage = safeRatio(
    mapMetrics.reduce(
      (sum, metrics) => sum + (metrics.gatedEdgePlaced || 0),
      0,
    ),
    mapMetrics.reduce((sum, metrics) => sum + (metrics.gatedEdgeTotal || 0), 0),
    1,
  );
  aggregate.gatedEdgeSymbolMatchCoverage = safeRatio(
    mapMetrics.reduce(
      (sum, metrics) => sum + (metrics.gatedEdgeSymbolMatched || 0),
      0,
    ),
    mapMetrics.reduce((sum, metrics) => sum + (metrics.gatedEdgeTotal || 0), 0),
    1,
  );

  for (const edgeType of ["door", "locked", "secret"]) {
    const bucket = aggregate.edgeTypeCoverage[edgeType];
    aggregate.edgeSymbolCoverage[edgeType] = safeRatio(
      bucket.mapsWithSymbol,
      bucket.mapsWithType,
      1,
    );
  }

  return aggregate;
}

function evaluateMinCheck(name, actual, expected, precision = 3) {
  const pass = actual >= expected;
  return {
    name,
    pass,
    comparator: "min",
    actual: Number(actual.toFixed(precision)),
    expected: Number(expected.toFixed(precision)),
    message: pass
      ? `${name}: ${actual.toFixed(precision)} >= ${expected.toFixed(precision)}`
      : `${name}: ${actual.toFixed(precision)} < ${expected.toFixed(precision)}`,
  };
}

function evaluateMaxCheck(name, actual, expected, precision = 3) {
  const pass = actual <= expected;
  return {
    name,
    pass,
    comparator: "max",
    actual: Number(actual.toFixed(precision)),
    expected: Number(expected.toFixed(precision)),
    message: pass
      ? `${name}: ${actual.toFixed(precision)} <= ${expected.toFixed(precision)}`
      : `${name}: ${actual.toFixed(precision)} > ${expected.toFixed(precision)}`,
  };
}

function evaluateListInclusionChecks(name, actualList, requiredItems) {
  if (!Array.isArray(requiredItems) || requiredItems.length === 0) return [];
  const actualSet = new Set(actualList || []);
  return requiredItems.map((item) => {
    const pass = actualSet.has(item);
    return {
      name: `${name}.${item}`,
      pass,
      comparator: "contains",
      actual: pass,
      expected: true,
      message: pass
        ? `${name}: includes ${item}`
        : `${name}: missing required ${item}`,
    };
  });
}

function scoreFromChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 100;
  const passed = checks.filter((check) => check.pass).length;
  return (passed / checks.length) * 100;
}

function evaluateContentChecks(aggregate, contentSpec) {
  const checks = [];
  const spec = contentSpec || {};

  if (Number.isFinite(spec.minDistinctFeatureTypes)) {
    checks.push(
      evaluateMinCheck(
        "content.minDistinctFeatureTypes",
        aggregate.distinctFeatureTags.length,
        spec.minDistinctFeatureTypes,
        0,
      ),
    );
  }
  if (Number.isFinite(spec.minAverageFeatureTagCountPerMap)) {
    checks.push(
      evaluateMinCheck(
        "content.minAverageFeatureTagCountPerMap",
        aggregate.averageFeatureTagCountPerMap,
        spec.minAverageFeatureTagCountPerMap,
      ),
    );
  }
  if (Number.isFinite(spec.minCorridorWidthVariety)) {
    checks.push(
      evaluateMinCheck(
        "content.minCorridorWidthVariety",
        aggregate.corridorWidthVariety,
        spec.minCorridorWidthVariety,
        0,
      ),
    );
  }
  if (Number.isFinite(spec.minFeatureCellDensity)) {
    checks.push(
      evaluateMinCheck(
        "content.minFeatureCellDensity",
        aggregate.featureCellDensity,
        spec.minFeatureCellDensity,
      ),
    );
  }
  if (Number.isFinite(spec.maxFeatureCellDensity)) {
    checks.push(
      evaluateMaxCheck(
        "content.maxFeatureCellDensity",
        aggregate.featureCellDensity,
        spec.maxFeatureCellDensity,
      ),
    );
  }
  if (Number.isFinite(spec.minNonRectRoomFraction)) {
    checks.push(
      evaluateMinCheck(
        "content.minNonRectRoomFraction",
        aggregate.nonRectRoomFraction,
        spec.minNonRectRoomFraction,
      ),
    );
  }
  if (Number.isFinite(spec.minCircleRoomFraction)) {
    checks.push(
      evaluateMinCheck(
        "content.minCircleRoomFraction",
        aggregate.circleRoomFraction,
        spec.minCircleRoomFraction,
      ),
    );
  }
  if (Number.isFinite(spec.minCaveRoomFraction)) {
    checks.push(
      evaluateMinCheck(
        "content.minCaveRoomFraction",
        aggregate.caveRoomFraction,
        spec.minCaveRoomFraction,
      ),
    );
  }
  if (Number.isFinite(spec.minMapsWithCaves)) {
    checks.push(
      evaluateMinCheck(
        "content.minMapsWithCaves",
        aggregate.mapsWithCaves,
        spec.minMapsWithCaves,
        0,
      ),
    );
  }

  checks.push(
    ...evaluateListInclusionChecks(
      "content.requiredFeatureTags",
      aggregate.distinctFeatureTags,
      spec.requiredFeatureTags,
    ),
  );

  return checks;
}

function evaluateSemanticsChecks(aggregate, semanticsSpec) {
  const checks = [];
  const spec = semanticsSpec || {};

  if (Number.isFinite(spec.minDoorValidityRatio)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minDoorValidityRatio",
        aggregate.doorValidityRatio,
        spec.minDoorValidityRatio,
      ),
    );
  }
  if (Number.isFinite(spec.minEntryTransitionCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minEntryTransitionCoverage",
        aggregate.entryTransitionCoverage,
        spec.minEntryTransitionCoverage,
      ),
    );
  }
  if (Number.isFinite(spec.minExitTransitionCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minExitTransitionCoverage",
        aggregate.exitTransitionCoverage,
        spec.minExitTransitionCoverage,
      ),
    );
  }
  if (Number.isFinite(spec.minLoopCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minLoopCoverage",
        aggregate.loopCoverage,
        spec.minLoopCoverage,
      ),
    );
  }
  if (Number.isFinite(spec.minDisjointPathCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minDisjointPathCoverage",
        aggregate.disjointPathCoverage,
        spec.minDisjointPathCoverage,
      ),
    );
  }
  if (Number.isFinite(spec.minGatedEdgePlacementCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minGatedEdgePlacementCoverage",
        aggregate.gatedEdgePlacementCoverage,
        spec.minGatedEdgePlacementCoverage,
      ),
    );
  }
  if (Number.isFinite(spec.minGatedEdgeSymbolMatchCoverage)) {
    checks.push(
      evaluateMinCheck(
        "semantics.minGatedEdgeSymbolMatchCoverage",
        aggregate.gatedEdgeSymbolMatchCoverage,
        spec.minGatedEdgeSymbolMatchCoverage,
      ),
    );
  }

  if (semanticsSpec && semanticsSpec.minEdgeSymbolCoverage) {
    for (const [edgeType, minCoverage] of Object.entries(
      semanticsSpec.minEdgeSymbolCoverage,
    )) {
      const actual = Number.isFinite(aggregate.edgeSymbolCoverage[edgeType])
        ? aggregate.edgeSymbolCoverage[edgeType]
        : 0;
      checks.push(
        evaluateMinCheck(
          `semantics.minEdgeSymbolCoverage.${edgeType}`,
          actual,
          minCoverage,
        ),
      );
    }
  }

  return checks;
}

function evaluateQualityGate(report, spec) {
  if (!report || typeof report !== "object") {
    throw new Error("report is required");
  }
  if (!spec || typeof spec !== "object") {
    throw new Error("spec is required");
  }
  const qualityGate = spec.qualityGate || {};
  const styleSpec = qualityGate.style || {};
  const contentSpec = qualityGate.content || {};
  const semanticsSpec = qualityGate.semantics || {};

  const styleFailures = evaluateAlignmentGate(
    report.style.score,
    report.style.delta,
    {
      minScore: styleSpec.minScore,
      maxAbsDelta: styleSpec.maxAbsDelta || {},
    },
  );

  const contentChecks = evaluateContentChecks(report.content, contentSpec);
  const semanticsChecks = evaluateSemanticsChecks(
    report.semantics,
    semanticsSpec,
  );

  const bucketScores = {
    style: report.style.score,
    content: scoreFromChecks(contentChecks),
    semantics: scoreFromChecks(semanticsChecks),
  };

  const compositeScore = computeCompositeScore(
    bucketScores,
    qualityGate.weights || {},
  );
  const minCompositeScore = Number.isFinite(qualityGate.minCompositeScore)
    ? qualityGate.minCompositeScore
    : 0;
  const compositePass = compositeScore >= minCompositeScore;

  const failures = [];
  for (const failure of styleFailures) {
    if (failure.type === "minScore") {
      failures.push(
        `style score ${failure.actual.toFixed(1)} < required ${failure.expected.toFixed(1)}`,
      );
    } else if (failure.type === "maxAbsDelta") {
      failures.push(
        `style |delta.${failure.metric}| ${failure.actual.toFixed(3)} > ${failure.expected.toFixed(3)}`,
      );
    } else {
      failures.push(`style gate failure: ${JSON.stringify(failure)}`);
    }
  }
  for (const check of contentChecks) {
    if (!check.pass) failures.push(check.message);
  }
  for (const check of semanticsChecks) {
    if (!check.pass) failures.push(check.message);
  }
  if (!compositePass) {
    failures.push(
      `composite score ${compositeScore.toFixed(1)} < required ${minCompositeScore.toFixed(1)}`,
    );
  }

  return {
    passed: failures.length === 0,
    styleFailures,
    contentChecks,
    semanticsChecks,
    bucketScores,
    compositeScore,
    minCompositeScore,
    compositePass,
    failures,
  };
}

module.exports = {
  FEATURE_TAG_BY_CELL,
  computeCompositeScore,
  analyzeMapGeometry,
  aggregateMapMetrics,
  evaluateQualityGate,
  evaluateContentChecks,
  evaluateSemanticsChecks,
  scoreFromChecks,
};
