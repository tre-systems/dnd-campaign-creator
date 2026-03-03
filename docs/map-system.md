# Map Generation System

Technical reference for the procedural dungeon map generator. This document
describes the architecture, algorithms, data structures, and rendering pipeline
used to produce old-school D&D dungeon maps from authored topology graphs.

Keep this document up to date as the system evolves.

## Architecture

The system uses a **four-layer pipeline** where each layer transforms the
output of the previous one:

```text
Intent  -->  Topology  -->  Geometry  -->  Presentation
  (why)       (what)        (where)        (how it looks)
```

**Intent** defines what a dungeon section is for in play: its theme, pressure
type, session load, and the promise it makes to players. Written first, before
any rooms.

**Topology** is an abstract node-edge graph describing rooms and connections.
It captures navigational structure (loops, chokepoints, dead ends) without
any spatial coordinates.

**Geometry** places topology onto a 2D grid. Rooms get dimensions and
positions via BSP partitioning, corridors are carved via A\* pathfinding, and
thematic dressing is applied.

**Presentation** renders the grid as SVG (old-school blue maps) or ASCII text,
and assembles a markdown specification packet for DM use.

### Source files

All code lives in `src/map/`:

| File                         | Layer        | Purpose                                               |
| ---------------------------- | ------------ | ----------------------------------------------------- |
| `intent.js`                  | Intent       | Section definition, validation, seeded RNG            |
| `topology.js`                | Topology     | Graph construction, BFS, cycle counting, max-flow     |
| `geometry.js`                | Geometry     | BSP partitioning, room placement, grid management     |
| `corridors.js`               | Geometry     | A\* corridor routing, door placement                  |
| `dressing.js`                | Geometry     | Thematic feature placement (pillars, altars, etc.)    |
| `validate.js`                | Cross-layer  | Topology and geometry validation rules                |
| `render-svg.js`              | Presentation | SVG rendering (Paratime blue style)                   |
| `render-ascii.js`            | Presentation | ASCII text rendering                                  |
| `packet.js`                  | Presentation | Markdown specification document                       |
| `fixtures/gatehouse-ruin.js` | Test data    | Gatehouse (9 rooms), linear (3), dwarven complex (22) |

---

## Layer 1: Intent

**Module:** `intent.js`

Intent captures the designer's purpose for a section. It is validated and
normalised by `buildIntent(section)` before any generation begins.

### Intent object

```javascript
{
  id: "gatehouse-ruin",
  level: 1,                      // dungeon level (default: 1)
  chapter: "Act I",              // campaign chapter
  theme: "Goblin-occupied ...",  // thematic identity
  pressure: "faction",           // primary pressure type
  sessionLoad: "standard",       // encounter density
  promise: "Players breach ...", // one-sentence player hook
  layoutStrategy: "constructed", // placement strategy
  grid: { width: 30, height: 44 },
  density: "standard"            // room size distribution
}
```

### Valid values

| Field            | Options                                                   |
| ---------------- | --------------------------------------------------------- |
| `pressure`       | `faction`, `pursuit`, `hazard`, `puzzle`, `boss`, `mixed` |
| `sessionLoad`    | `light`, `standard`, `heavy`                              |
| `layoutStrategy` | `constructed`, `organic`, `hybrid`                        |
| `density`        | `sparse`, `standard`, `dense`                             |

### Grid limits

- Maximum: **60 x 60** cells
- Minimum: **10 x 10** cells
- Default: **60 x 60**

### Seeded RNG

`createRng(seed)` returns a deterministic PRNG using the **mulberry32**
algorithm. All downstream generation uses this RNG so that the same seed
always produces the same map.

```javascript
function createRng(seed) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
```

Returns floats in `[0, 1)`. Deterministic for a given seed.

---

## Layer 2: Topology

**Module:** `topology.js`

Topology defines the section's navigational structure as a directed graph.
It is authored (not randomly generated) and validated before geometry begins.

### Graph construction

