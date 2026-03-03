# Map Review Artifacts

This folder contains map review artifacts for current renderer validation and
style benchmarking.

## Important Notes

- Deterministic regression baselines live in `snapshots/`.
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
