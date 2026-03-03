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

#### L-shaped rooms

`fillRoomFloor()` has a 35% chance of carving an L-shaped corner notch from
rooms >= 4x4 cells. The notch is 30-50% of the room's width/height, placed
at a random corner. This breaks up the rectangular uniformity.

```javascript
if (rng && room.w >= 4 && room.h >= 4 && rng() < 0.35) {
  // carve notch at random corner (TL, TR, BL, BR)
  const nw = 1 + Math.floor(rng() * Math.floor(room.w * 0.4));
  const nh = 1 + Math.floor(rng() * Math.floor(room.h * 0.4));
  // ... notch stored as room.notch = {x, y, w, h}
}
```

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
  x: 5, y: 10,            // top-left corner (0-based)
  w: 6, h: 5,             // dimensions in cells
  sizeClass: "medium",
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
2. Compute wall connection points using `bestWallPoint()` (picks the wall
   face pointing toward the target room)
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

Doors are placed at the midpoint of the carved path.

### 3c. Dressing

**Module:** `dressing.js`

`applyDressing()` places thematic features inside rooms based on room
type/name from the topology graph.

#### Recipe selection

`pickRecipe(node)` matches room names (case-insensitive) to recipes:

| Keyword match                | Recipe    |
| ---------------------------- | --------- |
| `chapel`, `shrine`, `temple` | `chapel`  |
| `throne`                     | `throne`  |
| `crypt`, `tomb`              | `crypt`   |
| `well`, `cistern`            | `well`    |
| `forge`, `smithy`            | `forge`   |
| `gallery`, `hall` (large)    | `pillars` |
| `library`                    | `library` |
| Large rooms (no keyword)     | `pillars` |
| Medium+ rooms (30% chance)   | `scatter` |

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
- **scatter:** 1-2 random pillars/statues

Features are only placed on `CELL.FLOOR` cells. Doors, corridors, and
existing features are never overwritten.

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
2. Rock hatching (diagonal lines on wall cells adjacent to floors)
3. Floor tiles (room floors and corridors)
4. Grid lines (only over walkable areas)
5. Wall segments (computed and merged for clean lines)
6. Feature symbols (doors, stairs, pillars, altars, etc.)
7. Room labels (small bold number in top-left corner, Paratime style)
8. Compass rose (bottom-right)
9. Legend box (only symbols actually used in the map)

#### Wall segment computation

`computeWallSegments()` scans every floor-like cell and emits a line segment
on each edge adjacent to a wall cell. Segments are then merged by
`mergeCollinearSegments()`:

1. Group horizontal segments by Y coordinate
2. Sort each group by X and merge adjacent/overlapping ranges
3. Repeat for vertical segments grouped by X

This produces clean, continuous wall lines instead of per-cell fragments.

#### Color schemes

**Blue (default, Paratime style):**

- Background: `#4a90b8`
- Floors: `#f5fafd`
- Walls: `#16516d` (stroke width 3-4px)
- Features: `#3b7a9e`

**Parchment:**

- Background: `#f5f0e6`
- Floors: `#f9f7f2`
- Walls: `#1a1a1a`

#### Feature symbols

Each cell type has a hand-crafted SVG symbol rendered by
`renderFeatureSymbol()`. Examples:

- **Door:** Small filled rectangle, rotated to match corridor orientation
- **Locked door:** Rectangle with keyhole circle
- **Secret door:** Dashed line segment
- **Stairs:** Three parallel lines with directional arrow
- **Pillar:** Filled circle
- **Altar:** Rectangle with cross
- **Throne:** Chair shape with back and seat

Door orientation is inferred from adjacent cell context by
`inferDoorOrientation()`.

#### Room labels

Rooms are labelled sequentially: `1-9`, then `A-Z`, then `AA`, `AB`, ... .
Labels are placed in the top-left corner of each room at reduced font size
with bold weight.

#### SVG structure

```xml
<svg viewBox="0 0 {W} {H}">
  <style>...</style>
  <rect class="bg"/>
  <g class="rock-hatch">...</g>
  <g class="floors">...</g>
  <g class="grid">...</g>
  <g class="walls">...</g>
  <g class="features">...</g>
  <g class="labels">...</g>
  <g class="compass-group">...</g>
  <g class="legend">...</g>
</svg>
```

### ASCII Rendering

**Module:** `render-ascii.js`

Text-based fallback. Each cell maps to a character:

```text
# = wall    . = floor/corridor    + = door
L = locked  S = secret            > = stairs down
< = stairs up   c = pillar        T = trap
~ = water   * = treasure          s = statue
a = altar   w = well              t = throne
```

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
7. Encounter ecology (placeholder)
8. Dynamic behaviour (placeholder)
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
const svg = renderSvg(geometry, graph, intent, { cellSize: 20 });
const ascii = renderAscii(geometry, graph);
const packet = renderPacket(
  geometry,
  graph,
  intent,
  ascii,
  "map.svg",
  { valid: topoResult.valid && geoResult.valid, results: [...topoResult.results, ...geoResult.results] },
);
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

Three fixtures in `fixtures/gatehouse-ruin.js`:

| Fixture                         | Rooms | Grid  | Purpose                                    |
| ------------------------------- | ----- | ----- | ------------------------------------------ |
| `createGatehouseSection()`      | 9     | 30x44 | Standard dungeon, passes all validation    |
| `createLinearSection()`         | 3     | 20x20 | Intentionally fails (no loops, one route)  |
| `createDwarvenComplexSection()` | 22    | 44x44 | Dense dungeon with multiple wings and hubs |

---

## Iteration History

The map rendering has been through several iterations, tracked as versioned
PNG/SVG artifacts in `docs/map-review/iteration/`.

| Version | Key changes                                                        |
| ------- | ------------------------------------------------------------------ |
| v4      | Initial blue rendering, basic wall segments                        |
| v5      | Paratime wall color (#16516d), 10ft scale, room label improvements |
| v6      | 22-room dwarven complex, dressing system, L-shaped rooms           |
| v7      | A\* corridor routing, rock hatching default, thicker walls         |
