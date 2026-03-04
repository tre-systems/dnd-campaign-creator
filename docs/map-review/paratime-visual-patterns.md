# Paratime Blue Dungeon Maps: Visual Feature and Pattern Inventory

This document records a visual analysis of the local Paratime reference set in:

- `docs/map-review/references/paratime/` (20 maps: `bluemap001.jpg` to `bluemap021b.jpg`, with `005` missing in the source set)

The goal is to capture recurring map-language rules and stylistic patterns as a concrete reference for map generation work.

## 1. Global Visual Language

- Blueprint palette is strongly two-tone: medium blue background + white playable space.
- Most linework uses one cyan/blue ink family (not black), with value changes rather than hue shifts.
- Visual hierarchy is consistent:
- background blue field (dominant)
- white rooms/corridors (shape masses)
- pale grid lines
- medium-blue walls and symbols
- little to no heavy shading in rooms
- The style reads as clean technical drafting, not painterly illustration.
- Approximate dominant color clusters across the set:
- background mass around `#4393be`
- bright playable white around `#fcfdfe`
- secondary line tones around `#cde2ec` and `#8bbcd5`

## 2. Spatial Grid and Scale Conventions

- Square grid is explicit and visible inside playable space.
- Scale callout is repeatedly included: one square equals `10 ft by 10 ft`.
- Geometry is grid-snapped by default.
- Corridors are primarily one-cell wide (10 ft).
- Wider passage experiences are usually represented by larger rooms, vestibules, or broadened nodes rather than long 2-cell corridors.

## 3. Geometry and Shape Vocabulary

- Dominant room shape is orthogonal rectangle/square.
- Frequent secondary shapes:
- circles
- ovals/ellipses
- chamfered polygons (octagon-like)
- diamonds/arrowheads
- rounded-end capsules
- clover/trefoil-like set-piece rooms
- Irregular cave zones appear as organic white blobs with smooth outlines.
- Diagonal corridors exist and are used deliberately as special connectors.
- Curved corridor segments appear occasionally, mostly as accent transitions.
- Many maps mix strict geometry with one or two organic cave sectors for contrast.

## 4. Topology and Layout Patterns

- High connectivity is common: loops, alternate routes, and multiple return paths.
- Repeated archetypes:
- hub-and-spoke clusters connected to side wings
- long spine corridors with branch rooms
- ring-like circulation around central set-piece areas
- “maze quarter” embedded inside a larger orthogonal dungeon
- Set-piece chambers are often centrally located or visually emphasized with unusual shapes.
- Dead ends are present but usually purposeful (treasure, trap, secret, special room).
- Map complexity scales from moderate (~20 rooms) to dense (~50+ labels) while preserving readability.

## 5. Door, Threshold, and Passage Grammar

- Standard doors are tiny rectangular threshold symbols centered on wall breaks.
- Door placement is logical: always on room/corridor boundaries, not floating.
- Secret doors are marked with an `S` cue near thresholds.
- False-door style appears in legend vocabulary and is represented as a wall-edge cue.
- Some thresholds are visually emphasized (paired/major entrances), especially for set-piece rooms.
- Curtain/tapestry thresholds are represented with wavy vertical lines.

## 6. Symbol Language (Core)

- Repeated core symbols seen across the set:
- door
- secret door
- stairs
- columns (filled dots)
- statues (star/compass motif in a circle)
- covered pit (square with X)
- trap (`T`)
- altar (small rectangle marker)
- tapestry/curtain (wavy line)

From map legends, additional symbols are part of the broader Paratime language:

- chest
- coffin
- weakened floor
- teleporter
- throne
- throne stairs
- mosaic

## 7. Stairs, Verticality, and Transition Cues

- Stairs are shown as wedge/fan symbols made of parallel hatch lines.
- Stair glyphs are directional by orientation.
- Stairs are often placed:
- at map edges for entry/exit implication
- in chokepoint corridors
- near major node transitions
- Verticality is icon-driven rather than contour-elevation mapping.

## 8. Cave and Rough Terrain Treatment

- Caves are white “negative” caverns carved into the blue field.
- Cave boundaries are smoother and less rectilinear than room walls.
- Local texture overlays (contour/squiggle hatching) are used in select cave patches.
- “Weakened floor” style appears as a distinct textured patch symbol.
- Cave sectors are integrated with gridded movement assumptions (still play-compatible).

## 9. Annotation and Labeling Patterns

- Room labels are centered and mostly numeric.
- Sub-areas and local callouts use letters (`a`, `b`, `c`) and composite labels (`30a`, `30b`).
- Some set-piece internals use roman numerals for keyed sub-elements.
- Typography is simple, readable, and technical (no ornate calligraphy for room keys).
- Legend typography is bold uppercase for `LEGEND`, then compact symbol-name rows.

## 10. Cartographic Furniture and Decorative Elements

- North indicators vary by map:
- large arrow with `North` text
- standalone `N` marker with arrow motif
- no compass on some sheets
- Legend boxes are often present, usually in a framed white panel.
- Decorative accents appear selectively:
- compass rose/star motifs
- parchment/cartouche scroll for scale note
- emblematic icon inserts on some maps
- Decoration never overwhelms core navigational readability.

## 11. Composition and Readability Patterns

- Strong negative-space strategy: blue field separates white masses clearly.
- Dense maps still maintain legibility via consistent symbol size and restrained line weights.
- Symbols are sparse enough to avoid clutter but frequent enough to imply gameplay texture.
- Major rooms are visually distinguished by:
- larger footprint
- uncommon geometry
- internal symbol clusters (columns/statues/altars/mosaics)
- The style prioritizes gameplay parsing speed over visual realism.

## 12. Recurring Invariants (Most Stable Rules)

- Two-tone blue/white blueprint look.
- Visible square grid and 10-ft scale convention.
- Grid-aligned architecture with occasional intentional diagonals/curves.
- Door symbols as explicit threshold markers.
- Numeric room indexing with occasional lettered subkeys.
- A compact symbol lexicon reused across maps.
- Logical topological connectivity with loops and multiple route choices.
- Optional legend/compass furniture, but always secondary to map readability.

## 13. Variable Features (Present in Some, Not All)

- Large cave sectors and weakened-floor textures.
- Dense maze subsections.
- Expanded symbol families (teleporter, throne stairs, mosaic, coffin, chest).
- Heavy decorative furniture (cartouches, larger compass motifs).
- Very high room counts and multi-part sublabel systems.

## 14. Practical Pattern Summary

If a generated map is intended to read as “Paratime-like,” it should usually satisfy:

- white playable geometry on medium-blue field
- explicit grid and 10-ft square logic
- clean threshold-door grammar
- mixed room shapes with occasional circles/chamfers/diagonals
- at least one set-piece chamber with internal symbols
- loop-capable topology (not purely linear)
- restrained but clear symbol placement
- optional legend/compass furniture without visual clutter
