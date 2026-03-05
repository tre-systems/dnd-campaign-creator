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

Batch extract all images in a folder (and optionally render roundtrip SVGs):

```bash
npm run map:ir:batch -- \
  --input-dir docs/map-review/references/paratime \
  --out-dir docs/map-review/map-ir/roundtrip \
  --diag-dir docs/map-review/map-ir/roundtrip-diag \
  --render-dir docs/map-review/map-ir/roundtrip-svg \
  --summary docs/map-review/map-ir/roundtrip/summary.json
```

Run an extraction+roundtrip benchmark report:

```bash
npm run map:ir:benchmark -- \
  --references docs/map-review/references/paratime \
  --report docs/map-review/map-ir/benchmark-report.json
```

Generate constrained MapIR samples (prototype generator):

```bash
npm run map:ir:generate -- \
  --out-dir docs/map-review/map-ir/generated \
  --svg-dir docs/map-review/map-ir/generated-svg \
  --summary docs/map-review/map-ir/generated/summary.json \
  --count 20 \
  --seed 2000
```

## MapIR Schema (v0.1.0)

The frozen schema contract is documented in:

- `docs/map-review/map-ir/map-ir-v0.1-spec.md`
- `docs/map-review/map-ir/week1-plan.md` (execution tracker)

Core fields in this branch:

- `meta`: grid dimensions and scale metadata.
- `floors`: floor rectangles in grid-cell coordinates.
- `walls`: axis-aligned boundary segments in grid-edge coordinates.
- `thresholds`: optional door/locked/secret cell markers.
- `labels`: optional room labels.

The extractor currently targets grid + floor/wall recovery only.
