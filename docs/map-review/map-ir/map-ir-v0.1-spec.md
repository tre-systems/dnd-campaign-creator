# MapIR v0.1.0 Specification (Frozen)

Date frozen: March 5, 2026

This document defines the frozen `MapIR v0.1.0` contract used in the Option B
exploration track.

## Intent

`MapIR` is a structural intermediate representation for old-school blue dungeon
maps. The representation intentionally separates map structure from rendering
style.

## Versioning

- `version` is required.
- `version` must equal `"0.1.0"` for this contract.
- Any incompatible schema change must increment the version string.

## Top-Level Shape

Allowed top-level keys:

- `version`
- `meta`
- `floors`
- `walls`
- `thresholds`
- `labels`
- `grid` (optional extraction metadata)
- `diagnostics` (optional extraction diagnostics)
- `extensions` (optional reserved object)

Unknown top-level keys are invalid in `v0.1.0`.

## Required Fields

1. `meta` (object)
2. `floors` (array)
3. `walls` (array)

## `meta`

Allowed keys:

- `width` (required, positive integer)
- `height` (required, positive integer)
- `cellSizeFt` (optional, finite number)
- `title` (optional, string)
- `source` (optional, string)

Unknown `meta` keys are invalid in `v0.1.0`.

Coordinate space:

- Cell coordinates use integer grid cells.
- Edge coordinates use cell-boundary coordinates.
- `width` and `height` define the map envelope.

## `floors`

Each floor entry is a rectangle:

```json
{ "x": 10, "y": 8, "w": 6, "h": 5 }
```

Rules:

- `x`, `y`: non-negative integers
- `w`, `h`: positive integers
- rectangle must be within bounds:
- `x + w <= meta.width`
- `y + h <= meta.height`

## `walls`

Each wall entry is an axis-aligned segment on grid boundaries:

```json
{ "x1": 10, "y1": 8, "x2": 16, "y2": 8 }
```

Rules:

- `x1`, `y1`, `x2`, `y2`: finite numbers
- segment length must be non-zero
- segment must be axis-aligned
- endpoints must be within edge bounds:
- `0 <= x <= meta.width`
- `0 <= y <= meta.height`

## `thresholds` (optional)

Each threshold entry:

```json
{ "x": 16, "y": 10, "type": "door" }
```

Rules:

- `x`, `y`: non-negative integers
- coordinate bounds: `0 <= x < meta.width`, `0 <= y < meta.height`
- `type` must be one of:
- `door`
- `locked`
- `secret`

## `labels` (optional)

Each label entry:

```json
{ "text": "12", "x": 13, "y": 10 }
```

Rules:

- `text`: non-empty string
- `x`, `y`: finite numbers
- coordinate bounds: `0 <= x < meta.width`, `0 <= y < meta.height`

## Optional Metadata Keys

### `grid`

Reserved for extraction metadata such as:

- `cellSizePx`
- `originPx`
- `boundsPx`

No strict sub-schema is enforced in `v0.1.0`.

### `diagnostics`

Reserved for extraction diagnostics and confidence metrics.

No strict sub-schema is enforced in `v0.1.0`.

### `extensions`

Reserved object for experimental add-ons that should not alter core semantics.

## Rendering Expectations for v0.1.0

A compliant renderer should at minimum:

1. Render `floors` as white playable areas.
2. Render `walls` as blueprint linework.
3. Render optional `thresholds` with type-specific symbols.
4. Render optional `labels` as room text.

## Stability Policy for This Week

For the Week 1 plan window (March 6-12, 2026), changes to core fields
(`meta`, `floors`, `walls`, `thresholds`, `labels`) require explicit note in
this document and a version bump if they are incompatible.
