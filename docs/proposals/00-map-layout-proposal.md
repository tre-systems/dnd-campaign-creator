# Campaign Map System - Proposal D (Final)

Supersedes proposals A, B, and C. This is the implementation specification for map generation in `dnd-campaign-creator`.

## What This Takes From Each Predecessor

**From A:** The sophisticated layout techniques (layered chokepoints, asymmetric route quality, territorial legibility, information gating by space). The ecology model (territory bands, patrol logic, predator/scavenger placement). These are the ideas that make dungeons _play well_ and none of the other proposals gave them enough weight.

**From B:** The concrete generation pipeline, algorithm selection (BSP, force-directed, cellular automata), connection-spec coordinate model, room size tables. These are the mechanics that make the system _buildable_.

**From C:** The four-layer architecture (Intent, Topology, Geometry, Presentation). The required table contracts for section packets.

**What this drops:** The multi-person governance model from A/C (this is a solo project). The phased migration waves (convert sections as they come up for play). ASCII-only output (replaced with SVG rendering for old-school map graphics).

## Goals

1. Every section fits within **30 x 44 squares** maximum.
2. Logical layout and playability take priority over aesthetics.
3. Creature and NPC placement follows coherent spatial and territorial logic.
4. Output includes old-school dungeon map graphics (SVG) suitable for print and screen.
5. Source data is markdown-structured for `dnd-campaign-creator` ingestion.
6. Sections connect cleanly via explicit boundary connectors.

## Non-Goals

- High-fidelity illustrated maps. The style is deliberately old-school.
- AI image generation. Maps are programmatic SVG.
- Full procedural dungeon generation with no human input. The topology graph is authored or guided, not random.

## The Four Layers

### Layer 1: Intent

What this section is _for_ in play. Written first, before any rooms or topology.

- **Section ID and level/chapter.**
- **Thematic identity:** what makes this section feel distinct.
- **Primary pressure:** faction, pursuit, hazard, puzzle, boss, or mixed.
- **Session load:** light (2-3 encounters), standard (4-6), heavy (6-8).
- **Section promise:** one sentence describing the player experience. This anchors all downstream design decisions.

### Layer 2: Topology

The section as an abstract node-edge graph. Designed before any geometry is placed.

#### Node Types

| Type         | Purpose                                                   |
| ------------ | --------------------------------------------------------- |
| Entry        | Where players enter the section                           |
| Exit         | Where players leave (may coincide with entry)             |
| Hub          | High-connectivity crossroads, multiple routes branch here |
| Guard/Sentry | Controls access to deeper areas                           |
| Faction Core | Leader quarters, command post, lair heart                 |
| Resource     | Kitchen, well, armoury, refuse pit - sustains inhabitants |
| Hazard       | Trap cluster, environmental danger, magical anomaly       |
| Set-Piece    | Boss fight, major puzzle, dramatic reveal                 |
| Secret       | Hidden area, requires discovery                           |
| Standard     | General purpose room                                      |

Each node records: tactical role, default occupancy, sightline quality (open/partial/blocked), retreat options.

#### Edge Types

| Type               | Notation | Notes                       |
| ------------------ | -------- | --------------------------- |
| Open passage       | `-`      | Unrestricted                |
| Door               | `+`      | Closed but unlocked         |
| Locked door        | `L`      | Requires key or check       |
| Secret door        | `S`      | Requires discovery          |
| One-way            | `->`     | Drops, chutes, collapses    |
| Vertical           | `^`      | Stairs, ladders, shafts     |
| Off-map transition | `=`      | Corridor to another section |

Each edge records: bidirectional flag, gate condition, width class (tight/standard/wide), noise profile, whether combat can occur in the passage.

#### Topology Rules

1. Guard/sentry nodes within 1-2 edges of entrances.
2. Boss/treasure/faction-core nodes behind at least 2 traversal decisions from entry.
3. At least 1 loop per 4-6 nodes. Never purely linear.
4. At least 2 independent routes from primary entry to primary exit.
5. Dead ends only when they contain reward, risk, secret, or lore.
6. One-way routes never the sole critical path unless a return route exists.

### Layer 3: Geometry

Place the topology onto a grid of at most 30 x 44 squares.

