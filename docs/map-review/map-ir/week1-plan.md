# MapIR Week 1 Execution Plan (March 6-12, 2026)

This file tracks execution for the Option B weekly plan.

## Status

- [x] Day 1: freeze `MapIR v0.1` contract
- [x] Day 2 tooling: batch extraction command
- [x] Day 5 tooling: one-command benchmark/report path
- [x] Day 2 run: full reference-set extraction output review
- [x] Day 3: floor/wall fidelity tuning pass
- [x] Day 4: threshold + label extraction pass (high-confidence only)
- [x] Day 6: constrained IR generator prototype
- [ ] Day 7: go/no-go decision note

## Current Baseline (March 5, 2026)

From `npm run map:ir:batch` and `npm run map:ir:benchmark` against
`docs/map-review/references/paratime`:

1. Maps processed: `20/20`.
2. Style gate pass rate: `18/20` (`90.0%`).
3. Usability pass rate: `20/20` (`100.0%`).
4. Average style score: `56.1 / 100`.

Compared with prior baseline (`85.0%` style pass), floor/wall tuning plus
adaptive thresholding improved style pass rate by +5 points.

Generated report:

- `docs/map-review/map-ir/benchmark-report.json` (local artifact)

## Day 6 Prototype Snapshot

Generated suite (constrained generator prototype):

1. Generated maps: `20`.
2. Connectivity (single floor component): `20/20`.
3. Average floor cell ratio: `0.287`.
4. Average generated thresholds: `17.5`.

Style proxy benchmark against Paratime references (on generated SVGs):

1. Style pass rate: `0/20` (`0.0%`).
2. Usability pass rate: `20/20` (`100.0%`).
3. Average style score: `31.3 / 100`.

Implication: structure constraints are working, but the generator's geometric
distribution is not yet style-aligned to the reference corpus.

## Week Exit Gates

1. IR validation pass rate on references: `>= 90%` (18/20).
2. Roundtrip visual usability: `>= 80%` on a 10-map manual sample.
3. Style gate pass on roundtrip renders: `>= 80%`.
4. Initial generated IR maps passing both style + quality: `>= 40%`.

## Commands

Batch extraction:

```bash
npm run map:ir:batch -- \
  --input-dir docs/map-review/references/paratime \
  --out-dir docs/map-review/map-ir/roundtrip \
  --diag-dir docs/map-review/map-ir/roundtrip-diag \
  --render-dir docs/map-review/map-ir/roundtrip-svg \
  --summary docs/map-review/map-ir/roundtrip/summary.json
```

Benchmark report:

```bash
npm run map:ir:benchmark -- \
  --references docs/map-review/references/paratime \
  --report docs/map-review/map-ir/benchmark-report.json
```
