# Map Prompt Packet: Gatehouse Ruin

## Workflow

1. Attach the listed reference images to your image model.
2. Paste the final prompt after the references are attached.
3. Review the first pass against the checklist before asking for revisions.

## Metadata

| Field   | Value                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------- |
| ID      | gatehouse-ruin                                                                                      |
| Title   | Gatehouse Ruin                                                                                      |
| Level   | 1                                                                                                   |
| Chapter | Act I                                                                                               |
| Theme   | Goblin-occupied dwarven gatehouse                                                                   |
| Promise | Players breach the outer defences and discover the goblins are fortifying against something deeper. |

## Reference Images

| Ref                     | Path                                        | Focus                                                                                      | Usage                                                                              |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Primary style reference | ./private-reference/gatehouse-blueprint.jpg | old-school blue-draft wall language, restrained hatching, and clear door and stair symbols | Match the visual language and readability, but do not copy the source composition. |

## Deliverable

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| Format       | single top-down dungeon map                         |
| Aspect Ratio | portrait, roughly 30 by 44 squares                  |
| Camera       | straight top-down orthographic view                 |
| Grid         | subtle square grid visible over walkable space only |
| Labels       | room numbers only, no full room names               |
| Legend Items | doors, stairs, secret door, well, barricade         |

## Area Schedule

### 1. Collapsed Gate

- Role: entry breach point
- Description: The outer gatehouse has partially failed, leaving a rubble funnel that attackers must force their way through.
- Connections: 2. Guard Post, 3. Gatehouse Hall
- Exits: ←Surface road
- Must Include: broken portcullis remains, masonry rubble choke point, partial line of sight into the hall

### 2. Guard Post

- Role: forward sentry position
- Description: A defended stop between the breach and the main interior, sized for a short skirmish and alarm response.
- Connections: 1. Collapsed Gate, 3. Gatehouse Hall
- Must Include: makeshift goblin barricade, clear sightline toward the breach, room number placement that does not obscure the choke point

### 3. Gatehouse Hall

- Role: main hub
- Description: The largest central circulation space, connecting the sentry zone to the support rooms and deeper command spaces.
- Connections: 1. Collapsed Gate, 2. Guard Post, 4. Barracks, 5. Armoury, 6. Kitchen Well, 7. Boss Room
- Must Include: clear central room mass, multiple readable exits, dwarven stone geometry with goblin clutter

### 4. Barracks

- Role: occupied troop room
- Description: A cramped but usable sleeping space for rank-and-file goblins just off the main hall.
- Connections: 3. Gatehouse Hall, 5. Armoury
- Must Include: simple bunk or bedroll cues, tight but traversable footprint, quick path back to the hall

### 5. Armoury

- Role: supply room
- Description: A compact side room holding scavenged weapons and gear, with one more hidden or indirect access option.
- Connections: 4. Barracks, 3. Gatehouse Hall
- Must Include: weapon rack or crate cues, stout dwarven walls, a hint that this room is less obvious from the main path

### 6. Kitchen Well

- Role: support room
- Description: A service space with a well and simple cooking setup that makes the ruin feel occupied rather than abandoned.
- Connections: 3. Gatehouse Hall, 8. Stairs Down
- Must Include: visible well feature, cooking or storage cues, easy route onward to the stairs

### 7. Boss Room

- Role: command space
- Description: The most imposing room in the section, where the goblin leader holds court and reacts to threats from the entrance.
- Connections: 3. Gatehouse Hall, 8. Stairs Down, 9. Old Vault
- Must Include: dominant focal point or dais, better defensive position than the outer rooms, strong silhouette compared with the rest of the map

### 8. Stairs Down

- Role: exit to deeper danger
- Description: A clear descent point that promises a second phase below the gatehouse.
- Connections: 6. Kitchen Well, 7. Boss Room
- Exits: ↓Lower vaults
- Must Include: obvious stair symbol, clear placement near the back half of the map, enough breathing room to read as an exit

### 9. Old Vault

- Role: secret reward room
- Description: A smaller hidden chamber tied to the boss space, useful for treasure or lore payoff.
- Connections: 7. Boss Room
- Must Include: subtle or tucked-away placement, older dwarven character than the goblin rooms, a sense of being discoverable but not obvious

## Flow

1. Players should read the map from the collapsed gate through a guarded choke point into a hub that branches into practical side rooms and one commanding set-piece room.
2. The support spaces should feel plausibly useful to the occupants, not randomly scattered.
3. The stairs down and the hidden vault should both sit deeper in the composition than the breach and guard rooms.

## Composition Notes

- Keep the overall silhouette legible at a glance, with a clear front half and a deeper defended back half.
- Use room shapes and wall thickness to suggest solid dwarven construction, then layer goblin improvisation on top.
- Favor clear traversal and room identity over clever geometric tricks.
- Room numbers must stay distinct and unobscured, especially around the breach, stairs, and tucked-away vault.

## Final Prompt

