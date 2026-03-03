# Map Review Artifacts

This folder contains rendered map artifacts captured across multiple
iterations (`v4` through `v12`) for visual comparison and regression review.

## Important Notes

- `iteration/*-v12-*` reflects current renderer output samples (SVG/PNG/TXT).
- Pre-`v12` packets are retained as historical snapshots and may include
  superseded text (for example, older placeholder ecology/dynamic sections).
- Historical packet artifacts are archival only; for current packet behaviour,
  use `docs/map-system.md`, `src/map/packet.js`, and `src/map/packet.test.js`.
- Reference images under `references/` are local-only style targets for visual
  benchmarking and are not distributed unless licensing is explicitly documented.

If you need current behavior, use `v12` artifacts and the deterministic
baselines in `docs/map-review/snapshots/`.

For local style-target benchmarking against external references, run:

```bash
npm run map:style:audit
```
