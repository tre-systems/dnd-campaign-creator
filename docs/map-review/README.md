# Map Review Artifacts

This folder contains map review artifacts for current renderer validation and
style benchmarking.

## Important Notes

- Deterministic regression baselines live in `snapshots/`.
- Snapshot baselines cover multiple seeds across gatehouse, dwarven, sunken,
  and clockwork fixtures to stress symbol language, topology-driven content
  placement (doors/locks/secrets/stairs), and rock treatment in varied layouts.
- Reference-style CI gating uses the checked-in metrics baseline in
  `reference-style-metrics.json` (derived from local Paratime references).
- Structural/content/semantic quality gating is defined in
  `paratime-style-spec.json` and scored with `map:quality:*` commands.
- Legacy iteration media was pruned to keep the repository lean; use git
  history if you need older archived renders.
- Reference images under `references/` are local-only style targets for visual
  benchmarking and are not distributed unless licensing is explicitly documented.

For current behavior and CI guardrails, use the deterministic baselines in
`docs/map-review/snapshots/`.

For local style-target benchmarking against external references, run:

```bash
npm run map:style:audit
```

For the enforced style gate (used by `npm run verify` and CI), run:

```bash
npm run map:style:gate
```

For the structural quality score and gate (style + content + semantics), run:

```bash
npm run map:quality:score
npm run map:quality:gate
```

Current gate thresholds are:

- minimum style alignment score: `45`
- max absolute deltas: `luminanceMean=0.12`, `saturationMean=0.08`,
  `inkCoverage=0.08`, `orthogonalEdgeRatio=0.16`
- quality composite minimum score: `75`
- content floor checks include:
- corridor width variety (`tight` + `standard` + `wide`)
- feature-cell density range
- higher minimums for feature variety and shape diversity
- semantics floor checks include:
- gated-edge placement coverage (`1.0`)
- gated-edge symbol-match coverage (`1.0`)
- locked/secret/door edge-symbol coverage (`1.0`)

Current strict snapshot baseline (March 4, 2026):

- style alignment score: `45.7`
- quality composite score: `78.3`

To refresh the checked-in metrics baseline from local references, run:

```bash
npm run map:style:baseline:update
```

The visual analysis source for the spec is documented in:

- `paratime-visual-patterns.md`

Recommended iteration loop:

1. Implement one focused map change (symbols, layout, or rendering).
2. Run `npm run map:quality:score`.
3. Review score deltas + rendered exemplars.
4. Keep the change only if `npm run map:quality:gate` still passes.

MapIR vertical-slice harness (Option B exploration):

1. Extract MapIR from a reference map image:
   `npm run map:ir:extract -- --input docs/map-review/references/paratime/bluemap001.jpg --out docs/map-review/map-ir/bluemap001.json --diag docs/map-review/map-ir/bluemap001.diag.json`
2. Render extracted IR back to SVG:
   `npm run map:ir:render -- --input docs/map-review/map-ir/bluemap001.json --out docs/map-review/map-ir/bluemap001.svg`
3. Batch extract the full reference set:
   `npm run map:ir:batch -- --input-dir docs/map-review/references/paratime --out-dir docs/map-review/map-ir/roundtrip --render-dir docs/map-review/map-ir/roundtrip-svg --summary docs/map-review/map-ir/roundtrip/summary.json`
4. Run roundtrip benchmark report:
   `npm run map:ir:benchmark -- --references docs/map-review/references/paratime --report docs/map-review/map-ir/benchmark-report.json`
