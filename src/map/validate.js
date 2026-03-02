/**
 * Topology and geometry validation rules.
 * Enforces the design rules from the map system proposal.
 *
 * @module map/validate
 */

const {
  bfsDistance,
  countEdgeDisjointPaths,
  findCycleCount,
  nodeDegree,
} = require("./topology");
const { MAX_GRID_WIDTH, MAX_GRID_HEIGHT } = require("./intent");

/**
 * Validate a topology graph against design rules.
 *
 * @param {Object} graph - TopologyGraph from buildGraph()
 * @param {{width: number, height: number}} gridSize - Grid dimensions
 * @returns {{valid: boolean, results: {rule: string, passed: boolean, detail: string}[]}}
 */
function validateTopology(graph, gridSize) {
  const results = [];

  // Rule 1: Grid size
  const gridOk =
    gridSize.width <= MAX_GRID_WIDTH && gridSize.height <= MAX_GRID_HEIGHT;
  results.push({
    rule: "Grid size",
    passed: gridOk,
    detail: gridOk
      ? `${gridSize.width}x${gridSize.height} within ${MAX_GRID_WIDTH}x${MAX_GRID_HEIGHT} limit`
      : `${gridSize.width}x${gridSize.height} exceeds ${MAX_GRID_WIDTH}x${MAX_GRID_HEIGHT} limit`,
  });

  // Rule 2: Entry and exit exist
  const entries = graph.nodes.filter((n) => n.type === "entry");
  const exits = graph.nodes.filter((n) => n.type === "exit");
  const hasEntryExit = entries.length > 0 && exits.length > 0;
  results.push({
    rule: "Entry and exit exist",
    passed: hasEntryExit,
    detail: hasEntryExit
      ? `${entries.length} entry, ${exits.length} exit`
      : `Missing ${entries.length === 0 ? "entry" : ""}${entries.length === 0 && exits.length === 0 ? " and " : ""}${exits.length === 0 ? "exit" : ""}`,
  });

  // Rule 3: Guard placement (within 2 edges of entry)
  const guards = graph.nodes.filter((n) => n.type === "guard");
  let guardOk = true;
  let guardDetail = "";
  if (guards.length > 0 && entries.length > 0) {
    for (const guard of guards) {
      let minDist = Infinity;
      for (const entry of entries) {
        const dists = bfsDistance(graph, entry.id);
        const d = dists.get(guard.id);
        if (d !== undefined && d < minDist) minDist = d;
      }
      if (minDist > 2) {
        guardOk = false;
        guardDetail = `Guard ${guard.id} is ${minDist} edges from nearest entry (max 2)`;
        break;
      }
    }
    if (guardOk) {
      guardDetail = `All ${guards.length} guards within 2 edges of entry`;
    }
  } else if (guards.length === 0) {
    guardDetail = "No guard nodes (OK - not required)";
  } else {
    guardOk = false;
    guardDetail = "Guards exist but no entry node";
  }
  results.push({
    rule: "Guard placement",
    passed: guardOk,
    detail: guardDetail,
  });

  // Rule 4: Boss/treasure depth (>= 3 edges from entry)
  const deepNodes = graph.nodes.filter(
    (n) => n.type === "faction-core" || n.type === "set-piece",
  );
  let depthOk = true;
  let depthDetail = "";
  if (deepNodes.length > 0 && entries.length > 0) {
    for (const deep of deepNodes) {
      let minDist = Infinity;
      for (const entry of entries) {
        const dists = bfsDistance(graph, entry.id);
        const d = dists.get(deep.id);
        if (d !== undefined && d < minDist) minDist = d;
      }
      if (minDist < 2) {
        depthOk = false;
        depthDetail = `${deep.id} (${deep.type}) is only ${minDist} edges from entry (need >= 2)`;
        break;
      }
    }
    if (depthOk) {
      depthDetail = `All high-value nodes at depth >= 2 from entry`;
    }
  } else {
    depthDetail = "No faction-core or set-piece nodes (OK)";
  }
  results.push({
    rule: "Boss/treasure depth",
    passed: depthOk,
    detail: depthDetail,
  });

  // Rule 5: Loop count (at least 1 per 6 nodes)
  const cycles = findCycleCount(graph);
  const requiredCycles = Math.max(1, Math.ceil(graph.nodes.length / 6));
  const loopOk = cycles >= requiredCycles;
  results.push({
    rule: "Loop count",
    passed: loopOk,
    detail: loopOk
      ? `${cycles} loops (need >= ${requiredCycles} for ${graph.nodes.length} nodes)`
      : `Only ${cycles} loops but need >= ${requiredCycles} for ${graph.nodes.length} nodes`,
  });

  // Rule 6: Two independent routes (entry to exit)
  let routeOk = true;
  let routeDetail = "";
  if (entries.length > 0 && exits.length > 0) {
    let bestPaths = -1;
    let bestPair = null;
    for (const entry of entries) {
      for (const exit of exits) {
        const paths = countEdgeDisjointPaths(graph, entry.id, exit.id);
        if (paths > bestPaths) {
          bestPaths = paths;
          bestPair = { entry: entry.id, exit: exit.id };
        }
      }
    }
    routeOk = bestPaths >= 2;
    routeDetail = routeOk
      ? `${bestPaths} independent routes from ${bestPair.entry} to ${bestPair.exit}`
      : `Only ${bestPaths} route from ${bestPair.entry} to ${bestPair.exit} (need >= 2)`;
  } else {
    routeOk = false;
    routeDetail = "Cannot check routes without entry and exit";
  }
  results.push({
    rule: "Two independent routes",
    passed: routeOk,
    detail: routeDetail,
  });

  // Rule 7: Dead end justification
  // Entry and exit nodes are inherently at the boundary and are exempt
  const justifiedTypes = new Set([
    "secret",
    "hazard",
    "set-piece",
    "entry",
    "exit",
  ]);
  let deadEndOk = true;
  let deadEndDetail = "";
  for (const node of graph.nodes) {
    const degree = nodeDegree(graph, node.id);
    if (degree === 1 && !justifiedTypes.has(node.type)) {
      // Check if the single edge is a secret type
      const edges = graph.adjacency.get(node.id) || [];
      const isSecretEdge = edges.some((e) => e.type === "secret");
      if (!isSecretEdge) {
        deadEndOk = false;
        deadEndDetail = `Node ${node.id} (${node.type}) is a dead end without justification (type should be secret, hazard, or set-piece)`;
        break;
      }
    }
  }
  if (deadEndOk) {
    deadEndDetail = "All dead ends justified";
  }
  results.push({
    rule: "Dead end justification",
    passed: deadEndOk,
    detail: deadEndDetail,
  });

  // Rule 8: One-way safety
  const oneWayEdges = graph.edges.filter((e) => e.type === "one-way");
  let oneWayOk = true;
  let oneWayDetail = "";
  if (oneWayEdges.length > 0) {
    for (const edge of oneWayEdges) {
      // Check that from the destination, there is a path to some exit
      const dists = bfsDistance(graph, edge.to);
      const canReachExit = exits.some((ex) => dists.has(ex.id));
      if (!canReachExit) {
        oneWayOk = false;
        oneWayDetail = `One-way edge ${edge.from}->${edge.to} strands players at ${edge.to} with no path to exit`;
        break;
      }
    }
    if (oneWayOk) {
      oneWayDetail = `All ${oneWayEdges.length} one-way routes have recoverable paths`;
    }
  } else {
    oneWayDetail = "No one-way edges";
  }
  results.push({
    rule: "One-way safety",
    passed: oneWayOk,
    detail: oneWayDetail,
  });

  return {
    valid: results.every((r) => r.passed),
    results,
  };
}

