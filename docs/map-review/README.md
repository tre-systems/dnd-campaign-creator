# Map Review Artifacts

This folder contains rendered map artifacts captured across multiple
iterations (`v4` through `v11`) for visual comparison and regression review.

## Important Notes

- `iteration/*-v11-*` reflects the current renderer/payload behavior.
- Pre-`v11` packets are retained as historical snapshots and may include
  superseded text (for example, older placeholder ecology/dynamic sections).
- Reference images under `references/` are external style targets used for
  visual benchmarking, not generated outputs.

If you need current behavior, use `v11` artifacts and the deterministic
baselines in `docs/map-review/snapshots/`.