`buildGraph(nodes, edges)` validates inputs and returns a `TopologyGraph`:

```javascript
{
  nodes: Node[],
  edges: Edge[],
  nodeMap: Map<id, Node>,      // O(1) lookup
  adjacency: Map<id, Edge[]>   // adjacency list
}
```

### Node types

| Type           | Purpose                             |
| -------------- | ----------------------------------- |
| `entry`        | Section entrance                    |
| `exit`         | Section exit                        |
| `hub`          | High-connectivity crossroads        |
| `guard`        | Sentry/guard position near entrance |
| `faction-core` | Leader quarters, command post       |
| `resource`     | Kitchen, well, armoury              |
| `hazard`       | Trap cluster, environmental danger  |
| `set-piece`    | Boss fight, major puzzle            |
| `secret`       | Hidden area requiring discovery     |
| `standard`     | General purpose room                |

### Edge types

| Type       | Meaning                     | Default direction |
| ---------- | --------------------------- | ----------------- |
| `open`     | Unrestricted passage        | Bidirectional     |
| `door`     | Closed but unlocked         | Bidirectional     |
| `locked`   | Requires key or check       | Bidirectional     |
| `secret`   | Requires discovery          | Bidirectional     |
| `one-way`  | Drops, chutes, collapses    | Directed          |
| `vertical` | Stairs, ladders, shafts     | Bidirectional     |
| `off-map`  | Corridor to another section | Bidirectional     |

### Edge width classes

| Class      | Cells | Meaning                   |
| ---------- | ----- | ------------------------- |
| `tight`    | 1     | Rare, deliberate pressure |
| `standard` | 1     | Default (10ft corridor)   |
| `wide`     | 2     | Major thoroughfare (20ft) |

### Graph algorithms

**BFS distance** (`bfsDistance`): Standard breadth-first search returning a
`Map<nodeId, distance>` from a start node. Used for guard placement and
boss depth validation.

**Edge-disjoint paths** (`countEdgeDisjointPaths`): Edmonds-Karp max-flow
with unit capacities. Counts independent routes between entry and exit to
ensure the dungeon is not a single-path bottleneck.

**Cycle count** (`findCycleCount`): Uses the formula `E - V + C`
(edges minus vertices plus connected components). Validates the loop-forward
design principle that prevents railroad layouts.

**Node degree** (`nodeDegree`): Counts unique edges on a node. Identifies
dead ends (degree 1) and hubs (degree 3+).

---

## Layer 3: Geometry

Geometry has three sub-phases: room placement, corridor routing, and dressing.

### 3a. Room Placement

**Module:** `geometry.js`

#### Cell grid

The map is a 2D array of integers. Each cell is one of:

| Constant      | Value | Meaning           |
| ------------- | ----- | ----------------- |
| `WALL`        | 0     | Solid stone       |
| `FLOOR`       | 1     | Room floor        |
| `CORRIDOR`    | 2     | Passage           |
| `DOOR`        | 3     | Standard door     |
| `DOOR_LOCKED` | 4     | Locked door       |
| `DOOR_SECRET` | 5     | Secret door       |
| `STAIRS_DOWN` | 6     | Descending stairs |
| `STAIRS_UP`   | 7     | Ascending stairs  |
| `PILLAR`      | 8     | Column            |
| `TRAP`        | 9     | Trap tile         |
| `WATER`       | 10    | Water             |
| `RUBBLE`      | 11    | Rubble            |
| `TREASURE`    | 12    | Treasure/POI      |
| `PORTCULLIS`  | 13    | Portcullis        |
| `ARCHWAY`     | 14    | Archway           |
| `CURTAIN`     | 15    | Curtain/hanging   |
| `STATUE`      | 16    | Statue            |
| `ALTAR`       | 17    | Altar             |
| `WELL`        | 18    | Well              |
| `FIREPIT`     | 19    | Fire pit          |
| `THRONE`      | 20    | Throne            |
| `SARCOPHAGUS` | 21    | Sarcophagus       |
| `BARS`        | 22    | Iron bars         |
| `PIT`         | 23    | Pit               |
| `LEVER`       | 24    | Lever/switch      |
| `FOUNTAIN`    | 25    | Fountain          |
| `COLLAPSED`   | 26    | Collapsed passage |
| `DOUBLE_DOOR` | 27    | Double door       |

