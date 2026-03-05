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
- [x] Day 7: go/no-go decision note

## Current Baseline (March 5, 2026)

From `npm run map:ir:batch` and `npm run map:ir:benchmark` against
`docs/map-review/references/paratime`:

1. Maps processed: `20/20`.
2. Style gate pass rate: `20/20` (`100.0%`).
3. Usability pass rate: `20/20` (`100.0%`).
4. Average style score: `59.3 / 100`.

Compared with the earlier `90.0%` style-pass checkpoint, harmonic grid-spacing
selection plus floor-ratio-aware palette normalization improved style pass rate
by +10 points to full pass.

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

## Day 7 Go/No-Go Decision (March 5, 2026)

Decision: **GO** for Option B extraction + roundtrip pipeline, **NO-GO** for
shipping the constrained generator as-is.

Rationale:

1. Reference roundtrip objective is met with margin (`20/20` style and
   `20/20` usability passes).
2. MapIR contract + extraction + renderer are now stable under full automated
   test coverage (including large-graph articulation safety).
3. Generator style alignment remains below the week exit target (`0/20` style
   pass in the prototype benchmark), so generator work should stay in R&D.

Recommended next stage:

1. Use extracted reference IR corpus as supervised training data for a
   learned IR proposal model.
2. Keep current deterministic extraction/roundtrip path as the reliability
   baseline and regression target.
3. Add generated-IR style feedback loops only after the model can hit at least
   `40%` joint style + quality pass.

## Stage 2 Supervised Prototype (March 5, 2026)

Initial supervised corpus model (trained from `roundtrip/*.map-ir.json`) and
learned-proposal generator mode are now implemented.

Proxy benchmark comparison on 20 generated SVG samples (`seed 4000`, same gate):

1. Constrained generator baseline: style pass `0/20` (`0.0%`), usability
   `20/20`, average style score `54.1`.
2. Learned-proposal generator: style pass `4/20` (`20.0%`), usability
   `20/20`, average style score `55.7`.

Interpretation: supervised priors are improving style alignment materially, but
the generator still needs another iteration to hit the stage target (`>=40%`).

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
