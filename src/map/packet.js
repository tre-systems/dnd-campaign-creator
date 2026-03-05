/**
 * Section packet markdown generator.
 * Produces structured markdown section specification packets.
 *
 * @module map/packet
 */

const { roomLabelFromIndex } = require("./room-label");

/**
 * Render a complete section specification packet as markdown.
 *
 * @param {Object} geometry - Geometry with rooms and corridors
 * @param {Object} graph - TopologyGraph
 * @param {Object} intent - Section intent
 * @param {string} asciiMap - ASCII map string
 * @param {string} [svgFilename] - SVG filename for image reference
 * @param {{valid: boolean, results: Object[]}} [validationResult] - Validation results
 * @returns {string} Markdown section packet
 */
function renderPacket(
  geometry,
  graph,
  intent,
  asciiMap,
  svgFilename,
  validationResult,
) {
  const sections = [];

  // 0. AI Generation Prompt
  sections.push(renderPromptInstructions(geometry, graph, intent));

  // 1. Section Metadata
  sections.push(renderMetadata(intent));

  // 2. Tactical Footprint
  sections.push(renderFootprint(geometry, intent));

  // 3. Topology Summary
  sections.push(renderTopologySummary(graph));

  // 4. Spatial Layout (Technical Reference)
  sections.push(renderSpatialData(geometry));

  // 5. Room Key
  sections.push(renderRoomKey(geometry, graph));

  // 6. Transition Connectors
  sections.push(renderConnectors(intent));

  // 7. Encounter Ecology
  sections.push(renderEcology(geometry, graph, intent));

  // 8. Dynamic Behaviour
  sections.push(renderDynamicBehaviour(geometry, graph, intent));

  // 9. Validation Checklist
  sections.push(renderValidation(validationResult));

  // 10. DM Quick-Run Notes
  sections.push(renderDmNotes(graph, intent));

  return sections.join("\n\n");
}

function renderPromptInstructions(geometry, graph, intent) {
  const labels = buildRoomLabelLookup(geometry);
  const roomDescriptions = geometry.rooms.map((room) => {
    const label = labels.get(room.nodeId);
    return `- **Room ${label} (${room.nodeName})**: Located at (${room.x}, ${room.y}), size ${room.w}x${room.h}. Shape: ${room.shape}. Type: ${room.nodeType}.`;
  });

  return [
    `# Map Generation Prompt for Nanobanna 2`,
    ``,
    `**Instructions for AI:**`,
    `You are an expert fantasy cartographer. I need you to draw a D&D dungeon map in the attached "Paratime/TSR blue" reference style.`,
    `Use the exact structural and thematic information provided below.`,
    ``,
    `- **Theme**: ${intent.theme}`,
    `- **Grid Size**: ${geometry.width} x ${geometry.height} (1 unit = 5 feet)`,
    `- **Style**: Blue-hued background, solid white floors, textured "rock" borders containing parallel hatching and stippling. Clean, hand-drafted straight lines.`,
    `- **Content**: Top-down 2D view. Use standard old-school map symbols (doors, stairs, pillars). Include room numbers from the Room Key.`,
    `- **Grid**: Overlay a subtle square grid over the walkable floor areas.`,
    ``,
    `### Room Layout Details`,
    ...roomDescriptions,
    ``,
    `### Corridor and Connector Routing`,
    `The rooms are connected by a network of corridors. Follow the topology graph and spatial data provided in the Technical Reference section below to ensure accurate placement of doors and passages.`,
    ``,
    `Please generate the map image directly matching these specifications.`
  ].join("\n");
}

