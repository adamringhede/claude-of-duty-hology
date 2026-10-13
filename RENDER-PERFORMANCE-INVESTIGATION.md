# Worker, shadow cadence, and opaque-pass investigation

Measured in local Chrome on 2026-10-13, at 1440 × 900, high preset, deterministic initial camera and paused simulation. This work adds diagnostic scripts and one equivalent CPU optimization. It does not implement worker selection or cascade update scheduling yet.

## What can move to a worker

Static caster selection can run in a worker: its inputs are frozen bounds, draw ranges, shadow detail settings, cascade projection/frustum, viewer position, and hysteresis history. GPU command encoding stays with the current renderer/device on the main thread.

An instrumented 150-frame run measured roughly 1.75 ms shadow-pass CPU time, of which 0.50 ms was draw encoding. The remaining 1.25 ms includes selection, descriptor preparation, camera/bind-group setup, and render-pass setup; it is an upper bound on the work a worker might remove, not a measured worker speedup.

Use the existing WorkerTaskExecutor with a dedicated one-worker instance for deadline-sensitive shadow selection. The shared executor has no worker affinity: with multiple slots, a select task can reach a worker that never received the scene registration. High priority only changes queued order; it cannot preempt an already-running navmesh task. A dedicated instance avoids both issues while retaining the existing request/result/cancellation framework.

Suggested data flow:

1. Register each static draw set once. Transfer a copy of its immutable sphere metadata, draw ranges, chunk bounds, and shadow-policy arrays into the worker. This copies at registration, not every frame. Retain the main-thread copy for synchronous conservative fallback and diagnostic checks.
2. For a scheduled cascade update, send only small numeric inputs: scene generation, cascade id, request generation, projection/frustum, viewer position and map dimensions. Keep per-cascade hysteresis in the worker.
3. Return packed Uint32Array runs (draw index, first instance, instance count), rather than Three.js objects. Transfer reusable result buffers back and forth. Ownership transfers avoid copying their contents; two or three result buffers allow the worker and renderer to overlap safely.
4. Encode on the main thread and recycle the result buffer afterward. Keep the rendered map and its projection as one committed cache record. Never await a worker result inside the synchronous render pass.
5. Discard replies for disposed/replaced draw sets or superseded requests. Keep at most one outstanding selection per cascade and coalesce newer requests. If a result is late, retain the previous valid map when coverage permits; on initialisation/invalid coverage use a conservative synchronous fallback.

SharedArrayBuffer is an optional optimization: share immutable bounds and double-buffered results, and publish completed generations with Atomics. It is not required. The Chrome verification session reported crossOriginIsolated=false and SharedArrayBuffer, SharedStructType and SharedArray all unavailable. The engine's flagged Electron runtime may have structs, but this must be feature-detected separately. Shared structs are not necessary for this numeric workload and should not become a renderer requirement. Do not block the main thread with Atomics.wait, a shared mutex, or synchronous polling.

GPU per-cascade compaction is also a strong alternative: bounds already reside in GPU memory. Independent shadow-visible indices and indirect arguments would avoid CPU selection and worker latency, without reusing the camera's list. Keep the core task framework out of the standalone renderer dependency graph by supplying any worker service through the core backend.

## Cascade scheduling

Cadence caching should come before worker infrastructure because it reduces both selection/encoding CPU work and shadow raster GPU work. The current renderer renders all four cascades every frame and uploads freshly computed shadow matrices every frame. Simply skipping a render pass is incorrect: old texels would be sampled using a new projection.

A proposed configurable policy is a 60 Hz maximum and descending cascade rates such as 60/30/15/7.5 Hz, with a per-frame update budget and staggered deadlines. These values are a starting experiment, not an established API/default. At 240 rendered frames/second, each unchanged-rate 60 Hz cascade needs a refresh only every four frames. Use a monotonic render clock and deadlines, not a fixed frame modulus, so the policy behaves consistently at variable FPS.

Each cached cascade must retain the rendered projection, sampling matrix, cascade coverage, light identity, map generation and last refresh time. Lighting uniforms must use the cached sampling matrix until a new map and matrix are committed together. Cascade selection/ranges, fog shadow sampling and receiver coverage need to stay consistent with those records.

Initial maps, texture reallocations, changed light identity/direction, static-set revision and discontinuous camera/FOV changes invalidate the cache. Receiver coverage must be conservatively padded/checked: refresh if motion leaves the guarded light-space footprint. Camera motion within the guard band can reuse the map. Near moving actors can still update at 60 Hz; lower far-cascade rates intentionally introduce bounded temporal lag. Large invalidations may require multiple immediate updates and override the ordinary frame budget. This needs explicit visual testing around cascade seams, fast movement, teleports, ADS/FOV changes and moving casters.