#### Room Sizes

| Class  | Dimensions     | Typical use                          | Mix  |
| ------ | -------------- | ------------------------------------ | ---- |
| Small  | 3x3 to 5x5     | Guard posts, cells, closets, shrines | ~50% |
| Medium | 6x8 to 8x10    | Common rooms, barracks, workshops    | ~35% |
| Large  | 10x12 to 15x20 | Great halls, caverns, throne rooms   | ~15% |

At least one large room per section for a landmark or set-piece encounter.

#### Layout Strategies

Select per section theme:

- **Constructed** (forts, temples, tombs): BSP partitioning. Rectangular rooms, structured wings. Add 8-10% extra connections beyond the partition tree to break linearity.
- **Organic** (caves, ruins, warrens): Force-directed placement with cellular automata for wall textures. Irregular shapes. Flood-fill pass to guarantee connectivity.
- **Hybrid**: Constructed core with organic perimeter (fortress over natural caverns, mine complex).
- **Dense**: Rooms-and-mazes algorithm (Nystrom). Fill remaining space with maze, connect regions, trim 80-90% of dead ends. For tight warrens where every square matters.

#### Corridor Standards

- **Standard width:** 2 squares (two characters abreast for tabletop combat).
- **Tight squeeze:** 1 square. Rare, deliberate pressure points only.
- **Major thoroughfare:** 3 squares.
- **Length target:** 3-8 squares. Corridors over 10 squares need features (alcoves, branches, doors).
- **Intersections:** prefer T-junctions. 4-way crossings only at major junctions.

#### Density Bands

- Sparse: 30-40% floor coverage.
- Standard: 40-55%.
- Dense: 55-70%.

#### Multi-Section Connections

Each section defines boundary connectors:

```text
Connector: (edge_side, offset, width, transition_type, destination)

Examples:
  LEFT@15, w=2, direct -> "Central Hall"
  BOTTOM@22, w=3, tunnel -> "Deep Caves"
```

Reciprocity rule: `(LEFT, y=15, w=2)` on Section A must match `(RIGHT, y=15, w=2)` on Section B.

**Transition types:**

1. **Direct seam.** Sections share a wall. Door leads across. Swap battlemats, players continue.
2. **Separation corridor.** Off-map corridor/tunnel. Narrated traversal with optional encounter check. Creates pacing reset.
3. **Vertical.** Stairs, ladders, shafts, pits. Any grid position to any position on another section.

Maximum 2-4 connectors per section edge. Reserve 1-2 squares of margin near edges for labels.

### Layer 4: Presentation

The primary output is an **SVG map** rendered in old-school dungeon style.

#### Old-School Map Style

The target aesthetic is the classic TSR/Judges Guild look: clear, functional, hand-drawn feel.

**Visual characteristics:**

- White or parchment background.
- Black walls with visible thickness (2-3px stroke, filled black or dark grey).
- Light grey or off-white floor fill with subtle grid lines.
- Blue or grey hatching/crosshatch for solid rock beyond walls (optional, classic blue-map style).
- Room numbers in a clean serif or monospace font.
- Simple icons for features: door rectangles, stair arrows, trap symbols, pillar circles.
- No gradients, no drop shadows, no 3D effects.
- Grid squares visible but subtle (light grey lines).

**SVG advantages:**

- Scalable to any print size without quality loss.
- Embeddable in HTML and markdown-rendered documents.
- Programmatically generated from grid data - no image editing required.
- Styleable via CSS classes (swap colour schemes, toggle grid, toggle labels).
- Small file size compared to raster images.
- Can include interactive elements (hover for room descriptions) in web contexts.

**SVG structure:**

```xml
<svg viewBox="0 0 {width*cell} {height*cell}">
  <!-- Background and grid -->
  <g class="grid">...</g>

  <!-- Rock/stone hatching beyond walls -->
  <g class="rock">...</g>

  <!-- Floor areas -->
  <g class="floors">
    <rect class="floor" x="..." y="..." />
  </g>

  <!-- Walls (rendered as thick borders on floor edges) -->
  <g class="walls">
    <line class="wall" x1="..." y1="..." x2="..." y2="..." />
  </g>

  <!-- Doors and features -->
  <g class="features">
    <g class="door" transform="...">...</g>
    <g class="stairs" transform="...">...</g>
  </g>

  <!-- Room labels -->
  <g class="labels">
    <text class="room-label" x="..." y="...">1</text>
  </g>

  <!-- Compass rose (optional) -->
  <g class="compass">...</g>
</svg>
```