function renderMetadata(intent) {
  return [
    `# ${intent.theme}`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Section ID | ${intent.id} |`,
    `| Level | ${intent.level} |`,
    `| Chapter | ${intent.chapter || "-"} |`,
    `| Pressure | ${intent.pressure} |`,
    `| Session Load | ${intent.sessionLoad} |`,
    `| Layout Strategy | ${intent.layoutStrategy} |`,
    "",
    `**Promise:** ${intent.promise}`,
  ].join("\n");
}

function renderFootprint(geometry, intent) {
  const totalCells = geometry.width * geometry.height;
  let floorCells = 0;
  for (let y = 0; y < geometry.height; y++) {
    for (let x = 0; x < geometry.width; x++) {
      if (geometry.cells[y][x] !== 0) floorCells++;
    }
  }
  const density = ((floorCells / totalCells) * 100).toFixed(0);

  return [
    `## Tactical Footprint`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Dimensions | ${geometry.width} x ${geometry.height} |`,
    `| Density | ${density}% floor coverage (${intent.density}) |`,
    `| Rooms | ${geometry.rooms.length} |`,
    `| Corridors | ${geometry.corridors.length} |`,
  ].join("\n");
}

function renderTopologySummary(graph) {
  const lines = [
    `## Topology`,
    "",
    `### Node Inventory`,
    "",
    `| Node | Type | Name | Occupants | Size |`,
    `| --- | --- | --- | --- | --- |`,
  ];

  for (const node of graph.nodes) {
    lines.push(
      `| ${node.id} | ${node.type} | ${node.name} | ${node.occupants || "-"} | ${node.sizeClass} |`,
    );
  }

  lines.push("");
  lines.push(`### Connections`);
  lines.push("");
  lines.push(`| From | To | Type | Bidir | Width |`);
  lines.push(`| --- | --- | --- | --- | --- |`);

  for (const edge of graph.edges) {
    lines.push(
      `| ${edge.from} | ${edge.to} | ${edge.type} | ${edge.bidirectional ? "Y" : "N"} | ${edge.width} |`,
    );
  }

  return lines.join("\n");
}

function renderSpatialData(geometry) {
  const lines = [
    `## Spatial Layout (Technical Reference)`,
    "",
    "### Room Placement",
    "",
    "| Room | X | Y | W | H | Shape |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (let i = 0; i < geometry.rooms.length; i++) {
    const room = geometry.rooms[i];
    const label = roomLabelFromIndex(i);
    lines.push(
      `| ${label} | ${room.x} | ${room.y} | ${room.w} | ${room.h} | ${room.shape} |`,
    );
  }

  lines.push("");
  lines.push("### Corridor Paths");
  lines.push("");
  lines.push("| Edge | Path (X,Y Coordinates) |");
  lines.push("| --- | --- |");

  if (geometry.corridors && geometry.corridors.length > 0) {
    for (const corridor of geometry.corridors) {
      if (!corridor.path) continue;
      const pathStr = corridor.path.map((p) => `(${p.x},${p.y})`).join(" -> ");
      lines.push(`| ${corridor.from} to ${corridor.to} | ${pathStr} |`);
    }
  } else {
    lines.push("| (None generated) | - |");
  }

  return lines.join("\n");
}

