const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { renderPacket } = require("./packet");
const { buildGraph } = require("./topology");
const { buildIntent, createRng } = require("./intent");
const { layoutConstructed } = require("./geometry");
const { routeCorridors } = require("./corridors");
const { applyDressing } = require("./dressing");
const { validateTopology, validateGeometry } = require("./validate");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

function generateGatehouseArtifacts(seed) {
  const section = createGatehouseSection();
  const graph = buildGraph(section.nodes, section.edges);
  const intent = buildIntent(section);
  const rng = createRng(seed || 42);

  let geometry = layoutConstructed(
    graph,
    section.grid,
    section.density,
    section.connectors || [],
    10,
    rng,
  );
  geometry = routeCorridors(geometry, graph, rng, section.connectors || []);
  geometry = applyDressing(geometry, graph, rng);

  const topoValidation = validateTopology(graph, intent.grid);
  const geoValidation = validateGeometry(
    geometry,
    graph,
    section.connectors || [],
  );

  const validation = {
    valid: topoValidation.valid && geoValidation.valid,
    results: [...topoValidation.results, ...geoValidation.results],
  };

  return { geometry, graph, intent, validation };
}

describe("packet", () => {
  it("renders computed ecology instead of placeholders", () => {
    const { geometry, graph, intent, validation } =
      generateGatehouseArtifacts(42);

    const packet = renderPacket(geometry, graph, intent, validation);

    assert.ok(packet.includes("### Territory Zones"));
    assert.ok(packet.includes("| Perimeter |"));
    assert.ok(packet.includes("| Transit |"));
    assert.ok(packet.includes("| Core |"));
    assert.ok(packet.includes("| Hidden |"));
    assert.ok(packet.includes("| P1 |"), "Expected at least one patrol route");
    assert.ok(!packet.includes("to be defined"));
  });

  it("includes escalation clocks and sequence for dynamic behaviour", () => {
    const { geometry, graph, intent, validation } =
      generateGatehouseArtifacts(99);

    const packet = renderPacket(geometry, graph, intent, validation);

    assert.ok(packet.includes("## Dynamic Behaviour"));
    assert.ok(packet.includes("| Clock | Trigger | Effect | Reset |"));
    assert.ok(packet.includes("| Suspicion |"));
    assert.ok(packet.includes("| Alerted |"));
    assert.ok(packet.includes("| Committed |"));
    assert.ok(packet.includes("### Escalation Sequence"));
    assert.ok(packet.includes("1. Initial contact pressure follows"));
  });
});
