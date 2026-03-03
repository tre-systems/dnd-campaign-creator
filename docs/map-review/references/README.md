# Reference Images (Local Only)

This directory is reserved for private/local style references used during map
evaluation.

To keep this repository safe for public distribution, external reference images
are intentionally **not** tracked in git unless explicit license provenance is
documented and approved.

If you want to benchmark against personal or third-party references:

1. Place files under this directory locally.
2. Keep them untracked.
3. Use generated outputs under `docs/map-review/iteration/` and
   `docs/map-review/snapshots/` for committed/public artifacts.
4. Run `npm run map:style:audit` to compare local references against current
   strict snapshot outputs using objective style metrics.
