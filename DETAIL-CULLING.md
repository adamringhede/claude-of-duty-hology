# Detail culling in the Hology port

Implemented on 2026-10-13. Generated source assets and the view-space GTAO/SSR normal contract are unchanged. Hology still owns updates and WebGPU rendering.

## Policies

Hology defaults to a conservative bounding-sphere diameter of 2 render pixels for camera detail and 2 shadow texels for directional casters. Important objects can disable automatic rejection; other objects can override size or set maximum viewer distance. Camera and shadow policies are independent. Long thin geometry retains its full enclosing-sphere extent; near-plane/camera intersections remain eligible. Static GPU and per-cascade shadow histories use a 115% entry / 85% exit band to reduce threshold toggling. Explicit distance remains a hard surface-distance boundary and can visibly pop; author it conservatively.

Use RenderingView.setObjectDetailCulling(object, settings), Object3D.userData.detailCulling, or serialized SceneObject.detailCulling. Settings inherit through ordinary object hierarchies. StaticDrawSetOptions.detailCulling supplies registration defaults; object settings override them. Set policies before registering static snapshots, or dispose and re-register after changing settings. The renderer README contains API examples.

The port adapts owLodDist only in src/port/runtime.js to generic maxDistance. Objects without a legacy distance receive automatic size rejection. First-person presentation disables automatic detail rejection. The query parameter detail=off disables world automatic rejection and legacy-distance adaptation for comparison; it keeps the improved shadow-frustum path.

## Submission paths

Static camera detail rejection uses the two reserved words in the existing 32-byte per-instance metadata. It runs in the existing visibility compute pass before frustum/Hi-Z evaluation, then uses the existing compacted indices and indirect counts. It adds no culling readback or compute pass. Ordinary runtime meshes are tested before renderer batching so their combined bound cannot defeat detail rejection. Already-instanced/resident dynamic batches remain conservative at aggregate-bound granularity.

Directional shadows keep their own visibility. A spatial-chunk broad phase is followed by per-instance sphere tests against each full light/cascade volume and projected texel size. Off-camera casters remain eligible. The CPU mirror of frozen bounds selects contiguous source-instance runs using pooled draw descriptors and existing resident transforms. This is CPU selection, rather than a new GPU shadow-compaction pipeline. Authored castShadow and receiveShadow flags are now preserved by static registration and materialization. Point/spot shadow detail is unchanged.

## Measurements

Local headless Chrome with hardware WebGPU, 1440 × 900, high preset, deterministic capture scene, paused simulation, five-second warmup, then 120 profile samples at the same initial camera. Timestamp timings vary with scheduling/load; these are local samples, not an FPS guarantee.

| Metric | Original packages | New shadow selection, detail off | Final default |
|---|---:|---:|---:|
| Mean GPU time | 23.32 ms | 21.66 ms | 20.38 ms |
| Mean directional-shadow GPU time | 6.40 ms | 5.37 ms | 5.14 ms |
| Mean profiled CPU time | 1.69 ms | 3.29 ms | 2.97 ms |
| Triangle submission counter (upper bound) | 10,638,096 | 8,128,724 | 8,107,736 |
| Directional-shadow triangles (exact direct runs) | Not recorded | 4,424,232 | 4,403,244 |
| Camera indirect triangles (one submission) | Not recorded | 741,072 | 739,592 |
| Static camera-visible instances | 730 | 730 | 693 |

The final counter is about 24% lower; mean GPU time is about 13% lower and shadow GPU time about 20% lower. Profiled CPU time increases about 1.3 ms. Most geometry savings come from improved per-instance shadow coverage tests and preserving authored caster flags. The conservative automatic size/distance default adds only a small reduction in this initial view: versus the detail-off control it removes 20,988 shadow triangles and 1,480 camera-indirect triangles. More aggressive thresholds trade visual detail for throughput.

The original 10.64-million counter sums repeated depth, color, and directional-shadow submissions. Its static indirect entries count registered capacity, even when the GPU rejects instances. It is not unique visible geometry and does not by itself prove a triangle-throughput bottleneck. New per-pass counts expose submission cost; visibility.visibleTriangles reports actual camera indirect arguments (excluding direct and transparent draws). The final camera indirect count is about 740,000 triangles for one submission. Opaque shading and post-processing still account for substantial GPU time.

## Verification

- Renderer type check and build; core build; port type check and production build.
- Engine detail-policy tests: defaults/inheritance, independent overrides, invalid values, near-plane retention, sphere-surface distance, orthographic texel size, off-camera light coverage.
- Targeted GPU checks: 32-byte metadata, legacy-distance upload, automatic defaults without legacy hints, forced per-instance distance/size rejection, manual disable, independent camera/shadow policies. Forced shadow threshold reduced shadow triangles from 4,403,244 to 495,846 without changing camera-visible instance count.
- Existing 20 gameplay/browser checks, including movement, collision, crouch, firing, ADS, reload, switching, AI grenades, quality settings, resize, and zero browser/GPU validation errors.
- Baseline/default street screenshots and actual camera turns/teleport screenshots were inspected. Buildings, balconies, thin railings, foliage and off-screen caster shadows remain visually consistent in checked views. This is sampled visual verification, not exhaustive popping validation.

Raw profiles, summary, assertions and screenshots are in artifacts/. Reproduce with npm run measure:detail -- final and npm run measure:detail -- off, and run npm run verify:detail. Keep the original package snapshots to obtain a genuine pre-change baseline. Vendor README describes rebuilding and refreshing the local packages.

This feature rejects detail; it generates no mesh LODs and does not simplify or edit source assets. Static camera rejection needs the renderer's GPU visibility/indirect path; its direct static fallback retains conservative full submissions. CPU shadow selection can become expensive in larger scenes or with many cascades. Dynamic/resident per-instance compaction and GPU shadow compaction remain possible later extensions.