**Cell size:** 20px per grid square at default scale. A full 30x44 section renders at 600x880px default, scalable to any size.

#### Secondary Output: ASCII

For quick reference and terminal/markdown contexts, also produce a simple text map:

```text
Structural          Doors               Vertical        Features
  #  Wall             +  Door              >  Down         c  Pillar
  .  Floor            L  Locked            <  Up           T  Trap
  ~  Water            S  Secret                            *  Treasure/POI
  ,  Rubble           P  Portcullis                        =  Altar/table
```

#### Room Key

Each section includes a keyed room list with: node ID, name, dimensions, occupants, trigger behaviour, treasure/lore, exit links.

## Sophisticated Layout Techniques

These are the design rules that make dungeons play well. Apply during topology design (Layer 2). These are the most important ideas in this proposal - they are what separate a thoughtfully designed dungeon from a random room generator.

### 1. Loop-Forward Structure

Never use a single trunk corridor with dead-end branches that force mandatory backtracking.

Targets:

- At least 1 major loop per 4-6 nodes.
- At least 2 independent routes from entry to exit.
- Shortcuts (secret doors, one-way drops) that reward exploration by collapsing return journeys.

### 2. Layered Chokepoints

Use chokepoints in sequence, each with a different bypass option:

- **Outer soft chokepoint:** social or stealth bypass available. Guards who can be talked past, a side entrance that avoids the gatehouse.
- **Mid tactical chokepoint:** combat or hazard challenge. Defended corridor, trapped bridge, patrolled intersection.
- **Inner hard chokepoint:** resource or key pressure. Locked door requiring a specific item, magical ward, environmental barrier.

This creates escalating tension without forcing a single binary gate check. Players choose their approach at each layer.

### 3. Asymmetric Route Quality

When multiple routes exist, make them _different_, not interchangeable:

- **Fast but loud:** main corridor, well-lit, patrolled and echoing.
- **Slow but safe:** back passages, narrow and winding, unguarded.
- **Dangerous but rewarding:** through a monster lair, but treasure and intelligence along the way.
- **Restricted but short:** secret passage, requires discovery or a key, bypasses everything.

This drives meaningful planning. Players weigh cost against benefit rather than picking arbitrarily.

### 4. Territorial Legibility

Map shape should reveal political and territorial reality:

- Barricades and observation points in faction border zones.
- Supply nodes close to faction cores.
- Traps and alarms oriented toward expected invasion vectors, not scattered randomly.
- Noncombatant NPCs sheltered in interior rooms with escape routes.

A player studying the map should be able to infer faction control from the layout alone.

### 5. Vertical and One-Way Pressure

Use drops, ramps, shafts, and one-way doors to create emergent navigation problems:

- A collapsed floor drops players into a lower section - now they need to find a way back up.
- A one-way door locks behind them - the return route goes through different territory.
- A shaft connects two levels but requires climbing gear - accessible one direction, costly the other.

Rule: one-way routes never strand players without a recoverable alternative.

### 6. Information Gating by Space

Place lore, maps, and strategic intelligence in spaces that imply who controls truth:

- An observation post overlooking a key junction - whoever holds it sees approaching threats.
- An archive behind the faction leader's quarters - lore access requires getting past the boss (or finding the secret back entrance).
- A ritual chamber whose inscriptions explain the dungeon's purpose - placed deep enough that casual explorers will not find it.

This ties narrative discovery to tactical movement choices.

## Encounter Ecology

### Territory Model

Each inhabited section defines zones:

- **Core territory:** faction heartland. Strongest defences, leaders, noncombatants.
- **Buffer territory:** patrolled perimeter. Sentries, traps, alarms.
- **Contested territory:** borders between factions or groups. Barricades, signs of skirmishing.
- **Transit territory:** corridors and passages used for movement, not occupation.

Rules:

- Faction cores must be contiguous.
- Command units must not be cut off from support unless isolation is deliberate and narratively justified.
- Noncombatants have plausible shelter positions with escape routes.

### Patrol and Response Logic

Each active faction defines:

| Field              | Description                           |
| ------------------ | ------------------------------------- |
| Patrol loop        | Sequence of nodes visited in order    |
| Interval           | How often the loop completes          |
| Trigger deviations | What causes patrols to break routine  |
| Fallback route     | Where patrols retreat when threatened |
| Rally point        | Where reinforcements gather           |

Patrol loops must cross at least one contested or high-traffic route. Patrols that never encounter players are wasted design.

### Predator and Scavenger Logic

Non-faction creatures placed according to ecology:

- Near chokepoints, refuse zones, water, heat, or high-traffic paths.
- Define what draws them out (noise, light, blood) and what repels them.
- Their presence creates secondary hazards that complicate faction encounters.

### Hazard Placement

Every hazard must justify its existence:

- Why do inhabitants avoid or weaponise it?
- What signs telegraph danger to observant players?
- Which routes bypass it?
- How does it interact with nearby encounters?

## Section Specification Packet

Each section is documented as a single markdown file:

1. **Section Metadata** - ID, level, theme, pressure, session load, promise
2. **Tactical Footprint** - dimensions, orientation, density, layout strategy
3. **Topology Summary** - node list, edge list, loops and critical paths described
4. **Section Map** - SVG graphic (embedded or linked) plus ASCII fallback
5. **Room Key** - per-room entries with occupants, triggers, treasure, exits
6. **Transition Connectors** - boundary connections to other sections
7. **Encounter Ecology** - territory zones, patrol tables, creature behaviour
8. **Dynamic Behaviour** - timers, triggered events, escalation sequences
9. **Validation Checklist** - pass/fail against topology, tactical, ecology, usability gates
10. **DM Quick-Run Notes** - how to run this section with 30 seconds of prep review

### Required Tables

**Node Inventory:**

| Node | Type | Name | Occupants | Tactical Role |
| ---- | ---- | ---- | --------- | ------------- |

**Edge/Connection:**

| From | To  | Type | Bidir | Gate | Width | Noise |
| ---- | --- | ---- | ----- | ---- | ----- | ----- |

**Transition Connectors:**

| Connector | Side | Offset | Width | Type | Destination |
| --------- | ---- | ------ | ----- | ---- | ----------- |

**Patrols:**

| Patrol | Owner | Route | Interval | Triggers | Fallback |
| ------ | ----- | ----- | -------- | -------- | -------- |

## Validation Checklist

Every section packet should pass these before play:

### Topology

- [ ] Fits within 30 x 44 maximum
- [ ] Entry and exit reachable via at least two independent routes
- [ ] No mandatory single-edge failure point for progression
- [ ] At least one loop exists
- [ ] At least one optional area with meaningful reward

### Tactical

- [ ] At least one area supports open engagement (room >= medium size)
- [ ] At least one stealth or bypass route exists
- [ ] Fallback/retreat path from each major fight space
- [ ] Major set-piece not forced into a narrow corridor

### Ecology

- [ ] Every creature group has coherent territory and purpose
- [ ] Patrol routes cross player-relevant paths
- [ ] Hazard placement changes movement behaviour

### DM Usability

- [ ] Section drawable from packet in under 10 minutes
- [ ] Navigation options from any hub explainable in under 30 seconds
- [ ] Wandering encounter insertion points pre-marked

## Generation Pipeline

```text
intent    = define_intent(theme, pressure, session_load)
graph     = generate_topology(intent, room_count)
validated = validate_topology(graph)    // check rules before layout
grid      = layout_geometry(graph, { width: 30, height: 44, style, connections })
grid      = route_corridors(grid, graph)
grid      = populate_ecology(grid, graph, intent)
svg       = render_svg(grid, graph, { style: 'oldschool' })
ascii     = render_ascii(grid, graph)
packet    = render_packet(grid, graph, intent, svg, ascii)
```

Each stage is independently testable. Failed layouts retry with different partitioning without regenerating the topology.

### Algorithm Selection

