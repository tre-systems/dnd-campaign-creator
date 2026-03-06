# Map Generation Prompt

**Instructions for AI:**
You are an expert fantasy cartographer. I need you to draw a D&D dungeon map using the structural and thematic guidance below.
Use the exact structural and thematic information provided.

- **Theme**: Goblin-occupied dwarven gatehouse
- **Grid Size**: 30 x 44 (1 unit = 5 feet)
- **Style**: Classic blue-draft dungeon aesthetic, solid light floors, textured rock borders with restrained hatching and stippling, and clean hand-drafted linework.
- **Content**: Top-down 2D view. Use standard old-school map symbols (doors, stairs, pillars). Include room numbers from the Room Key.
- **Grid**: Overlay a subtle square grid over the walkable floor areas.

## Room Layout Details

- **Room 1 (Boss Room)**: Located at (12, 35), size 12x7. Shape: cave. Type: faction-core.
- **Room 2 (Guard Post)**: Located at (14, 24), size 12x6. Shape: rect. Type: guard.
- **Room 3 (Kitchen/Well)**: Located at (3, 27), size 6x11. Shape: circle. Type: resource.
- **Room 4 (Collapsed Gate)**: Located at (15, 8), size 9x5. Shape: circle. Type: entry.
- **Room 5 (Gatehouse Hall)**: Located at (4, 7), size 8x5. Shape: cross. Type: hub.
- **Room 6 (Stairs Down)**: Located at (3, 16), size 6x6. Shape: rect. Type: exit.
- **Room 7 (Barracks)**: Located at (16, 16), size 12x3. Shape: rect. Type: standard.
- **Room 8 (Armoury)**: Located at (17, 2), size 9x2. Shape: rect. Type: resource.
- **Room 9 (Old Vault)**: Located at (3, 2), size 8x3. Shape: rect. Type: secret.

## Corridor and Connector Routing

The rooms are connected by a network of corridors. Follow the topology graph and spatial data provided in the Technical Reference section below to ensure accurate placement of doors and passages.

Please generate the map image directly matching these specifications.

## Section Metadata: Goblin-occupied dwarven gatehouse

| Field           | Value          |
| --------------- | -------------- |
| Section ID      | gatehouse-ruin |
| Level           | 1              |
| Chapter         | Act I          |
| Pressure        | faction        |
| Session Load    | standard       |
| Layout Strategy | constructed    |

**Promise:** Players breach the outer defences and discover the goblins are fortifying against something deeper.

## Tactical Footprint

| Field      | Value                         |
| ---------- | ----------------------------- |
| Dimensions | 30 x 44                       |
| Density    | 36% floor coverage (standard) |
| Rooms      | 9                             |
| Corridors  | 12                            |

## Topology

### Node Inventory

| Node | Type         | Name           | Occupants                    | Size   |
| ---- | ------------ | -------------- | ---------------------------- | ------ |
| E1   | entry        | Collapsed Gate | -                            | medium |
| G1   | guard        | Guard Post     | 2 goblin sentries            | medium |
| H1   | hub          | Gatehouse Hall | -                            | medium |
| R1   | standard     | Barracks       | 4 goblins                    | small  |
| R2   | resource     | Armoury        | -                            | small  |
| R3   | resource     | Kitchen/Well   | 1 noncombatant cook          | medium |
| F1   | faction-core | Boss Room      | Hobgoblin boss + 1 bodyguard | large  |
| S1   | secret       | Old Vault      | -                            | small  |
| X1   | exit         | Stairs Down    | -                            | small  |

### Connections

| From | To  | Type   | Bidir | Width    |
| ---- | --- | ------ | ----- | -------- |
| E1   | G1  | door   | Y     | standard |
| G1   | H1  | open   | Y     | standard |
| H1   | R1  | open   | Y     | standard |
| H1   | R3  | door   | Y     | standard |
| H1   | F1  | locked | Y     | standard |
| R1   | R2  | open   | Y     | standard |
| R3   | X1  | open   | Y     | standard |
| F1   | S1  | secret | Y     | standard |
| F1   | X1  | door   | Y     | standard |
| R2   | H1  | secret | Y     | standard |
| E1   | H1  | open   | Y     | standard |

## Spatial Layout (Technical Reference)

### Room Placement

| Room | X   | Y   | W   | H   | Shape  |
| ---- | --- | --- | --- | --- | ------ |
| 1    | 12  | 35  | 12  | 7   | cave   |
| 2    | 14  | 24  | 12  | 6   | rect   |
| 3    | 3   | 27  | 6   | 11  | circle |
| 4    | 15  | 8   | 9   | 5   | circle |
| 5    | 4   | 7   | 8   | 5   | cross  |
| 6    | 3   | 16  | 6   | 6   | rect   |
| 7    | 16  | 16  | 12  | 3   | rect   |
| 8    | 17  | 2   | 9   | 2   | rect   |
| 9    | 3   | 2   | 8   | 3   | rect   |