function renderRoomKey(geometry, graph) {
  const lines = [`## Room Key`, ""];

  for (let i = 0; i < geometry.rooms.length; i++) {
    const room = geometry.rooms[i];
    const node = graph.nodeMap.get(room.nodeId);
    const num = roomLabelFromIndex(i);

    lines.push(
      `**${num}. ${node ? node.name : room.nodeId}** (${room.w}x${room.h}, ${room.sizeClass})`,
    );
    if (node) {
      if (node.occupants) lines.push(`- Occupants: ${node.occupants}`);
      lines.push(`- Type: ${node.type}`);
      lines.push(`- Sightline: ${node.sightline}`);
      if (node.retreatOptions && node.retreatOptions.length > 0) {
        lines.push(`- Retreat: ${node.retreatOptions.join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderConnectors(intent) {
  const lines = [`## Transition Connectors`, ""];

  if (intent._connectors && intent._connectors.length > 0) {
    lines.push(`| Connector | Side | Offset | Width | Type | Destination |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (let i = 0; i < intent._connectors.length; i++) {
      const c = intent._connectors[i];
      lines.push(
        `| C${i + 1} | ${c.side} | ${c.offset} | ${c.width} | ${c.transitionType} | ${c.destination} |`,
      );
    }
  } else {
    lines.push("No external connectors defined.");
  }

  return lines.join("\n");
}

function buildRoomLabelLookup(geometry) {
  const labels = new Map();
  for (let i = 0; i < geometry.rooms.length; i++) {
    labels.set(geometry.rooms[i].nodeId, roomLabelFromIndex(i));
  }
  return labels;
}

function buildUndirectedAdjacency(graph) {
  const adjacency = new Map();
  for (const node of graph.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  return adjacency;
}

function bfsDistances(adjacency, startId) {
  const dist = new Map();
  if (!startId || !adjacency.has(startId)) return dist;
  const queue = [startId];
  dist.set(startId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDist = dist.get(current);
    for (const next of adjacency.get(current) || []) {
      if (!dist.has(next)) {
        dist.set(next, currentDist + 1);
        queue.push(next);
      }
    }
  }

  return dist;
}

function shortestPathToAny(adjacency, startId, targetIds) {
  if (!startId || !adjacency.has(startId)) return null;
  if (targetIds.has(startId)) return [startId];

  const queue = [startId];
  const parent = new Map();
  parent.set(startId, null);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      if (targetIds.has(next)) {
        const path = [];
        let step = next;
        while (step) {
          path.push(step);
          step = parent.get(step);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }

  return null;
}

function classifyZones(graph, geometry) {
  const labels = buildRoomLabelLookup(geometry);
  const adjacency = buildUndirectedAdjacency(graph);
  const entries = graph.nodes.filter((n) => n.type === "entry");
  const primaryEntryId = entries[0] ? entries[0].id : graph.nodes[0]?.id;
  const dist = bfsDistances(adjacency, primaryEntryId);
  const reachableDepths = Array.from(dist.values());
  const maxDepth =
    reachableDepths.length > 0 ? Math.max(...reachableDepths) : 0;
  const coreThreshold = Math.max(2, maxDepth - 1);

  const zones = {
    Perimeter: [],
    Transit: [],
    Core: [],
    Hidden: [],
  };

  for (const node of graph.nodes) {
    const d = dist.has(node.id) ? dist.get(node.id) : maxDepth + 1;
    let zone = "Transit";
    if (node.type === "secret") {
      zone = "Hidden";
    } else if (node.type === "entry" || node.type === "guard" || d <= 1) {
      zone = "Perimeter";
    } else if (
      node.type === "faction-core" ||
      node.type === "set-piece" ||
      d >= coreThreshold
    ) {
      zone = "Core";
    }
    zones[zone].push(node);
  }

  return {
    labels,
    adjacency,
    zones,
    primaryEntryId,
  };
}

function zoneControlSummary(nodes) {
  if (nodes.some((n) => n.type === "faction-core"))
    return "Primary faction hold";
  if (nodes.some((n) => n.type === "guard")) return "Sentry-controlled";
  if (nodes.some((n) => n.occupants)) return "Occupied service spaces";
  if (nodes.some((n) => n.type === "secret")) return "Low traffic / hidden use";
  return "Lightly held";
}

function zoneRoomSummary(nodes, labels) {
  if (nodes.length === 0) return "-";
  return nodes
    .map((node) => `${labels.get(node.id) || node.id} (${node.name})`)
    .join("; ");
}

function pressureTrigger(intent) {
  switch (intent.pressure) {
    case "faction":
      return "Missing sentry, alarm gong, or blocked route";
    case "pursuit":
      return "Footsteps, open doors, or light sources";
    case "hazard":
      return "Trap trigger or environmental collapse";
    case "puzzle":
      return "Tampered mechanism or wrong solve state";
    case "boss":
      return "Core chamber disturbance";
    default:
      return "Any hostile contact";
  }
}

function patrolInterval(intent) {
  switch (intent.sessionLoad) {
    case "light":
      return "20 min";
    case "heavy":
      return "10 min";
    default:
      return "15 min";
  }
}

function buildPatrols(graph, zonesData, intent) {
  const { zones, labels, adjacency, primaryEntryId } = zonesData;
  const trigger = pressureTrigger(intent);
  const interval = patrolInterval(intent);
  const coreTargets = new Set(zones.Core.map((n) => n.id));
  const entryTargets = new Set(
    graph.nodes.filter((n) => n.type === "entry").map((n) => n.id),
  );

  const owners = graph.nodes.filter(
    (n) => n.type === "guard" || n.type === "hub" || n.type === "faction-core",
  );
  const candidates = owners.length > 0 ? owners : graph.nodes.slice(0, 1);
  const patrols = [];

  for (let i = 0; i < candidates.length && patrols.length < 3; i++) {
    const owner = candidates[i];
    const targetSet = new Set(coreTargets);
    targetSet.delete(owner.id);
    if (targetSet.size === 0 && primaryEntryId) targetSet.add(primaryEntryId);

    let routePath = shortestPathToAny(adjacency, owner.id, targetSet);
    if (!routePath || routePath.length < 2) {
      routePath = shortestPathToAny(adjacency, owner.id, entryTargets);
    }
    if (!routePath || routePath.length < 2) {
      routePath = [owner.id];
    }

    const fallbackId =
      (
        zones.Core.find((n) => n.id !== owner.id) ||
        zones.Transit[0] ||
        zones.Perimeter[0] ||
        zones.Hidden[0]
      )?.id || owner.id;

    patrols.push({
      id: `P${patrols.length + 1}`,
      owner: `${labels.get(owner.id) || owner.id} (${owner.name})`,
      route: routePath.map((id) => labels.get(id) || id).join(" -> "),
      interval,
      triggers: trigger,
      fallback: labels.get(fallbackId) || fallbackId,
    });
  }

  return patrols;
}

function renderEcology(geometry, graph, intent) {
  const zonesData = classifyZones(graph, geometry);
  const { zones, labels } = zonesData;
  const patrols = buildPatrols(graph, zonesData, intent);
  const zoneDescriptions = {
    Perimeter: "First-contact ring. Delay intruders and raise alarms.",
    Transit: "Circulation band linking wings and support rooms.",
    Core: "Command/treasure depth where defenders concentrate.",
    Hidden: "Irregular spaces outside routine movement.",
  };
  const zoneResponses = {
    Perimeter: "Delay and signal.",
    Transit: "Screen and fall back to chokepoints.",
    Core: "Hold position and counterattack.",
    Hidden: "Ambush or opportunistic withdrawal.",
  };

  return [
    `## Encounter Ecology`,
    "",
    "Territory and patrol model derived from topology depth, room role, and section pressure.",
    "",
    "### Territory Zones",
    "",
    "| Zone | Rooms | Description | Control | Response |",
    "| --- | --- | --- | --- | --- |",
    `| Perimeter | ${zoneRoomSummary(zones.Perimeter, labels)} | ${zoneDescriptions.Perimeter} | ${zoneControlSummary(zones.Perimeter)} | ${zoneResponses.Perimeter} |`,
    `| Transit | ${zoneRoomSummary(zones.Transit, labels)} | ${zoneDescriptions.Transit} | ${zoneControlSummary(zones.Transit)} | ${zoneResponses.Transit} |`,
    `| Core | ${zoneRoomSummary(zones.Core, labels)} | ${zoneDescriptions.Core} | ${zoneControlSummary(zones.Core)} | ${zoneResponses.Core} |`,
    `| Hidden | ${zoneRoomSummary(zones.Hidden, labels)} | ${zoneDescriptions.Hidden} | ${zoneControlSummary(zones.Hidden)} | ${zoneResponses.Hidden} |`,
    "",
    "### Patrols",
    "",
    "| Patrol | Owner | Route | Interval | Triggers | Fallback |",
    "| --- | --- | --- | --- | --- | --- |",
    ...patrols.map(
      (patrol) =>
        `| ${patrol.id} | ${patrol.owner} | ${patrol.route} | ${patrol.interval} | ${patrol.triggers} | ${patrol.fallback} |`,
    ),
  ].join("\n");
}

function renderDynamicBehaviour(geometry, graph, intent) {
  const zonesData = classifyZones(graph, geometry);
  const patrols = buildPatrols(graph, zonesData, intent);
  const patrolRoute = patrols[0] ? patrols[0].route : "nearest connected rooms";
  const perimeterRooms = zoneRoomSummary(
    zonesData.zones.Perimeter,
    zonesData.labels,
  );
  const transitRooms = zoneRoomSummary(
    zonesData.zones.Transit,
    zonesData.labels,
  );
  const coreRooms = zoneRoomSummary(zonesData.zones.Core, zonesData.labels);

  return [
    `## Dynamic Behaviour`,
    "",
    "Escalation clocks and reactive movement generated from section pressure and patrol ownership.",
    "",
    "| Clock | Trigger | Effect | Reset |",
    "| --- | --- | --- | --- |",
    `| Suspicion | Disturbance in ${perimeterRooms} | Patrol ${patrols[0] ? patrols[0].id : "P1"} re-runs route (${patrolRoute}) with no detours. | 20 minutes with no new signs |`,
    `| Alerted | Combat/noise in ${transitRooms} | Reinforcements move to nearest chokepoint and lock contested doors. | 45 minutes with no contact |`,
    `| Committed | Core threatened (${coreRooms}) | Defenders abandon perimeter and concentrate on core defence or evacuation path. | End of scene / regroup outside section |`,
    "",
    "### Escalation Sequence",
    "",
    `1. Initial contact pressure follows **${intent.pressure}** cues and starts at perimeter routes.`,
    `2. Patrol cadence is **${patrolInterval(intent)}**; skipped check-ins immediately escalate one clock step.`,
    "3. Once committed, defenders preserve one fallback route and deny all secondary routes until reset.",
  ].join("\n");
}

function renderValidation(validationResult) {
  const lines = [`## Validation Checklist`, ""];

  if (validationResult && validationResult.results) {
    for (const r of validationResult.results) {
      lines.push(`- [${r.passed ? "x" : " "}] ${r.rule}: ${r.detail}`);
    }
  } else {
    lines.push("Validation not yet run.");
  }

  return lines.join("\n");
}

function renderDmNotes(graph, intent) {
  const entries = graph.nodes.filter((n) => n.type === "entry");
  const exits = graph.nodes.filter((n) => n.type === "exit");
  const hubs = graph.nodes.filter((n) => n.type === "hub");

  const lines = [
    `## DM Quick-Run Notes`,
    "",
    `**Theme:** ${intent.theme}`,
    `**Promise:** ${intent.promise}`,
    "",
    `**Entry points:** ${entries.map((n) => `${n.id} (${n.name})`).join(", ") || "None defined"}`,
    `**Exit points:** ${exits.map((n) => `${n.id} (${n.name})`).join(", ") || "None defined"}`,
    `**Hub rooms:** ${hubs.map((n) => `${n.id} (${n.name})`).join(", ") || "None"}`,
    "",
    "### Key Decision Points",
    "",
  ];

  for (const hub of hubs) {
    const edges = graph.adjacency.get(hub.id) || [];
    const connections = edges.map((e) => {
      const target = e.from === hub.id ? e.to : e.from;
      return `${target} (${e.type})`;
    });
    lines.push(`- **${hub.name}:** connects to ${connections.join(", ")}`);
  }

  return lines.join("\n");
}

module.exports = { renderPacket };
