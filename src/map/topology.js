/**
 * Topology graph data structures and graph algorithms.
 * Layer 2 of the four-layer map system.
 *
 * @module map/topology
 */

const VALID_NODE_TYPES = [
  "entry",
  "exit",
  "hub",
  "guard",
  "faction-core",
  "resource",
  "hazard",
  "set-piece",
  "secret",
  "standard",
];

const VALID_EDGE_TYPES = [
  "open",
  "door",
  "locked",
  "secret",
  "one-way",
  "vertical",
  "off-map",
];

const VALID_WIDTH_CLASSES = ["tight", "standard", "wide"];

/**
 * Build a topology graph from node and edge arrays.
 * Constructs lookup maps for efficient graph traversal.
 *
 * @param {Object[]} nodes - Array of node definitions
 * @param {Object[]} edges - Array of edge definitions
 * @returns {Object} TopologyGraph with nodes, edges, nodeMap, adjacency
 */
function buildGraph(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("Topology must have at least one node");
  }
  if (!Array.isArray(edges)) {
    throw new Error("Edges must be an array");
  }

  // Validate nodes
  const nodeMap = new Map();
  for (const node of nodes) {
    if (!node.id || !node.type || !node.name) {
      throw new Error(
        `Node missing required fields (id, type, name): ${JSON.stringify(node)}`,
      );
    }
    if (!VALID_NODE_TYPES.includes(node.type)) {
      throw new Error(
        `Invalid node type "${node.type}" for node ${node.id}. Must be one of: ${VALID_NODE_TYPES.join(", ")}`,
      );
    }
    if (nodeMap.has(node.id)) {
      throw new Error(`Duplicate node ID: ${node.id}`);
    }
    nodeMap.set(node.id, {
      ...node,
      sizeClass: node.sizeClass || "medium",
      sightline: node.sightline || "open",
      retreatOptions: node.retreatOptions || [],
    });
  }

  // Validate edges
  for (const edge of edges) {
    if (!edge.from || !edge.to || !edge.type) {
      throw new Error(
        `Edge missing required fields (from, to, type): ${JSON.stringify(edge)}`,
      );
    }
    if (!nodeMap.has(edge.from)) {
      throw new Error(`Edge references unknown node: ${edge.from}`);
    }
    if (!nodeMap.has(edge.to)) {
      throw new Error(`Edge references unknown node: ${edge.to}`);
    }
    if (!VALID_EDGE_TYPES.includes(edge.type)) {
      throw new Error(
        `Invalid edge type "${edge.type}". Must be one of: ${VALID_EDGE_TYPES.join(", ")}`,
      );
    }
  }

  // Normalise edges
  const normEdges = edges.map((e) => ({
    from: e.from,
    to: e.to,
    type: e.type,
    bidirectional: e.bidirectional !== false,
    width: e.width || "standard",
    gate: e.gate || null,
    noise: e.noise || "normal",
  }));

  // Build adjacency list
  const adjacency = new Map();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of normEdges) {
    adjacency.get(edge.from).push(edge);
    if (edge.bidirectional) {
      adjacency.get(edge.to).push(edge);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: normEdges,
    nodeMap,
    adjacency,
  };
}

/**
 * BFS shortest distances from a start node.
 * Respects edge directionality.
 *
 * @param {Object} graph - TopologyGraph
 * @param {string} startId - Starting node ID
 * @returns {Map<string, number>} Map of nodeId to distance
 */
function bfsDistance(graph, startId) {
  const dist = new Map();
  const queue = [startId];
  dist.set(startId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    const d = dist.get(current);

    for (const edge of graph.adjacency.get(current) || []) {
      // Determine which direction we can traverse
      let neighbor = null;
      if (edge.from === current) {
        neighbor = edge.to;
      } else if (edge.bidirectional && edge.to === current) {
        neighbor = edge.from;
      }

      if (neighbor && !dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }

  return dist;
}

/**
 * Count edge-disjoint paths between source and sink using Edmonds-Karp.
 * Each edge has capacity 1.
 *
 * @param {Object} graph - TopologyGraph
 * @param {string} sourceId - Source node ID
 * @param {string} sinkId - Sink node ID
 * @returns {number} Number of edge-disjoint paths
 */
function countEdgeDisjointPaths(graph, sourceId, sinkId) {
  if (sourceId === sinkId) return 0;

  let flow = 0;
  const used = new Set();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // BFS for augmenting path
    const parent = new Map();
    const parentEdge = new Map();
    const queue = [sourceId];
    parent.set(sourceId, null);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === sinkId) break;

      for (let i = 0; i < graph.edges.length; i++) {
        if (used.has(i)) continue;
        const edge = graph.edges[i];
        let neighbor = null;
        if (edge.from === current) {
          neighbor = edge.to;
        } else if (edge.bidirectional && edge.to === current) {
          neighbor = edge.from;
        }
        if (neighbor && !parent.has(neighbor)) {
          parent.set(neighbor, current);
          parentEdge.set(neighbor, i);
          queue.push(neighbor);
        }
      }
    }

    if (!parent.has(sinkId)) break;

    // Mark edges along the path as used
    let node = sinkId;
    while (node !== sourceId) {
      used.add(parentEdge.get(node));
      node = parent.get(node);
    }
    flow++;
  }

  return flow;
}

/**
 * Count independent cycles in the graph.
 * For an undirected graph: cycles = E - V + C
 * where C is the number of connected components.
 *
 * @param {Object} graph - TopologyGraph
 * @returns {number} Number of independent cycles
 */
function findCycleCount(graph) {
  // Count connected components via BFS
  const visited = new Set();
  let components = 0;

  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    components++;
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const edge of graph.adjacency.get(current) || []) {
        let neighbor = null;
        if (edge.from === current) neighbor = edge.to;
        else if (edge.bidirectional && edge.to === current)
          neighbor = edge.from;
        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  // Count undirected edges (each bidirectional edge counts once)
  const edgeCount = graph.edges.length;
  const nodeCount = graph.nodes.length;

  return edgeCount - nodeCount + components;
}

/**
 * Get the degree (number of edges) for a node.
 *
 * @param {Object} graph - TopologyGraph
 * @param {string} nodeId - Node ID
 * @returns {number} Number of connected edges
 */
function nodeDegree(graph, nodeId) {
  const edges = graph.adjacency.get(nodeId) || [];
  // Deduplicate: an edge may appear in adjacency for both from and to
  const seen = new Set();
  let degree = 0;
  for (const edge of edges) {
    const key = `${edge.from}-${edge.to}-${edge.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      degree++;
    }
  }
  return degree;
}

module.exports = {
  buildGraph,
  bfsDistance,
  countEdgeDisjointPaths,
  findCycleCount,
  nodeDegree,
  VALID_NODE_TYPES,
  VALID_EDGE_TYPES,
  VALID_WIDTH_CLASSES,
};
