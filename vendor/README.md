# Patched runtime packages

These snapshots are built from the local source repositories and are used by package.json overrides:

- Hology core (`hology-core-0.0.267-detail.tgz`): scene/runtime detail-culling settings and homogeneous batching policies; preserve authored shadow flags; persist AO intensity. The global G-buffer normal conversion was reverted; the existing view-space contract is preserved.
- Hology WebGPU renderer (`hology-webgpu-renderer-0.1.19-shadow-ortho.tgz`): precomputed orthographic shadow texel scale; automatic camera detail rejection, generic object overrides, independent per-instance directional shadow selection, hysteresis, and per-pass/actual indirect triangle profiling; configurable GTAO composite intensity/power (existing defaults retained).
- three-shader-graph: use unperturbed geometric normals for PBR roughness anti-aliasing.

Rebuild each source package, then run `npm pack --ignore-scripts --pack-destination C:/Users/adamr/code/claude-of-duty-hology/vendor` from its package directory. Refresh the corresponding file dependency and lockfile when replacing a snapshot. No packages were published.

Keep the original snapshots intact. Pack into a temporary workspace directory, rename the new archive to a fresh dependency filename, then install that file dependency to avoid stale npm/Vite caches. Restart Vite with `--force` after replacing runtime packages.
