# MapIR Vertical Slice

This folder hosts local artifacts for the MapIR (Option B) exploration branch.

## CLI Commands

Extract MapIR from an image:

```bash
npm run map:ir:extract -- \
  --input docs/map-review/references/paratime/bluemap001.jpg \
  --out docs/map-review/map-ir/bluemap001.map-ir.json \
  --diag docs/map-review/map-ir/bluemap001.diag.json
```

Render any MapIR JSON to SVG:

```bash
npm run map:ir:render -- \
  --input docs/map-review/map-ir/sample-map-ir.json \
  --out docs/map-review/map-ir/sample-map-ir.svg
```

Roundtrip in one command:

```bash
node bin/map-ir.js roundtrip \
  --input docs/map-review/references/paratime/bluemap001.jpg \
  --ir-out docs/map-review/map-ir/bluemap001.map-ir.json \
  --svg-out docs/map-review/map-ir/bluemap001.roundtrip.svg
```

## MapIR Schema (v0.1.0)

Core fields in this branch:

- `meta`: grid dimensions and scale metadata.
- `floors`: floor rectangles in grid-cell coordinates.
- `walls`: axis-aligned boundary segments in grid-edge coordinates.
- `thresholds`: optional door/locked/secret cell markers.
- `labels`: optional room labels.

The extractor currently targets grid + floor/wall recovery only.