#### Room sizes

```text
small:   2-3 x 2-3 cells
medium:  3-5 x 3-6 cells
large:   5-8 x 5-10 cells
```

Density biases sizes: `sparse` favours the low end, `dense` the high end.

#### BSP partitioning algorithm

`layoutConstructed()` places rooms using Binary Space Partitioning:

1. Compute target dimensions for each room from its topology node's `sizeClass`
2. Run BSP on the usable grid area:
   - If `targetRooms <= 1`, return leaf node
   - Choose split axis (prefer longer dimension)
   - Split at 35-65% ratio (randomised for variety)
   - Recurse on both halves
3. Collect BSP leaf partitions
4. Sort rooms and partitions by area (largest first)
5. Place each room in its assigned partition with random offset
6. Fill room cells with `CELL.FLOOR`

If placement fails (rooms don't fit), the entire layout retries with a
different random split. Up to 50 retries before throwing.

#### Semantic room shapes

Room carving is now semantic rather than uniformly rectangular. Shape selection
is driven by node type/name and room size, then carved from an initial
rectangle:

- `rect`: default rectangle
- `notched`: L-cut corner notch for medium/large generic rooms
- `chamfered`: clipped corners for major ceremonial/command spaces
- `cross`: plus-shaped halls for crossroads/nexus-style hubs
- `cave`: irregular noisy carve for hazard/secret/cave-hint rooms, with
  connectivity cleanup and interior rough terrain (`rubble`, contextual `water`
  or `collapsed`)

Cross and cave rooms preserve mid-wall floor anchors so corridor/door routing
can still place coherent thresholds on irregular outlines.

#### Geometry object

```javascript
{
  width: 30,
  height: 44,
  cells: number[][],       // 2D grid of CELL constants
  rooms: PlacedRoom[],     // positioned rooms
  corridors: []            // populated by corridor routing
}
```

Each `PlacedRoom`:

```javascript
{
  nodeId: "H1",            // linked topology node
  nodeType: "hub",
  nodeName: "Gatehouse Hall",
  x: 5, y: 10,            // top-left corner (0-based)
  w: 6, h: 5,             // dimensions in cells
  sizeClass: "medium",
  shape: "chamfered",      // rect | notched | chamfered | cross | cave
  doorPositions: [],       // filled during routing
  notch: {x, y, w, h}     // optional L-shape cutout
}
```

### 3b. Corridor Routing

**Module:** `corridors.js`

`routeCorridors()` connects placed rooms by carving corridors through the
grid based on topology edges.

#### Algorithm

For each topology edge:

1. Find the source and target rooms by `nodeId`
2. Compute wall connection points using `bestWallPointForGrid()` (selects
   target-facing wall points that are also backed by playable room floor)
3. Route a path between the two points using A\* pathfinding
4. Carve the path into the grid (only overwriting `WALL` cells)
5. Place a door symbol if the edge type requires one

For boundary connectors:

1. Compute the connector's interior anchor point (1 cell inward from edge)
2. Find the nearest room
3. Route an L-path from anchor to room
4. Carve the connector corridor

#### A\* pathfinding

`routeAStar(from, to, cells, rng)` finds the shortest path through the grid.

**Cost model:**

| Cell type     | Move cost | Rationale                      |
| ------------- | --------- | ------------------------------ |
| `WALL`        | 1         | Cheap to carve through         |
| `CORRIDOR`    | 0         | Free to reuse existing         |
| `FLOOR`       | 10        | Expensive, avoid cutting rooms |
| Out of bounds | Infinity  | Impassable                     |

**Heuristic:** Manhattan distance (`|dx| + |dy|`)

**Movement:** 4-directional (no diagonals)

**Iteration limit:** 5,000. If exceeded, falls back to L-path routing.

The cost model means corridors naturally:

- Take the shortest route through walls
- Merge with existing corridors when convenient
- Avoid slicing through rooms

#### L-path fallback

`routeL(from, to, cells, rng)` builds an L-shaped path (one axis then the
other). It tries both horizontal-first and vertical-first variants, counts
collisions with existing rooms, and picks the variant with fewer collisions.

#### Carving

`carveCorridorPath(cells, path, width)` writes `CELL.CORRIDOR` along the
path. It only overwrites `WALL` cells, never `FLOOR` or other features.
For wide corridors, it expands perpendicular to the movement direction.

#### Door placement

`edgeTypeToDoorCell()` maps edge types to door cells:

- `door` -> `CELL.DOOR`
- `locked` -> `CELL.DOOR_LOCKED`
- `secret` -> `CELL.DOOR_SECRET`
- `open` / other -> no door

`chooseDoorTypeForEdge()` upgrades some ceremonial thresholds to
`CELL.DOUBLE_DOOR` (for wide/capstone connections) while preserving locked and
secret semantics.

Doors are placed only when the candidate threshold cell is adjacent to both
room floor and passage space (`CORRIDOR`/door cells). This prevents invalid
door symbols floating in solid rock.

By edge type:

- `door`: place paired thresholds on both connected room walls when valid.
- `locked` / `secret`: place a single threshold on the defensible/concealed
  side via `chooseGatedDoorPoint()`:
  - `secret` prefers `secret`/hazard/resource small rooms
  - `locked` prefers `faction-core`/set-piece/exit strongholds
  - ties preserve destination-side convention

### 3c. Dressing

**Module:** `dressing.js`

`applyDressing()` places thematic features inside rooms based on room
type/name from the topology graph.

#### Recipe selection

`pickRecipe(node)` matches room names (case-insensitive) to recipes:

- `guard` / `guard post` -> `guardpost`
- `armoury` / `armory` -> `armoury`
- `vault` / `treasury` -> `vault`
- `prison` / `cell` -> `prison`
- `fountain` / `cistern` / `pool` -> `fountain`
- `collapsed` / `ruin` / `chasm` / `rift` -> `collapsed`
- `hazard` node type -> `hazard`
- `chapel`, `shrine` -> `chapel`
- `throne` -> `throne`
- `crypt`, `tomb` -> `crypt`
- `well` -> `well`
- `forge`, `smelt` -> `forge`
- `gallery`, `great hall`, or `hall` (if large) -> `pillars`
- `library`, `scriptorium` -> `library`
- `secret` node type (fallback) -> `vault`
- Large rooms (no keyword) -> `pillars`
- Rooms with no recipe (30% chance) -> `scatter`

#### Recipes

Each recipe is a function `(room, rng) -> [{dx, dy, cell}, ...]` returning
offsets relative to the room's top-left corner.

- **chapel:** Altar at far wall center, pillars along sides (if >= 4x4)
- **throne:** Throne at far wall center, flanking pillars, column rows if large
- **crypt:** Sarcophagi in center column at intervals (>= 3x3)
- **well:** Single well at room center
- **forge:** Fire pit at center, flanking pillars
- **pillars:** Grid of pillars spaced 2-3 cells apart (>= 4x4)
- **library:** Statues along one wall every 2 cells
- **guardpost:** Portcullis + lever + bars
- **armoury:** Barred racks and central marker
- **vault:** Treasure core with trap/bars
- **prison:** Dense barred cell pattern
- **hazard:** Pit + trigger + unstable marker
- **fountain:** Fountain with surrounding water accents
- **collapsed:** Collapse core with rubble
- **scatter:** 1-2 random symbols from a mixed old-school feature pool

Features are only placed on `CELL.FLOOR` cells. Doors, corridors, and
existing features are never overwritten.

Before room recipes, `applyDressing()` places transition symbols in authored
entry/exit rooms:

- `entry` defaults to `STAIRS_UP`
- `exit` defaults to `STAIRS_DOWN`
- explicit room-name direction hints (`upper`, `lift`, `descent`, `abyss`, etc.)
  override type defaults

Door-aware placement guards also reserve ingress and center traffic lanes:

- Inside-door cells and immediate neighbours are kept clear.
- A direct ingress-to-center lane is reserved per doorway.
- If a recipe anchor lands on a blocked tile, placement relocates to the
  nearest valid tile inside the room.

---

## Validation

**Module:** `validate.js`

Validation runs at two stages: after topology construction and after geometry
placement.

### Topology rules

| Rule                   | Condition                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| Grid size              | Within 60 x 60                                                      |
| Entry and exit exist   | At least one of each                                                |
| Guard placement        | Guards within 2 edges of entry                                      |
| Boss/treasure depth    | `faction-core` and `set-piece` nodes >= 2 edges from entry          |
| Loop count             | >= 1 loop per 6 nodes                                               |
| Two independent routes | >= 2 edge-disjoint paths from entry to exit                         |
| Dead end justification | Dead ends only for `secret`, `hazard`, `set-piece`, `entry`, `exit` |
| One-way safety         | One-way routes always have a path to exit                           |

### Geometry rules

| Rule                 | Condition                                                     |
| -------------------- | ------------------------------------------------------------- |
| Rooms within bounds  | No room extends outside grid                                  |
| No room overlaps     | No two rooms share cells                                      |
| All nodes placed     | Every topology node has a room                                |
| Large room exists    | At least one large room (for set-piece encounters)            |
| Connectors connected | Every boundary connector reaches playable space via BFS flood |

---

## Layer 4: Presentation

### SVG Rendering

**Module:** `render-svg.js`

Produces old-school dungeon maps in the Paratime/TSR blue style.

#### Rendering order

1. Background fill
2. Optional background wash gradient (enhanced profile only)
3. Optional paper grain texture (enhanced profile only)
4. Rock treatment:
   - `blue-enhanced`: layered hatch + stipple + tonal/chisel modulation
   - `blueprint-strict`: denser multi-hatch (major/cross/minor/oblique) + stipple + tonal bands
5. Floor tiles (room floors and corridors)
6. Strict-profile microtexture overlay (subtle diagonal draft grain)
7. Grid lines (minor + major 5-square lines over walkable areas)
8. Wall segments (computed and merged; enhanced renders under/main/highlight, strict renders a single heavy wall pass)
9. Map frame (double-line cartographic border around map area)
10. Feature symbols (doors, stairs, pillars, altars, etc.)
11. Room labels (profile dependent: top-left number tags in enhanced, centered room numbers in strict; overridable via `labelMode`)
12. Optional compass rose (enabled by default in enhanced, disabled by default in strict)
13. Optional legend box (enabled by default in enhanced, disabled by default in strict)
14. Optional title block and full sheet border (enabled by default in enhanced, disabled by default in strict)

#### Wall segment computation

`computeWallSegments()` scans every floor-like cell and emits a line segment
on each edge adjacent to a wall cell. Segments are then merged by
`mergeCollinearSegments()`:

1. Group horizontal segments by Y coordinate
2. Sort each group by X and merge adjacent/overlapping ranges
3. Repeat for vertical segments grouped by X

This produces clean, continuous wall lines instead of per-cell fragments.
Wall lines are rendered in three passes (`wall-under`, `wall`,
`wall-highlight`) in the enhanced profile, or as a single heavy stroke in
the strict profile.

Rock treatment uses distance-based density from playable space plus
deterministic per-cell variation so the surrounding stone reads as hand-drafted
rather than a uniform fill.

#### Color schemes

**Blue (default, Paratime style):**

- Background: `#4a90b8`
- Floors: `#eef6fb`
- Walls: `#16516d` (stroke width 3-4px)
- Features: `#3b7a9e`

Blue profile variants:

- `blue-enhanced` (default): textured field, sheet furniture, top-left tags.
- `blueprint-strict`: flatter old-school output with centered labels and reduced
  chrome, while retaining strict hatch/stipple rock treatment and subtle
  blueprint microtexture.

**Parchment:**

- Background: `#f5f0e6`
- Floors: `#f9f7f2`
- Walls: `#1a1a1a`

#### Feature symbols

Each cell type has a hand-crafted SVG symbol rendered by
`renderFeatureSymbol()`. Examples:

- **Door:** Wall notch with center slit and hinge pin
- **Locked door:** Door block with prominent hasp bar + key marker
- **Secret door:** Dashed cut-line with terminal ticks and boxed `S`
- **Stairs:** Four-step tapered stack with large directional arrow
- **Pillar:** Filled circle
- **Altar:** Rectangle with cross
- **Throne:** Chair shape with back and seat

Door orientation is inferred from adjacent cell context by
`inferDoorOrientation()`.

#### Room labels

Rooms are labelled sequentially: `1-9`, then `A-Z`, then `AA`, `AB`, ... .
Labels are profile-dependent:

- `blue-enhanced`: compact top-left number tags.
- `blueprint-strict`: centered room numbers for immediate table-readability.

`labelMode` can explicitly override this behaviour:

- `auto` (default): profile-driven labels.
- `corner`: force top-left tags.
- `center`: force centered labels.
- `none`: suppress labels.

#### SVG structure

```xml
<svg viewBox="0 0 {W} {H}">
  <style>...</style>
  <rect class="bg"/>
  <g class="bg-wash-layer">...</g>
  <g class="paper-grain-layer">...</g>
  <g class="rock-hatch-layer">...</g>
  <g class="floors">...</g>
  <g class="grid">...</g>
  <g class="walls">...</g>
  <g class="map-frame">...</g>
  <g class="features">...</g>
  <g class="labels">...</g>
  <g class="compass-group">...</g>     <!-- optional -->
  <g class="legend">...</g>            <!-- optional -->
  <g class="title-block-group">...</g> <!-- optional -->
  <g class="sheet-border">...</g>      <!-- optional -->
</svg>
```

### ASCII Rendering

**Module:** `render-ascii.js`

Text-based fallback. Common cells map to:

```text
# = wall    . = floor/corridor    + = door
L = locked  S = secret            > = stairs down
< = stairs up   c = pillar        T = trap
~ = water   * = treasure          s = statue
a = altar   w = well              t = throne
```

Additional feature mappings are defined in `render-ascii.js` (`ASCII_MAP`).

Room labels use `1-9`, then `A-Z`, then `AA`, `AB`, ... and are placed at room centres.

### Packet Generation

**Module:** `packet.js`

Assembles a complete markdown document with 10 sections:

1. Metadata (ID, theme, pressure, promise)
2. Tactical footprint (dimensions, density, room/corridor counts)
3. Topology (node and edge tables)
4. Section map (SVG image + ASCII)
5. Room key (per-room dimensions, occupants, tactical notes)
6. Transition connectors
7. Encounter ecology (computed territory zones + patrol routes)
8. Dynamic behaviour (computed clocks + escalation sequence)
9. Validation checklist
10. DM quick-run notes

---

## Complete Pipeline

```javascript
const intent = buildIntent(sectionDef);
const rng = createRng(seed);
const graph = buildGraph(section.nodes, section.edges);

// Validate topology first (fail-fast)
const topoResult = validateTopology(graph, intent.grid);

// Place rooms via BSP
const geometry = layoutConstructed(
  graph,
  intent.grid,
  intent.density,
  section.connectors,
  50,
  rng,
);

// Route corridors via A*
routeCorridors(geometry, graph, rng, section.connectors);

// Apply thematic dressing
applyDressing(geometry, graph, rng);

// Validate geometry
const geoResult = validateGeometry(geometry, graph, section.connectors);

// Render outputs
const svg = renderSvg(geometry, graph, intent, {
  cellSize: 20,
  styleProfile: "blueprint-strict",
  labelMode: "auto",
});
const ascii = renderAscii(geometry, graph);
const packet = renderPacket(geometry, graph, intent, ascii, "map.svg", {
  valid: topoResult.valid && geoResult.valid,
  results: [...topoResult.results, ...geoResult.results],
});
```

---

## Design Principles

**Topology-first:** The navigational graph is authored before any spatial
layout. This ensures playability constraints (loops, multiple routes, dead
end justification) are satisfied structurally, not by accident.

**Seeded determinism:** Every map is reproducible from its seed. Same intent +
seed = identical layout. Change the seed to explore variations.

**Non-destructive carving:** Corridors only overwrite `WALL` cells. Room
floors, doors, and features are never damaged by corridor routing.

**Retry-on-failure:** BSP placement may fail for unlucky random splits.
`layoutConstructed()` automatically retries up to 50 times before throwing.

**Fail-fast validation:** Topology rules are checked before geometry is
attempted. If the graph is invalid (missing loops, no routes), no CPU is
wasted on layout.

---

## Test Fixtures

Five fixtures in `fixtures/gatehouse-ruin.js`:

| Fixture                           | Rooms | Grid  | Purpose                                                       |
| --------------------------------- | ----- | ----- | ------------------------------------------------------------- |
| `createGatehouseSection()`        | 9     | 30x44 | Standard dungeon, passes all validation                       |
| `createLinearSection()`           | 3     | 20x20 | Intentionally fails (no loops, one route)                     |
| `createDwarvenComplexSection()`   | 22    | 44x44 | Dense dungeon with multiple wings and hubs                    |
| `createSunkenSanctumSection()`    | 12    | 36x38 | Mixed widths, one-way flow, multi-connectors                  |
| `createClockworkArchiveSection()` | 15    | 42x40 | Multi-hub fortress with diverse symbol-triggering room themes |

---

## Iteration History

The map renderer has been through multiple iterations (`v4` through `v12`).
To keep the repository lean, legacy iteration media was pruned; use git history
if you need archived visual outputs from older versions.

| Version | Key changes                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| v4      | Initial blue rendering, basic wall segments                                                                                                          |
| v5      | Paratime wall color (#16516d), 10ft scale, room label improvements                                                                                   |
| v6      | 22-room dwarven complex, dressing system, L-shaped rooms                                                                                             |
| v7      | A\* corridor routing, rock hatching default, thicker walls                                                                                           |
| v8      | Blueprint grain texture, double-line frame, layered wall strokes, improved compass/legend readability                                                |
| v9      | Blueprint wash, major 5-square grid lines, title block + sheet border, room number tags, legend sizing sync                                          |
| v10     | Door/lock/secret/stair glyph polish and denser period-style rock treatment (dual hatch + stipple + chisel)                                           |
| v11     | Strict Paratime profile (`blueprint-strict`), centered labels, reduced chrome defaults, computed ecology/dynamic packet sections, visual snapshot QA |
| v12     | Grid-backed threshold door placement, doorway-aware feature keepouts/relocation, explicit `labelMode` overrides (`auto`, `corner`, `center`, `none`) |

---

## Visual QA Automation

Deterministic PNG/SVG baselines are stored in `docs/map-review/snapshots/`.
The quality suite currently tracks gatehouse, dwarven complex, sunken sanctum,
and clockwork archive profiles across fixed seeds.

- `npm run map:snapshots:update` regenerates baselines intentionally.
- `npm run map:snapshots:check` compares current output to baselines.
- `npm run map:style:audit` compares snapshot style metrics to local reference
  images in `docs/map-review/references/paratime/` and reports measurable gaps.

`npm run verify` and CI both include `map:snapshots:check`, so rendering
drift is caught automatically.

`map:style:audit` is intentionally local-only (it depends on external reference
images that are not committed by default).
