const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  renderSvg,
  computeWallSegments,
  mergeCollinearSegments,
  renderFeatureSymbol,
  escapeXml,
} = require("./render-svg");
const { CELL, layoutConstructed, createGrid } = require("./geometry");
const { routeCorridors } = require("./corridors");
const { buildGraph } = require("./topology");
const { buildIntent, createRng } = require("./intent");
const { createGatehouseSection } = require("./fixtures/gatehouse-ruin");

describe("render-svg", () => {
  describe("escapeXml", () => {
    it("escapes ampersand", () => {
      assert.equal(escapeXml("A & B"), "A &amp; B");
    });

    it("escapes angle brackets", () => {
      assert.equal(escapeXml("<tag>"), "&lt;tag&gt;");
    });

    it("escapes quotes", () => {
      assert.equal(escapeXml('say "hello"'), "say &quot;hello&quot;");
    });

    it("handles plain text unchanged", () => {
      assert.equal(escapeXml("hello world"), "hello world");
    });
  });

  describe("computeWallSegments", () => {
    it("finds wall segments around a single room", () => {
      const cells = createGrid(6, 6);
      for (let y = 1; y < 5; y++)
        for (let x = 1; x < 5; x++) cells[y][x] = CELL.FLOOR;
      const segments = computeWallSegments(cells, 6, 6);
      assert.ok(segments.length > 0, "Should find wall segments");
      // A 4x4 room should have 4 wall sides after merging
      const horizontal = segments.filter((s) => s.direction === "horizontal");
      const vertical = segments.filter((s) => s.direction === "vertical");
      assert.ok(horizontal.length >= 2, "Should have top and bottom walls");
      assert.ok(vertical.length >= 2, "Should have left and right walls");
    });

    it("merges collinear segments", () => {
      // Two adjacent floor cells should produce merged walls
      const cells = createGrid(5, 3);
      cells[1][1] = CELL.FLOOR;
      cells[1][2] = CELL.FLOOR;
      cells[1][3] = CELL.FLOOR;
      const segments = computeWallSegments(cells, 5, 3);
      // Top wall should be one merged segment from x=1 to x=4
      const topWalls = segments.filter(
        (s) => s.direction === "horizontal" && s.y1 === 1,
      );
      assert.equal(topWalls.length, 1, "Top wall should be merged into one");
      assert.equal(topWalls[0].x1, 1);
      assert.equal(topWalls[0].x2, 4);
    });
  });

  describe("mergeCollinearSegments", () => {
    it("merges adjacent horizontal segments", () => {
      const segments = [
        { x1: 0, y1: 0, x2: 1, y2: 0, direction: "horizontal" },
        { x1: 1, y1: 0, x2: 2, y2: 0, direction: "horizontal" },
        { x1: 2, y1: 0, x2: 3, y2: 0, direction: "horizontal" },
      ];
      const merged = mergeCollinearSegments(segments);
      assert.equal(merged.length, 1, "Should merge into single segment");
      assert.equal(merged[0].x1, 0);
      assert.equal(merged[0].x2, 3);
    });

    it("keeps non-adjacent segments separate", () => {
      const segments = [
        { x1: 0, y1: 0, x2: 1, y2: 0, direction: "horizontal" },
        { x1: 3, y1: 0, x2: 4, y2: 0, direction: "horizontal" },
      ];
      const merged = mergeCollinearSegments(segments);
      assert.equal(merged.length, 2);
    });

    it("merges adjacent vertical segments", () => {
      const segments = [
        { x1: 0, y1: 0, x2: 0, y2: 1, direction: "vertical" },
        { x1: 0, y1: 1, x2: 0, y2: 2, direction: "vertical" },
      ];
      const merged = mergeCollinearSegments(segments);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].y1, 0);
      assert.equal(merged[0].y2, 2);
    });
  });

  describe("renderFeatureSymbol", () => {
    it("renders door as rect", () => {
      const svg = renderFeatureSymbol(CELL.DOOR, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Door should be a rect");
      assert.ok(svg.includes('class="door"'), "Should have door class");
    });

    it("renders door with orientation-aware geometry", () => {
      const horizontal = renderFeatureSymbol(CELL.DOOR, 0, 0, 20, "horizontal");
      const vertical = renderFeatureSymbol(CELL.DOOR, 0, 0, 20, "vertical");
      assert.notEqual(
        horizontal,
        vertical,
        "Door symbol should differ by orientation",
      );
      assert.ok(horizontal.includes('class="door"'));
      assert.ok(vertical.includes('class="door"'));
    });

    it("renders locked door with lock indicator", () => {
      const svg = renderFeatureSymbol(CELL.DOOR_LOCKED, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Locked door should have a rect");
      assert.ok(svg.includes("<circle"), "Locked door should have lock circle");
      assert.ok(
        svg.includes("door-tick"),
        "Locked door should have hinge tick",
      );
    });

    it("renders secret door with dashed line", () => {
      const svg = renderFeatureSymbol(CELL.DOOR_SECRET, 0, 0, 20);
      assert.ok(svg.includes("<line"), "Secret door should have a line");
      assert.ok(svg.includes("S"), "Secret door should have S label");
      assert.ok(
        svg.includes("secret-box"),
        "Secret door should have boxed marker",
      );
      assert.ok(
        svg.includes("door-secret-tick"),
        "Secret door should have terminal ticks",
      );
    });

    it("renders stairs down with arrow", () => {
      const svg = renderFeatureSymbol(CELL.STAIRS_DOWN, 0, 0, 20);
      assert.ok(svg.includes("<line"), "Stairs should have lines");
      assert.ok(svg.includes("<polygon"), "Stairs should have arrow");
      const treadCount = (svg.match(/class="stairs"/g) || []).length;
      assert.ok(treadCount >= 4, "Stairs should have multiple treads");
    });

    it("renders pillar as circle", () => {
      const svg = renderFeatureSymbol(CELL.PILLAR, 0, 0, 20);
      assert.ok(svg.includes("<circle"), "Pillar should be a circle");
      assert.ok(svg.includes('class="pillar"'), "Should have pillar class");
    });

    it("renders trap as X", () => {
      const svg = renderFeatureSymbol(CELL.TRAP, 0, 0, 20);
      assert.ok(svg.includes("<line"), "Trap should have lines");
      assert.ok(svg.includes('class="trap"'), "Should have trap class");
    });

    it("renders water as filled rect", () => {
      const svg = renderFeatureSymbol(CELL.WATER, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Water should be a rect");
      assert.ok(svg.includes('class="water"'), "Should have water class");
    });

    it("renders treasure as diamond", () => {
      const svg = renderFeatureSymbol(CELL.TREASURE, 0, 0, 20);
      assert.ok(svg.includes("<polygon"), "Treasure should be polygon");
      assert.ok(svg.includes('class="treasure"'), "Should have treasure class");
    });

    it("returns empty string for wall", () => {
      const svg = renderFeatureSymbol(CELL.WALL, 0, 0, 20);
      assert.equal(svg, "");
    });

    // Traditional dungeon dressing symbols
    it("renders portcullis with bars", () => {
      const svg = renderFeatureSymbol(CELL.PORTCULLIS, 0, 0, 20);
      assert.ok(svg.includes("<line"), "Portcullis should have lines");
      assert.ok(
        svg.includes('class="portcullis"'),
        "Should have portcullis class",
      );
    });

    it("renders archway with curve", () => {
      const svg = renderFeatureSymbol(CELL.ARCHWAY, 0, 0, 20);
      assert.ok(svg.includes("<path"), "Archway should have a path");
      assert.ok(svg.includes('class="archway"'), "Should have archway class");
    });

    it("renders curtain with wavy line", () => {
      const svg = renderFeatureSymbol(CELL.CURTAIN, 0, 0, 20);
      assert.ok(svg.includes("<path"), "Curtain should have a path");
      assert.ok(svg.includes('class="curtain"'), "Should have curtain class");
    });

    it("renders statue on base", () => {
      const svg = renderFeatureSymbol(CELL.STATUE, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Statue should have base rect");
      assert.ok(svg.includes("<circle"), "Statue should have circle");
      assert.ok(svg.includes('class="statue"'), "Should have statue class");
    });

    it("renders altar with cross", () => {
      const svg = renderFeatureSymbol(CELL.ALTAR, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Altar should have rect");
      assert.ok(svg.includes('class="altar"'), "Should have altar class");
    });

    it("renders well as concentric circles", () => {
      const svg = renderFeatureSymbol(CELL.WELL, 0, 0, 20);
      assert.ok(svg.includes("<circle"), "Well should have circles");
      assert.ok(
        svg.includes('class="well-outer"'),
        "Should have well-outer class",
      );
    });

    it("renders fountain with jets", () => {
      const svg = renderFeatureSymbol(CELL.FOUNTAIN, 0, 0, 20);
      assert.ok(svg.includes("<circle"), "Fountain should have circles");
      assert.ok(
        svg.includes('class="fountain-jet"'),
        "Should have fountain-jet class",
      );
    });

    it("renders firepit with flames", () => {
      const svg = renderFeatureSymbol(CELL.FIREPIT, 0, 0, 20);
      assert.ok(svg.includes("<circle"), "Firepit should have circle");
      assert.ok(
        svg.includes('class="firepit-flame"'),
        "Should have flame class",
      );
    });

    it("renders throne", () => {
      const svg = renderFeatureSymbol(CELL.THRONE, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Throne should have rect");
      assert.ok(svg.includes('class="throne"'), "Should have throne class");
    });

    it("renders sarcophagus", () => {
      const svg = renderFeatureSymbol(CELL.SARCOPHAGUS, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Sarcophagus should have rect");
      assert.ok(
        svg.includes('class="sarcophagus"'),
        "Should have sarcophagus class",
      );
    });

    it("renders iron bars", () => {
      const svg = renderFeatureSymbol(CELL.BARS, 0, 0, 20);
      assert.ok(svg.includes("<line"), "Bars should have lines");
      assert.ok(svg.includes('class="bars"'), "Should have bars class");
    });

    it("renders pit with cross-hatch", () => {
      const svg = renderFeatureSymbol(CELL.PIT, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Pit should have rect");
      assert.ok(svg.includes('class="pit"'), "Should have pit class");
    });

    it("renders lever mechanism", () => {
      const svg = renderFeatureSymbol(CELL.LEVER, 0, 0, 20);
      assert.ok(svg.includes("<circle"), "Lever should have circles");
      assert.ok(
        svg.includes('class="lever-arm"'),
        "Should have lever-arm class",
      );
    });

    it("renders double door", () => {
      const svg = renderFeatureSymbol(CELL.DOUBLE_DOOR, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Double door should have rects");
      assert.ok(svg.includes('class="door"'), "Should have door class");
    });

    it("renders collapsed passage", () => {
      const svg = renderFeatureSymbol(CELL.COLLAPSED, 0, 0, 20);
      assert.ok(svg.includes("<rect"), "Collapsed should have rect");
      assert.ok(
        svg.includes('class="collapsed"'),
        "Should have collapsed class",
      );
    });
  });

  describe("renderSvg", () => {
    /**
     * Helper: generate a full geometry + graph for the gatehouse.
     */
    function generateGatehouseMap(seed) {
      const section = createGatehouseSection();
      const graph = buildGraph(section.nodes, section.edges);
      const intent = buildIntent(section);
      const rng = createRng(seed || 42);
      let geometry = layoutConstructed(
        graph,
        section.grid,
        section.density,
        section.connectors,
        10,
        rng,
      );
      geometry = routeCorridors(geometry, graph, rng);
      return { geometry, graph, intent };
    }

    it("produces valid SVG with correct dimensions", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { cellSize: 20 });
      assert.ok(svg.startsWith("<svg"), "Should start with <svg");
      assert.ok(svg.endsWith("</svg>"), "Should end with </svg>");
      assert.ok(
        svg.includes(`width="${geometry.width * 20}"`),
        "SVG width should match",
      );
      // Height includes legend area, so it should be >= grid height
      const heightMatch = svg.match(/height="(\d+)"/);
      assert.ok(heightMatch, "SVG should have height attribute");
      assert.ok(
        parseInt(heightMatch[1]) >= geometry.height * 20,
        "SVG height should be at least grid height",
      );
    });

    it("contains wall segments", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(
        svg.includes('class="wall"'),
        "SVG should contain wall elements",
      );
      assert.ok(
        svg.includes('class="wall-under"'),
        "SVG should contain wall under-stroke elements",
      );
      assert.ok(
        svg.includes('class="wall-highlight"'),
        "SVG should contain wall highlight elements",
      );
    });

    it("contains room labels when enabled", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showLabels: true });
      assert.ok(
        svg.includes('class="room-number"'),
        "SVG should contain room numbers",
      );
    });

    it("omits room labels when disabled", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showLabels: false });
      assert.ok(
        !svg.includes('class="room-number"'),
        "SVG should not contain room numbers when labels disabled",
      );
    });

    it("contains grid lines when enabled", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showGrid: true });
      assert.ok(
        svg.includes('class="grid-line"'),
        "SVG should contain grid lines",
      );
    });

    it("omits grid lines when disabled", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showGrid: false });
      assert.ok(
        !svg.includes('class="grid-line"'),
        "SVG should not contain grid lines when disabled",
      );
    });

    it("uses blue color scheme by default", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(
        svg.includes("#4a90b8"),
        "Should contain blue background color",
      );
    });

    it("uses parchment color scheme when specified", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        colorScheme: "parchment",
      });
      assert.ok(
        svg.includes("#f5f0e6"),
        "Should contain parchment background color",
      );
      assert.ok(!svg.includes("#4a90b8"), "Should not contain blue background");
    });

    it("includes compass rose by default", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(
        svg.includes('class="compass"'),
        "SVG should contain compass rose",
      );
      assert.ok(svg.includes("North"), "Compass should show North");
    });

    it("includes floor and corridor rects", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(
        svg.includes('class="floor"'),
        "SVG should contain floor rects",
      );
    });

    it("includes rock hatching when enabled", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showRockHatch: true });
      assert.ok(
        svg.includes("rock-hatch"),
        "SVG should contain rock hatch pattern",
      );
      assert.ok(
        svg.includes("rock-stipple"),
        "SVG should contain rock stipple pattern",
      );
      assert.ok(
        svg.includes("rock-tone"),
        "SVG should contain rock tonal shading layer",
      );
      assert.ok(
        svg.includes("rock-chisel-mark"),
        "SVG should contain rock chisel marks",
      );
    });

    it("includes blueprint grain texture and map frame", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(
        svg.includes("blueprint-grain"),
        "SVG should include blueprint grain pattern",
      );
      assert.ok(
        svg.includes('class="frame-outer"'),
        "SVG should include outer map frame",
      );
      assert.ok(
        svg.includes('class="frame-inner"'),
        "SVG should include inner map frame",
      );
    });

    it("includes sheet wash, title block, and border details", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent);
      assert.ok(svg.includes("blueprint-wash"), "Should include wash gradient");
      assert.ok(
        svg.includes('class="title-block-box"'),
        "Should include title block",
      );
      assert.ok(
        svg.includes('class="sheet-border-outer"'),
        "Should include outer sheet border",
      );
      assert.ok(
        svg.includes('class="grid-line-major"'),
        "Should include major 5-square grid lines",
      );
      assert.ok(svg.includes('class="room-tag"'), "Should include room tags");
    });

    it("supports strict profile with reduced chrome and centered labels", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        styleProfile: "blueprint-strict",
      });

      assert.ok(
        svg.includes('class="room-number-center"'),
        "Strict profile should use centered room numbers",
      );
      assert.ok(
        !svg.includes('class="room-tag"'),
        "Strict profile should not render tag labels",
      );
      assert.ok(
        !svg.includes("blueprint-wash"),
        "Strict profile should omit wash by default",
      );
      assert.ok(
        !svg.includes("blueprint-grain"),
        "Strict profile should omit grain by default",
      );
      assert.ok(
        !svg.includes('class="title-block-box"'),
        "Strict profile should omit title block by default",
      );
      assert.ok(
        !svg.includes('class="sheet-border-outer"'),
        "Strict profile should omit sheet border by default",
      );
      assert.ok(
        !svg.includes('class="compass"'),
        "Strict profile should omit compass by default",
      );
      assert.ok(
        !svg.includes('class="legend-box"'),
        "Strict profile should omit legend by default",
      );
    });

    it("supports explicit centered labels in enhanced profile", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        styleProfile: "blue-enhanced",
        labelMode: "center",
      });

      assert.ok(
        svg.includes('class="room-number-center"'),
        "Center label mode should render centered labels",
      );
      assert.ok(
        !svg.includes('class="room-tag"'),
        "Center label mode should suppress corner tags",
      );
    });

    it("supports explicit corner labels in strict profile", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        styleProfile: "blueprint-strict",
        labelMode: "corner",
      });

      assert.ok(
        svg.includes('class="room-tag"'),
        "Corner label mode should render room tags",
      );
      assert.ok(
        !svg.includes('class="room-number-center"'),
        "Corner label mode should suppress centered labels",
      );
    });

    it("supports disabling labels via labelMode none", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        labelMode: "none",
      });

      assert.ok(
        !svg.includes('class="room-number"'),
        "Label mode none should suppress corner labels",
      );
      assert.ok(
        !svg.includes('class="room-number-center"'),
        "Label mode none should suppress centered labels",
      );
    });

    it("uses strict rock patterns in strict profile", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, {
        styleProfile: "blueprint-strict",
      });

      assert.ok(
        svg.includes("rock-hatch-major-strict"),
        "Strict profile should include strict major hatching",
      );
      assert.ok(
        svg.includes("rock-hatch-minor-strict"),
        "Strict profile should include strict minor hatching",
      );
      assert.ok(
        !svg.includes("rock-stipple-a"),
        "Strict profile should not include stipple overlays",
      );
      assert.ok(
        !svg.includes('<line class="rock-chisel-mark"'),
        "Strict profile should not include chisel marks",
      );
    });

    it("allocates enough height for full legend rendering", () => {
      const { geometry, graph, intent } = generateGatehouseMap();
      const svg = renderSvg(geometry, graph, intent, { showLegend: true });
      const svgHeightMatch = svg.match(/^<svg[^>]*height="([0-9.]+)"/);
      const legendYMatch = svg.match(
        /<g class="legend" transform="translate\([0-9.]+,([0-9.]+)\)">/,
      );
      const legendHeightMatch = svg.match(
        /<rect class="legend-box" x="0" y="0" width="[0-9.]+" height="([0-9.]+)"/,
      );

      assert.ok(svgHeightMatch, "SVG height should exist");
      assert.ok(legendYMatch, "Legend transform should exist");
      assert.ok(legendHeightMatch, "Legend box should exist");

      const svgHeight = parseFloat(svgHeightMatch[1]);
      const legendBottom =
        parseFloat(legendYMatch[1]) + parseFloat(legendHeightMatch[1]);
      assert.ok(
        legendBottom <= svgHeight,
        "Legend should fit within declared SVG height",
      );
    });
  });
});
