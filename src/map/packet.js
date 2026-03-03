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

  // 1. Section Metadata
  sections.push(renderMetadata(intent));

  // 2. Tactical Footprint
  sections.push(renderFootprint(geometry, intent));

  // 3. Topology Summary
  sections.push(renderTopologySummary(graph));

  // 4. Section Map
  sections.push(renderMapSection(asciiMap, svgFilename, intent));

  // 5. Room Key
  sections.push(renderRoomKey(geometry, graph));

  // 6. Transition Connectors
  sections.push(renderConnectors(intent));

  // 7. Encounter Ecology (placeholder)
  sections.push(renderEcology());

  // 8. Dynamic Behaviour (placeholder)
  sections.push(renderDynamicBehaviour());

  // 9. Validation Checklist
  sections.push(renderValidation(validationResult));

  // 10. DM Quick-Run Notes
  sections.push(renderDmNotes(graph, intent));

  return sections.join("\n\n");
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

function renderMapSection(asciiMap, svgFilename, intent) {
  const lines = [`## Section Map`];

  if (svgFilename) {
    lines.push("");
    lines.push(`![${intent.theme} Map](${svgFilename})`);
  }

  lines.push("");
  lines.push("```text");
  lines.push(asciiMap);
  lines.push("```");

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

function renderEcology() {
  return [
    `## Encounter Ecology`,
    "",
    "Territory zones, patrol routes, and creature behaviour to be defined.",
    "",
    "### Territory Zones",
    "",
    "| Zone | Rooms | Description |",
    "| --- | --- | --- |",
    "| Core | - | - |",
    "| Buffer | - | - |",
    "| Transit | - | - |",
    "",
    "### Patrols",
    "",
    "| Patrol | Owner | Route | Interval | Triggers | Fallback |",
    "| --- | --- | --- | --- | --- | --- |",
    "| - | - | - | - | - | - |",
  ].join("\n");
}

function renderDynamicBehaviour() {
  return [
    `## Dynamic Behaviour`,
    "",
    "Timers, triggered events, and escalation sequences to be defined.",
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
