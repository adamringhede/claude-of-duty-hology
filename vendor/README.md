# Patched runtime packages

These snapshots are built from the local source repositories and are used by package.json overrides:

- Hology core (`hology-core-0.0.267-cpu.tgz`): coalesced final-pose audio updates and no inactive listener automation; directional shadow scheduling API; scene/runtime detail-culling settings and homogeneous batching policies; preserve authored shadow flags; persist AO intensity. The global G-buffer normal conversion was reverted; the existing view-space contract is preserved.
- Hology WebGPU renderer (`hology-webgpu-renderer-0.1.19-cpu-final.tgz`): direct float-attribute packing and per-cascade immutable draw descriptor reuse; cached directional cascade maps/matrices with staggered refresh deadlines, coverage and hard-invalidation checks; precomputed orthographic shadow texel scale; automatic camera detail rejection, generic object overrides, independent per-instance directional shadow selection, hysteresis, and per-pass/actual indirect triangle profiling; configurable GTAO composite intensity/power (existing defaults retained).
- three-shader-graph (`three-shader-graph-0.2.69-irradiance.tgz`): current physical-material features and geometric roughness fix, plus independent `environmentDiffuseIntensity` (default 1) to preserve reflection radiance while controlling irradiance, including rough multiscattering and sheen.

Rebuild each source package, then run `npm pack --ignore-scripts --pack-destination C:/Users/adamr/code/claude-of-duty-hology/vendor` from its package directory. Refresh the corresponding file dependency and lockfile when replacing a snapshot. No packages were published.

Keep the original snapshots intact. Pack into a temporary workspace directory, rename the new archive to a fresh dependency filename, then install that file dependency to avoid stale npm/Vite caches. Restart Vite with `--force` after replacing runtime packages.