### Corridor Paths

| Edge              | Path (X,Y Coordinates)                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1 to G1          | (19,13) -> (19,14) -> (19,15) -> (18,15) -> (17,15) -> (16,15) -> (15,15) -> (15,16) -> (15,17) -> (15,18) -> (15,19) -> (16,19) -> (17,19) -> (18,19) -> (19,19) -> (19,20) -> (19,21) -> (19,22) -> (19,23)                                                                                                                                                                                                |
| G1 to H1          | (14,23) -> (14,22) -> (14,21) -> (14,20) -> (14,19) -> (15,19) -> (15,18) -> (15,17) -> (15,16) -> (15,15) -> (14,15) -> (13,15) -> (12,15) -> (11,15) -> (10,15) -> (10,14) -> (10,13) -> (10,12)                                                                                                                                                                                                           |
| H1 to R1          | (12,10) -> (12,11) -> (12,12) -> (12,13) -> (12,14) -> (12,15) -> (13,15) -> (14,15) -> (15,15) -> (15,16)                                                                                                                                                                                                                                                                                                   |
| H1 to R3          | (6,12) -> (6,13) -> (6,14) -> (6,15) -> (7,15) -> (8,15) -> (9,15) -> (9,16) -> (9,17) -> (9,18) -> (9,19) -> (9,20) -> (9,21) -> (9,22) -> (8,22) -> (7,22) -> (6,22) -> (6,23) -> (6,24) -> (6,25) -> (6,26)                                                                                                                                                                                               |
| H1 to F1          | (10,12) -> (10,13) -> (10,14) -> (10,15) -> (11,15) -> (12,15) -> (13,15) -> (14,15) -> (15,15) -> (15,16) -> (15,17) -> (15,18) -> (15,19) -> (14,19) -> (14,20) -> (14,21) -> (14,22) -> (14,23) -> (13,23) -> (13,24) -> (13,25) -> (13,26) -> (13,27) -> (13,28) -> (13,29) -> (13,30) -> (13,31) -> (13,32) -> (13,33) -> (13,34)                                                                       |
| R1 to R2          | (21,15) -> (22,15) -> (22,14) -> (22,13) -> (22,12) -> (23,12) -> (23,11) -> (24,11) -> (24,10) -> (24,9) -> (23,9) -> (23,8) -> (22,8) -> (22,7) -> (22,6) -> (22,5) -> (22,4)                                                                                                                                                                                                                              |
| R3 to X1          | (6,26) -> (6,25) -> (6,24) -> (6,23) -> (6,22)                                                                                                                                                                                                                                                                                                                                                               |
| F1 to S1          | (13,34) -> (13,33) -> (13,32) -> (13,31) -> (13,30) -> (13,29) -> (13,28) -> (13,27) -> (13,26) -> (13,25) -> (13,24) -> (13,23) -> (14,23) -> (14,22) -> (14,21) -> (14,20) -> (14,19) -> (15,19) -> (15,18) -> (15,17) -> (15,16) -> (15,15) -> (14,15) -> (13,15) -> (12,15) -> (12,14) -> (12,13) -> (12,12) -> (12,11) -> (12,10) -> (12,9) -> (12,8) -> (12,7) -> (11,7) -> (11,6) -> (10,6) -> (10,5) |
| F1 to X1          | (13,34) -> (13,33) -> (13,32) -> (13,31) -> (13,30) -> (13,29) -> (13,28) -> (13,27) -> (13,26) -> (13,25) -> (13,24) -> (13,23) -> (12,23) -> (11,23) -> (10,23) -> (9,23) -> (9,22) -> (8,22)                                                                                                                                                                                                              |
| R2 to H1          | (16,3) -> (15,3) -> (14,3) -> (13,3) -> (12,3) -> (12,4) -> (12,5) -> (12,6) -> (12,7) -> (12,8)                                                                                                                                                                                                                                                                                                             |
| E1 to H1          | (14,10) -> (13,10) -> (12,10)                                                                                                                                                                                                                                                                                                                                                                                |
| connector:1 to F1 | (15,42)                                                                                                                                                                                                                                                                                                                                                                                                      |

## Room Key

**1. Boss Room** (12x7, large)

- Occupants: Hobgoblin boss + 1 bodyguard
- Type: faction-core
- Sightline: open
- Retreat: X1

**2. Guard Post** (12x6, medium)

- Occupants: 2 goblin sentries
- Type: guard
- Sightline: partial
- Retreat: H1

**3. Kitchen/Well** (6x11, medium)

- Occupants: 1 noncombatant cook
- Type: resource
- Sightline: open
- Retreat: X1

**4. Collapsed Gate** (9x5, medium)

- Type: entry
- Sightline: open
- Retreat: G1

