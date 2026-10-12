# Patched runtime packages

These snapshots are built from the local source repositories and are used by package.json overrides:

- Hology core: persist AO intensity. The global G-buffer normal conversion was reverted; the existing view-space contract is preserved.
- Hology WebGPU renderer: configurable GTAO composite intensity/power (existing defaults retained).
- three-shader-graph: use unperturbed geometric normals for PBR roughness anti-aliasing.

Rebuild each source package, then run `npm pack --ignore-scripts --pack-destination C:/Users/adamr/code/claude-of-duty-hology/vendor` from its package directory. Refresh the corresponding file dependency and lockfile when replacing a snapshot. No packages were published.