| Strategy    | Algorithm                          | Best for                              |
| ----------- | ---------------------------------- | ------------------------------------- |
| Constructed | BSP partitioning                   | Forts, temples, tombs, prisons        |
| Organic     | Force-directed + cellular automata | Caves, ruins, warrens                 |
| Hybrid      | BSP core + CA perimeter            | Fortress-over-caverns, mine complexes |
| Dense       | Rooms-and-mazes (Nystrom)          | Tight labyrinths, anthill warrens     |

## Worked Example

### Example Intent

```text
Section: Gatehouse Ruin
Level: 1
Theme: Goblin-occupied dwarven gatehouse, crudely repurposed
Pressure: Faction (goblins) + hazard (unstable masonry)
Session Load: Standard (5 encounters)
Promise: Players breach the outer defences and discover
  the goblins are fortifying against something deeper.
```

### Example Topology

```text
Nodes:
  E1: Entry (collapsed gate)
  G1: Guard Post (sentry position overlooking entry)
  H1: Hub - Gatehouse Hall (main crossroads)
  R1: Barracks (sleeping quarters)
  R2: Armoury (weapon storage)
  R3: Kitchen/Well (water source)
  F1: Faction Core - Boss Room
  S1: Secret - Old Vault (behind collapsed wall)
  X1: Exit - Stairs Down

Edges:
  E1 --[door]--> G1
  G1 --[open]--> H1
  H1 --[open]--> R1
  H1 --[door]--> R3
  H1 --[locked]--> F1
  R1 --[open]--> R2
  R3 --[open]--> X1
  F1 --[secret]--> S1
  F1 --[door]--> X1
  R2 --[secret]--> H1

Loops:
  H1 -> R3 -> X1 -> F1 -> H1  (bypass locked door via kitchen)
  H1 -> R1 -> R2 --secret--> H1  (shortcut through armoury)

Layered chokepoints:
  Outer: G1 guard post (social bypass: bribe, disguise)
  Mid: H1 hall patrol (tactical: fight or time the gap)
  Inner: F1 locked door (key from boss, pick lock, or kitchen bypass)

Route quality:
  Direct: E1 -> G1 -> H1 -> F1 -> X1 (fast, loud, every guard alerted)
  Kitchen: E1 -> G1 -> H1 -> R3 -> X1 (slow, quiet, avoids boss)
  Secret: R2 secret door back to H1 (restricted, requires discovery)
```

### Layer 3: Geometry (22 x 20)

```text
######################
#........#...........#
#..E1....+....G1.....#
#........#.....c.....#
#........######+######
#.................R1.#
#....H1...+...#......#
#.........#...#..R2..#
#....+....#...#......#
#....#....#...S......#
#.##L##...#####..#####
#...........#........#
#....F1.....#...R3...#
#.......S...+........#
#...........#...~....#
#...*....#..#........#
#........#..####.#.###
#..S1....#.....>.....#
#........#...........#
######################
```

### Layer 4: SVG Output

The SVG renderer would produce this section as a ~440x400px graphic (at 20px/cell) with:

- Black filled walls with 2px stroke.
- Off-white floor tiles with subtle grid.
- Door symbols as small filled rectangles breaking wall lines.
- Secret doors as dashed wall segments.
- Room numbers (1-9) centred in each room.
- Stair symbol (arrow pointing down) at X1.
- Pillar at G1 as a small filled circle.
- Well at R3 as a small circle with wavy line.
- Treasure at S1 as a small star or diamond.
- Optional: blue crosshatch fill on rock areas surrounding the dungeon.

### Example Room Key

```text
E1: Collapsed Gate (6x4) - Rubble-strewn entrance, difficult terrain.
    DC 12 Perception spots sentries at G1.

G1: Guard Post (6x5) - 2 goblin sentries behind arrow slit (3/4 cover).
    Pillar provides player cover. Alarm horn on wall; if sounded,
    R1 responds in 2 rounds.

H1: Gatehouse Hall (6x5) - Central hub, 3 visible exits. Locked door
    to F1 (DC 15 Thieves' Tools / DC 20 Strength).

R1: Barracks (5x5) - 4 goblins (2 sleeping, 2 dicing). Respond to
    alarm from G1.

R2: Armoury (4x5) - Crude weapons. DC 14 Investigation finds loose
    stone concealing secret passage back to H1.

R3: Kitchen/Well (5x6) - Cooking fire, well. 1 noncombatant cook
    (flees toward X1). The quiet way down.

F1: Boss Room (6x6) - Hobgoblin boss + 1 bodyguard. Locked chest
    (DC 13): 45gp, crude map hinting at deeper threat.
    DC 16 Perception: crack in east wall (secret door to S1).

S1: Old Vault (4x5) - Undisturbed. Stone coffer: 120gp, signet ring
    (plot hook). Carved warning inscription.
```