```text
Create a single top-down fantasy dungeon map for tabletop play.
Project title: Gatehouse Ruin.
Theme: Goblin-occupied dwarven gatehouse.
Play promise: Players breach the outer defences and discover the goblins are fortifying against something deeper.
Use the attached reference images for visual language, symbols, and surface treatment, but invent a fresh layout instead of copying any reference composition.
Reference image "Primary style reference": Focus on old-school blue-draft wall language, restrained hatching, and clear door and stair symbols. Usage guidance: Match the visual language and readability, but do not copy the source composition.
Deliverable: single top-down dungeon map. Frame it for portrait, roughly 30 by 44 squares. Camera: straight top-down orthographic view. Grid treatment: subtle square grid visible over walkable space only. Labels: room numbers only, no full room names. Bottom panel MUST be included: white background legend showing short labels under symbols: doors, stairs, secret door, well, barricade.
Visual direction: classic blue-draft dungeon cartography with clean linework and readable room masses. Palette: muted blue ink, pale floor fill, controlled dark accents. Linework: clean hand-drafted walls, solid floor shapes, simple old-school symbols. Lighting: flat diagrammatic lighting with no dramatic shadows. Atmosphere: occupied defensive ruin where sturdy dwarven stonework has been repurposed by goblins.
Required areas and adjacencies:
1. Collapsed Gate: Role: entry breach point. The outer gatehouse has partially failed, leaving a rubble funnel that attackers must force their way through. Connect directly to 2. Guard Post, 3. Gatehouse Hall. Must include explicit exit arrows at edge of map: ←Surface road. Must include broken portcullis remains, masonry rubble choke point, partial line of sight into the hall.
2. Guard Post: Role: forward sentry position. A defended stop between the breach and the main interior, sized for a short skirmish and alarm response. Connect directly to 1. Collapsed Gate, 3. Gatehouse Hall. Must include makeshift goblin barricade, clear sightline toward the breach, room number placement that does not obscure the choke point.
3. Gatehouse Hall: Role: main hub. The largest central circulation space, connecting the sentry zone to the support rooms and deeper command spaces. Connect directly to 1. Collapsed Gate, 2. Guard Post, 4. Barracks, 5. Armoury, 6. Kitchen Well, 7. Boss Room. Must include clear central room mass, multiple readable exits, dwarven stone geometry with goblin clutter.
4. Barracks: Role: occupied troop room. A cramped but usable sleeping space for rank-and-file goblins just off the main hall. Connect directly to 3. Gatehouse Hall, 5. Armoury. Must include simple bunk or bedroll cues, tight but traversable footprint, quick path back to the hall.
5. Armoury: Role: supply room. A compact side room holding scavenged weapons and gear, with one more hidden or indirect access option. Connect directly to 4. Barracks, 3. Gatehouse Hall. Must include weapon rack or crate cues, stout dwarven walls, a hint that this room is less obvious from the main path.
6. Kitchen Well: Role: support room. A service space with a well and simple cooking setup that makes the ruin feel occupied rather than abandoned. Connect directly to 3. Gatehouse Hall, 8. Stairs Down. Must include visible well feature, cooking or storage cues, easy route onward to the stairs.
7. Boss Room: Role: command space. The most imposing room in the section, where the goblin leader holds court and reacts to threats from the entrance. Connect directly to 3. Gatehouse Hall, 8. Stairs Down, 9. Old Vault. Must include dominant focal point or dais, better defensive position than the outer rooms, strong silhouette compared with the rest of the map.
8. Stairs Down: Role: exit to deeper danger. A clear descent point that promises a second phase below the gatehouse. Connect directly to 6. Kitchen Well, 7. Boss Room. Must include explicit exit arrows at edge of map: ↓Lower vaults. Must include obvious stair symbol, clear placement near the back half of the map, enough breathing room to read as an exit.
9. Old Vault: Role: secret reward room. A smaller hidden chamber tied to the boss space, useful for treasure or lore payoff. Connect directly to 7. Boss Room. Must include subtle or tucked-away placement, older dwarven character than the goblin rooms, a sense of being discoverable but not obvious.
Map flow and player-facing sequencing:
- Players should read the map from the collapsed gate through a guarded choke point into a hub that branches into practical side rooms and one commanding set-piece room.
- The support spaces should feel plausibly useful to the occupants, not randomly scattered.
- The stairs down and the hidden vault should both sit deeper in the composition than the breach and guard rooms.
Additional composition notes:
- Keep the overall silhouette legible at a glance, with a clear front half and a deeper defended back half.
- Use room shapes and wall thickness to suggest solid dwarven construction, then layer goblin improvisation on top.
- Favor clear traversal and room identity over clever geometric tricks.
- Room numbers must stay distinct and unobscured, especially around the breach, stairs, and tucked-away vault.
Avoid: photorealism, isometric or perspective view, characters or creature tokens, heavy painterly textures, text labels beyond room numbers.
```

## Negative Prompt

- photorealism
- isometric or perspective view
- characters or creature tokens
- heavy painterly textures
- text labels beyond room numbers

## Revision Checklist

- [ ] The map feels original while still borrowing the reference image's drafting language.
- [ ] The front-to-back progression from breach to defended core is visually obvious.
- [ ] The well, stairs, and boss space are instantly readable at tabletop scale.
- [ ] Room numbers remain clear without cluttering the drawing.
- [ ] Edge exits and legend symbols match the authored brief exactly.