Do not introduce worker selection that requires fresh results for every 240 Hz frame before solving this cache/scheduling contract. At reduced refresh cadence, the remaining main-thread selection cost may already be small enough.

## Opaque measurements

Each scenario was warmed for 2.5 seconds and sampled 100 times. The baseline was repeated at the end to check drift. These are diagnostic switches, not visual-parity changes to the shipped game.

| Scenario | Mean opaque GPU time | Median opaque GPU time | Mean whole-frame GPU time | Camera indirect triangles |
|---|---:|---:|---:|---:|
| Baseline | 9.08 ms | 8.58 ms | 20.98 ms | 739,592 |
| Half width and height | 5.28 ms | 5.21 ms | 13.95 ms | 737,292 |
| Directional shadows disabled | 8.31 ms | 8.12 ms | 15.57 ms | 739,592 |
| Practical point lights disabled | 8.37 ms | 8.26 ms | 19.55 ms | 739,592 |
| Baseline repeated | 9.11 ms | 8.42 ms | 20.92 ms | 739,592 |

Halving width and height reduces pixel count to a quarter, but leaves almost all triangles and roughly 5.3 ms opaque cost. This supports a mixed pixel and resolution-independent bottleneck, rather than a claim that triangle count alone explains the pass. Disabling shadows saves most of their separate raster pass, but under 1 ms in the opaque pass in these samples. Point lights are also not the primary explanation.

The 240 FPS frame budget is 4.17 ms for the entire frame; the measured opaque pass alone already exceeds it. Worker offload cannot change that GPU budget.

Confirmed shader findings:

- The generated material shaders contain 8–12 texture-sample call sites for normal/albedo/ORM/detail/macro layers, plus renderer shadow/environment helpers. The largest inspected shader is approximately 46 KB. Call-site counts are not hardware texture-fetch measurements.
- The physical-material directional-light loop calls the shadow helper before multiplying by the cascade factor. It therefore calls helpers for inactive cascades too. Helpers may return early outside map coverage, but overlapping inactive cascades can still perform unnecessary PCF sampling. Prefer lazy skipping of inactive directional contributions in the shader library, rather than altering general per-light sampling semantics.
- The inspected vertex shader exports the same model-view position through nodeVarying6.xyz, nodeVarying15.xyz and nodeVarying16.xyz. Its fragment interface uses eleven locations. Deduplicating equivalent varying expressions and reusing the existing position components is a concrete compiler optimization candidate; a gain has not yet been measured.
- Material/normal derivative work and motion-vector interpolation remain active. The view-space G-buffer normal contract must be preserved while investigating them.

The next isolating GPU experiment should keep the same geometry, vertex interface, MRT outputs and depth behavior while replacing only fragment shading with a cheap diagnostic material. Compare that with removing redundant varyings, then individual material layers. This distinguishes geometry/vertex/interpolation work from fragment ALU/texture/bandwidth cost without modifying generated assets.

## Small optimization applied

Directional shadow cameras are orthographic and have rigid view transforms. Their projected sphere diameter is radius times a constant texel scale. Static selection now computes that scale once per cascade instead of performing homogeneous transforms and vector norms for every instance. Explicit distance, per-instance light-space frustum rejection and hysteresis are preserved.

Tests compare the fast formula with the general conservative projection for rotated cameras, multiple zooms, radii and thresholds. Renderer type checking/build, policy tests, and targeted GPU/browser checks pass, with unchanged selected shadow triangle counts and no GPU errors. The renderer was repacked into vendor/hology-webgpu-renderer-0.1.19-shadow-ortho.tgz and installed in the port.

CPU profile samples varied: original shadow-pass mean 1.75 ms (encoding 0.50 ms), optimized runs 1.90 ms (encoding 0.71 ms) and 1.40 ms (encoding 0.52 ms). This removes known redundant work, but the samples do not establish a stable timing gain. No worker or cadence-cache speedup is claimed.

Raw results and inspected shaders are in artifacts/render-cost-investigation.json, artifacts/shadow-cpu-breakdown*.json, artifacts/opaque-shader-largest.wgsl and artifacts/opaque-vertex.wgsl. Reproduction scripts are tools/investigate-render-cost.mjs and tools/investigate-shadow-cpu.mjs. PORT_URL selects the local verification server.