/**
 * Validate placed geometry against layout rules.
 *
 * @param {Object} geometry - Geometry with rooms and cells
 * @param {Object} graph - TopologyGraph
 * @param {Object[]} [connectors=[]] - Boundary connector definitions
 * @returns {{valid: boolean, results: {rule: string, passed: boolean, detail: string}[]}}
 */
function validateGeometry(geometry, graph, connectors) {
  connectors = Array.isArray(connectors) ? connectors : [];
  const results = [];

  // Rule 1: All rooms within grid bounds
  let boundsOk = true;
  let boundsDetail = "";
  for (const room of geometry.rooms) {
    if (
      room.x < 0 ||
      room.y < 0 ||
      room.x + room.w > geometry.width ||
      room.y + room.h > geometry.height
    ) {
      boundsOk = false;
      boundsDetail = `Room ${room.nodeId} at (${room.x},${room.y}) size ${room.w}x${room.h} exceeds grid ${geometry.width}x${geometry.height}`;
      break;
    }
  }
  if (boundsOk) boundsDetail = "All rooms within grid bounds";
  results.push({
    rule: "Rooms within bounds",
    passed: boundsOk,
    detail: boundsDetail,
  });

  // Rule 2: No room overlaps
  let overlapOk = true;
  let overlapDetail = "";
  for (let i = 0; i < geometry.rooms.length; i++) {
    for (let j = i + 1; j < geometry.rooms.length; j++) {
      const a = geometry.rooms[i];
      const b = geometry.rooms[j];
      if (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      ) {
        overlapOk = false;
        overlapDetail = `Rooms ${a.nodeId} and ${b.nodeId} overlap`;
        break;
      }
    }
    if (!overlapOk) break;
  }
  if (overlapOk) overlapDetail = "No room overlaps";
  results.push({
    rule: "No room overlaps",
    passed: overlapOk,
    detail: overlapDetail,
  });

  // Rule 3: All topology nodes have a placed room
  const placedIds = new Set(geometry.rooms.map((r) => r.nodeId));
  const missingNodes = graph.nodes.filter((n) => !placedIds.has(n.id));
  const allPlaced = missingNodes.length === 0;
  results.push({
    rule: "All nodes placed",
    passed: allPlaced,
    detail: allPlaced
      ? `All ${graph.nodes.length} nodes have placed rooms`
      : `Missing rooms for: ${missingNodes.map((n) => n.id).join(", ")}`,
  });

  // Rule 4: At least one large room
  const hasLarge = geometry.rooms.some((r) => r.sizeClass === "large");
  results.push({
    rule: "Large room exists",
    passed: hasLarge,
    detail: hasLarge
      ? "At least one large room present"
      : "No large rooms (need at least one for set-piece encounters)",
  });

  // Rule 5: All connectors are reachable from playable space
  let connectorsOk = true;
  let connectorsDetail = "";
  if (connectors.length > 0) {
    const roomCenters = new Set(
      geometry.rooms.map(
        (r) => `${Math.floor(r.y + r.h / 2)},${Math.floor(r.x + r.w / 2)}`,
      ),
    );
    const inBounds = (x, y) =>
      y >= 0 && y < geometry.height && x >= 0 && x < geometry.width;
    const isWalkable = (x, y) => geometry.cells[y][x] !== 0;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (let i = 0; i < connectors.length; i++) {
      const c = connectors[i];
      let sx = c.offset;
      let sy = 1;
      if (c.side === "bottom") sy = geometry.height - 2;
      else if (c.side === "left") {
        sx = 1;
        sy = c.offset;
      } else if (c.side === "right") {
        sx = geometry.width - 2;
        sy = c.offset;
      }
      sx = Math.max(0, Math.min(geometry.width - 1, Math.floor(sx || 0)));
      sy = Math.max(0, Math.min(geometry.height - 1, Math.floor(sy || 0)));

      if (!inBounds(sx, sy) || !isWalkable(sx, sy)) {
        connectorsOk = false;
        connectorsDetail = `Connector ${i + 1} (${c.side}@${c.offset}) has no walkable anchor`;
        break;
      }

      const queue = [[sx, sy]];
      const seen = new Set([`${sy},${sx}`]);
      let reachedRoom = false;

      while (queue.length > 0 && !reachedRoom) {
        const [x, y] = queue.shift();
        if (roomCenters.has(`${y},${x}`)) {
          reachedRoom = true;
          break;
        }
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          const key = `${ny},${nx}`;
          if (inBounds(nx, ny) && !seen.has(key) && isWalkable(nx, ny)) {
            seen.add(key);
            queue.push([nx, ny]);
          }
        }
      }

      if (!reachedRoom) {
        connectorsOk = false;
        connectorsDetail = `Connector ${i + 1} (${c.side}@${c.offset}) is not connected to any room`;
        break;
      }
    }

    if (connectorsOk) {
      connectorsDetail = `All ${connectors.length} connectors connect to playable space`;
    }
  } else {
    connectorsDetail = "No connectors defined";
  }

  results.push({
    rule: "Connectors connected",
    passed: connectorsOk,
    detail: connectorsDetail,
  });

  return {
    valid: results.every((r) => r.passed),
    results,
  };
}

module.exports = { validateTopology, validateGeometry };