**5. Gatehouse Hall** (8x5, medium)

- Type: hub
- Sightline: open
- Retreat: R1, R3, F1

**6. Stairs Down** (6x6, small)

- Type: exit
- Sightline: partial
- Retreat: R3, F1

**7. Barracks** (12x3, small)

- Occupants: 4 goblins
- Type: standard
- Sightline: blocked
- Retreat: H1

**8. Armoury** (9x2, small)

- Type: resource
- Sightline: blocked
- Retreat: R1

**9. Old Vault** (8x3, small)

- Type: secret
- Sightline: blocked

## Transition Connectors

| Connector | Side   | Offset | Width | Type     | Destination |
| --------- | ------ | ------ | ----- | -------- | ----------- |
| C1        | bottom | 15     | 3     | vertical | Deep Caves  |

## Encounter Ecology

Territory and patrol model derived from topology depth, room role, and section pressure.

### Territory Zones

| Zone      | Rooms                                                                       | Description                                           | Control                  | Response                             |
| --------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | ------------------------------------ |
| Perimeter | 4 (Collapsed Gate); 2 (Guard Post); 5 (Gatehouse Hall)                      | First-contact ring. Delay intruders and raise alarms. | Sentry-controlled        | Delay and signal.                    |
| Transit   | -                                                                           | Circulation band linking wings and support rooms.     | Lightly held             | Screen and fall back to chokepoints. |
| Core      | 7 (Barracks); 8 (Armoury); 3 (Kitchen/Well); 1 (Boss Room); 6 (Stairs Down) | Command/treasure depth where defenders concentrate.   | Primary faction hold     | Hold position and counterattack.     |
| Hidden    | 9 (Old Vault)                                                               | Irregular spaces outside routine movement.            | Low traffic / hidden use | Ambush or opportunistic withdrawal.  |

### Patrols

| Patrol | Owner              | Route       | Interval | Triggers                                     | Fallback |
| ------ | ------------------ | ----------- | -------- | -------------------------------------------- | -------- |
| P1     | 2 (Guard Post)     | 2 -> 5 -> 7 | 15 min   | Missing sentry, alarm gong, or blocked route | 7        |
| P2     | 5 (Gatehouse Hall) | 5 -> 7      | 15 min   | Missing sentry, alarm gong, or blocked route | 7        |
| P3     | 1 (Boss Room)      | 1 -> 6      | 15 min   | Missing sentry, alarm gong, or blocked route | 7        |

## Dynamic Behaviour

Escalation clocks and reactive movement generated from section pressure and patrol ownership.

| Clock     | Trigger                                                                                       | Effect                                                                          | Reset                                  |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Suspicion | Disturbance in 4 (Collapsed Gate); 2 (Guard Post); 5 (Gatehouse Hall)                         | Patrol P1 re-runs route (2 -> 5 -> 7) with no detours.                          | 20 minutes with no new signs           |
| Alerted   | Combat/noise in -                                                                             | Reinforcements move to nearest chokepoint and lock contested doors.             | 45 minutes with no contact             |
| Committed | Core threatened (7 (Barracks); 8 (Armoury); 3 (Kitchen/Well); 1 (Boss Room); 6 (Stairs Down)) | Defenders abandon perimeter and concentrate on core defence or evacuation path. | End of scene / regroup outside section |

### Escalation Sequence

1. Initial contact pressure follows **faction** cues and starts at perimeter routes.
2. Patrol cadence is **15 min**; skipped check-ins immediately escalate one clock step.
3. Once committed, defenders preserve one fallback route and deny all secondary routes until reset.

## Validation Checklist

- [x] Grid size: 30x44 within 60x60 limit
- [x] Entry and exit exist: 1 entry, 1 exit
- [x] Guard placement: All 1 guards within 2 edges of entry
- [x] Boss/treasure depth: All high-value nodes at depth >= 2 from entry
- [x] Loop count: 3 loops (need >= 2 for 9 nodes)
- [x] Two independent routes: 2 independent routes from E1 to X1
- [x] Dead end justification: All dead ends justified
- [x] One-way safety: No one-way edges
- [x] Rooms within bounds: All rooms within grid bounds
- [x] No room overlaps: No room overlaps
- [x] All nodes placed: All 9 nodes have placed rooms
- [x] Large room exists: At least one large room present
- [x] Connectors connected: All 1 connectors connect to playable space

## DM Quick-Run Notes

**Theme:** Goblin-occupied dwarven gatehouse
**Promise:** Players breach the outer defences and discover the goblins are fortifying against something deeper.

**Entry points:** E1 (Collapsed Gate)
**Exit points:** X1 (Stairs Down)
**Hub rooms:** H1 (Gatehouse Hall)

### Key Decision Points

- **Gatehouse Hall:** connects to G1 (open), R1 (open), R3 (door), F1 (locked), R2 (secret), E1 (open)