### Example Ecology

```text
Territory:
  Core: F1, R1
  Buffer: G1, H1, R2
  Transit: R3, E1
  Secret: S1 (unknown to inhabitants)

Patrol: 2 goblins cycle G1 -> H1 -> R3 -> H1 -> G1 every 15 min.
  Alarm: patrol abandons route, reinforces G1.
  Killed: replacement from R1 after 30 min.

Boss response:
  Combat noise at F1: bars door, bodyguard readies.
  Breached: fights to half HP, retreats via X1.
  Does not know about S1.
```

### Validation

- [x] Fits 30x44 (actual: 22x20)
- [x] Two routes E1 to X1 (via F1, via R3)
- [x] Two loops (hub-kitchen-stairs-boss, hub-barracks-armoury-hub)
- [x] No single-edge failure point
- [x] Optional secret area (S1)
- [x] Open fight spaces (H1, F1)
- [x] Stealth route (R3 kitchen path)
- [x] Retreat paths from F1
- [x] All creatures have territory and purpose
- [x] Patrol crosses player path (H1)
- [x] Drawable in under 10 minutes

## Implementation Plan

### Module Structure

```text
src/
  map/
    intent.js        - Section intent definition and validation
    topology.js      - Graph generation and topology rules
    geometry.js      - Room placement algorithms (BSP, force-directed, CA)
    corridors.js     - Corridor routing (L-shaped, A*)
    ecology.js       - Territory, patrol, and creature placement logic
    render-svg.js    - Old-school SVG map renderer
    render-ascii.js  - ASCII fallback renderer
    validate.js      - Validation checklist runner
    packet.js        - Section packet markdown generator
```

### Implementation Sequence

1. **Data model and topology** (`topology.js`, `validate.js`): Define graph structures, implement topology rules and validation. This is testable with no rendering.

2. **Geometry: constructed layout** (`geometry.js`): BSP partitioning for rectangular dungeon layouts. This is the most common case and should work first.

3. **Corridor routing** (`corridors.js`): L-shaped and A\* corridor generation between placed rooms.

4. **SVG renderer** (`render-svg.js`): Old-school map output. Walls, floors, doors, features, labels. CSS-styleable.

5. **ASCII renderer** (`render-ascii.js`): Text fallback.

6. **Packet generator** (`packet.js`): Assemble section specification markdown from all layers.

7. **Ecology pass** (`ecology.js`): Territory assignment, patrol route generation, creature placement validation.

8. **Geometry: organic layout** (`geometry.js`): Force-directed and cellular automata for cave sections. Second priority after constructed works.

### Testing

Each module is independently testable:

- Topology: validate graph properties (loops, path count, guard placement) without geometry.
- Geometry: validate room placement (no overlaps, fits grid, matches graph) without rendering.
- Corridors: validate connectivity (all graph edges have physical paths) without rendering.
- SVG: validate output structure (valid SVG, all rooms labelled, all features placed).
- Validation: run full checklist on generated sections and verify pass/fail.

### Integration with Existing Pipeline

The map module produces:

- SVG file (embeddable in Google Docs via the existing image pipeline).
- ASCII text (embeddable in markdown source).
- Section packet markdown (publishable alongside campaign prose).

These feed into the existing `markdown-converter.js` and `document-manager.js` pipeline.

## Converting Existing Content

No fixed schedule. Convert sections as they come up for play:

1. Write intent (Layer 1) from existing prose.
2. Extract topology graph from existing room descriptions.
3. Generate or hand-place geometry to fit 30x44.
4. Produce section packet and SVG map.

Existing narrative prose remains valid. The packet adds tactical structure alongside it.
