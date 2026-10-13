# Directional cascade scheduling

Implemented on 2026-10-13. Hology retains render-loop and WebGPU ownership; procedural assets, gameplay/physics/AI and the view-space GTAO/SSR normal contract are unchanged.

The feature is opt-in in Hology. The port enables it through RenderingView.setDirectionalShadowUpdateOptions with maximum ordinary rates of 60/30/15/7.5 Hz, a budget of two ordinary updates per frame, 5% coverage padding per side, and a 10-unit per-frame teleport threshold. `?shadowScheduling=off` restores every-frame directional updates for comparison. Set `enabled: false` through the API to disable the cache.

## Correctness

Cached layers retain the precise camera matrix that rendered their texels. The same matrix is uploaded for both material and fog sampling. Frame-specific TAA jitter is excluded from projection invalidation. Full nominal light/caster volumes must fit inside retained padded coverage; unsafe camera turns or translations force refresh. Initial maps, texture reallocations, FOV/aspect/clipping, camera teleports, changed light identity/direction or cascade ranges, and static-set registration/disposal/enabled changes also invalidate. Explicit RenderingView.invalidateDirectionalShadows supports other discontinuous caster/scene changes.

Ordinary updates use staggered monotonic deadlines and oldest-overdue ordering. No renderer thread waits, workers, buffer transfers, extra culling readbacks or compute passes were added. Existing per-instance independent shadow culling runs only for refreshed cascades. Hard invalidations override the ordinary rate cap and budget. Low frame rates or insufficient budgets can produce lower effective rates than the configured maxima.

## Measurements

Local Chrome hardware WebGPU, 1440 × 900, high preset, deterministic initial scene, paused simulation. Each mode was warmed for three seconds and observed over 240 animation-frame callbacks; duplicate delayed profile frame ids were removed. Every-frame controls were run before and after scheduling in the same browser session. Absolute timings vary substantially between sessions and should not be compared directly with older reports.

| Mode | Whole-frame GPU | Profiled CPU | Shadow GPU | Shadow CPU | Shadow triangles/frame | Updated layers/frame |
|---|---:|---:|---:|---:|---:|---:|
| off | 4.12 ms | 2.02 ms | 1.41 ms | 1.08 ms | 4,403,244 | 4.00 |
| scheduled | 3.68 ms | 1.13 ms | 0.18 ms | 0.18 ms | 460,696 | 0.47 |
| off-repeat | 4.14 ms | 2.08 ms | 1.42 ms | 1.12 ms | 4,403,244 | 4.00 |

Against the mean of the two controls, shadow GPU cost fell roughly 87%, shadow CPU cost roughly 84%, and average shadow triangle submissions roughly 90%. Whole-frame GPU cost fell about 11%. The scheduled phase reused approximately 3.53 of four layers per frame and observed 60/30/15/7 refreshes during the captured window. These results describe a steady view, not guaranteed game FPS or worst-case moving-camera cost. The padded refresh maps have somewhat more conservative coverage than uncached maps.

## Verification

- Renderer type checking and production build; core build; port type checking and production build.
- Deterministic scheduler test at 240 rendered frames/second: 240/119/59/29 updates over four seconds, 512 frames without shadow refresh, ordinary budgets, cap, matrix retention, TAA jitter and coverage/FOV/teleport/scene/light invalidation.
- Browser assertions compare all uploaded sampling matrices against retained map cameras and ensure reused transforms remain unchanged. Hard invalidations are checked at an artificially tiny ordinary rate, using committed update timestamps so a transient frame flag cannot be missed.
- Existing 20 gameplay/browser checks and detail-culling GPU checks pass with no validation errors. Checked street screenshots remain visually consistent; movement, ADS, resize and quality changes also run through the gameplay checks.
- Baseline, scheduled and repeated-control images and raw profiles are under artifacts/. Run `npm run verify:shadows` for the full comparison; `-- --checks-only` reuses the saved comparison and runs invalidation checks.

## Tradeoffs

Coverage padding slightly lowers effective texel density. Moving far casters can show temporal stepping at lower rates. Hard invalidations can still require all four maps in one frame; they prioritise correct coverage over the normal performance budget. Call invalidateDirectionalShadows for discontinuous dynamic-caster or static material changes not represented by the automatic revision checks. Increase far rates or disable scheduling if a scene's motion needs it.

Opaque rendering remains a separate optimisation target. This implementation makes no claim to eliminate that cost or guarantee 240 FPS. Worker offload was intentionally not added: temporal caching already avoids selection and encoding on reused layers.
