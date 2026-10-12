# Claude of Duty on Hology Engine

An initial runtime port of the generated Claude of Duty project. Hology owns the scene, WebGPU renderer, camera presentation, and frame loop. Three.js is pinned to **0.169.0**. The original project is unchanged. Focused fixes are also present in the local Hology and three-shader-graph source repositories; patched package snapshots in `vendor/` make `npm install` reproduce the tested runtime.

## Run

```sh
npm install
npm run dev
```

Use desktop Chrome or Edge with WebGPU available. The game requires Hology's `webgpu` backend; it does not fall back to WebGL. Click the game to capture the mouse. WASD moves, Shift sprints, Space jumps, Ctrl/C crouches, Z goes prone, Q/E leans, left mouse fires, right mouse aims, R reloads, 1/2/3 selects rifle/SMG/pistol, and Escape opens the pause menu. These are the original game's controls.

```sh
npm run typecheck
npm run build
npm run preview
PORT_URL=http://localhost:5173 npm run verify
```

In PowerShell, set `$env:PORT_URL = 'http://localhost:5173'` before `npm run verify`. Verification uses installed Chrome through Playwright and writes screenshots, checks, and a renderer profile to `artifacts/`. `?q=low|medium|high|ultra` sets the initial quality. `?capture=1` uses the original deterministic seed and leaves the AI garrison empty for repeatable world captures.

## Integration

- `src/services/game.ts` connects the game to Hology's lifecycle and `ViewController.onUpdate()`.
- `src/port/runtime.js` runs the retained subsystem registry, including the original 120 Hz fixed simulation, inside that callback. The original engine's `start()`, `step()` and renderer are never invoked.
- The generated level is added directly to `World.scene`, then registered through `RenderingView.registerExperimentalStaticDrawSet()`. Lights and transparent level meshes are kept outside the snapshot; AI, weapons, particles and shell casings remain dynamic. Non-indexed opaque props receive sequential indices, preserving their original triangles.
- `src/port/*-shader.ts` and `sky.ts` author custom shaders with `@hology/core/shader-nodes`, including PBR materials, projected texture coordinates, particle motion, character detail/rim shading, impact decal fading, and sky/clouds. Hology compiles these graphs to WGSL.
- Bloom is tuned through the existing `webgpuPostProcessing.bloom` config in `src/App.tsx`. The original threshold/knee are divided by the fixed exposure, and strength accounts for Hology's five summed mip weights. The kernels still differ from the original COD pyramid.
- The generated first-person weapon rig is retained. Its scene is transformed around the active camera to reproduce the original viewmodel FOV while placing it near the camera to avoid intersecting level geometry.
- The starter scene is empty. Its sample actors and player controller have been removed.
- `src/legacy/` retains the generated game source, with small shader integration changes in `fx/particles.js`, `fx/decals.js` and `ai/textures.js`, plus HUD mouse-event/pointer-lock guards in `core/input.js` and `ui/index.js`. Its old rendering, sky and shader sources remain as reference; they are not the active renderer.

The procedural PBR surface maps are baked assets in `public/port-textures/`. The **game requests no WebGL context**, including during loading. The separate offline developer tool `npm run bake:textures` uses the original GLSL texture generator in a temporary WebGL page and exports PNGs; it is not included in the production entry point. It requires a running dev server and supports `PORT_URL`. Original 1024/512 px resolutions and bake seeds are retained.

## What this first pass preserves

The level layout, generated buildings/props, collision geometry and BVH simulation, movement/camera feel, three weapons and their procedural animations, projectile ballistics, shell physics, soldier rigs/animation, AI navigation/cover/squads, audio, HUD/minimap, pause/settings, damage/health and AI grenades.

## Remaining differences and next steps

This is playable runtime parity, **not pixel-identical rendering or a completed renderer benchmark**. Hology supplies shadows, TAA/FXAA, GTAO, bloom and depth-aware motion blur. GTAO is configured through the persistent `configureAmbientOcclusion` view state: backend-only options were previously reset to disabled during the final startup compile. GTAO/SSR retain Hology's existing view-space G-buffer convention; an attempted global conversion was reverted after camera-motion validation. Configured AO intensity is now forwarded to the composite instead of silently using 0.6. It uses the original 1.35 m radius; matching on/off captures verify it changes contact shading. The starter's default white hemisphere is removed. The original cool upper-sky and warm ground-bounce irradiance calculations are reproduced in the surface graph, and short-range practical lights retain their original 0.55 gain and distance fade. These replace the overly warm/flat lighting of the initial port. A TypeScript shader-node postprocess reproduces the original AgX transforms and display LUT at the measured daytime exposure (4.84), then returns linear color for Hology's final sRGB conversion. Its 3x3 color transforms are embedded in Matrix4 because the released shader graph lacks a native ConstantMat3 emitter. Vector clamp bounds are explicit vectors for WGSL compatibility. The Matrix4 workaround remains. The patched shader package now fixes geometric roughness: specular anti-aliasing uses the unperturbed normal rather than amplifying normal-map detail into roughness.

The visible sky and environment are baked from the original atmospheric shader at 16:30; clouds and lighting therefore do not yet track a changing time of day. Surface graphs now include blended triplanar albedo/ORM, shared microdetail, macro variation and weathering layers. Parallax, stochastic detiling and the full cloth model remain different. Heat-haze refraction and the original low-health post-process pass are not ported; the DOM health/damage HUD remains. Muzzle/FX queries retain logical world coordinates; presentation compression is applied once when rendering. The view camera tracks the main camera's pose/aspect for FX orientation. First-person flash lights use intensity × 0.12² and range × 0.12 to preserve inverse-square falloff in the compressed rig. `tools/verify-muzzle.mjs` captures the original and port at the same flash age.

The first-person rig shares Hology's temporal/post processing rather than the original separately composited viewmodel pass; its motion blur is disabled. Environment intensity currently follows the original diffuse IBL budget (1.6 × 0.03); weapon materials now use an explicit environment and retain their own original 0.24 occlusion intensity independently of that world budget. World specular IBL remains a difference. Optic glass uses a TypeScript shader-node AR coating and alpha blending without screen refraction; it approximates the original thin-film coating rather than reproducing the complete Three.js iridescence model. Motion blur uses shutter 0.42, a 48 px limit and 16 samples. Hology's dilation/depth weighting differs from the original tile-based algorithm, so this is functional parity rather than identical blur.

Basic color-space probes passed (linear 0.5 outputs 188; an sRGB texture at 128 outputs 128). The large brightness difference came from exposure/tone mapping, including a skipped custom pass, rather than duplicated texture decoding. Run `node tools/capture-appearance.mjs` and `node tools/verify-motion.mjs` against port 5188 for repeatable visual checks.

The retained physics and navigation systems intentionally do not yet use Rapier or Hology navmeshes. Multiplayer, Hology actor/controller integration, native VFX and editable scene/asset export are later phases. G is an input binding in the source, but player grenade throwing was not implemented there; AI grenade physics/explosions are retained.

## Findings for AI-generated Hology projects

1. Procedural Three.js content can use an empty Hology scene and attach to `World.scene`; scene JSON is not a prerequisite for the renderer or static draw sets.
2. Shader graph authoring is the main migration boundary. Existing `onBeforeCompile` GLSL injections do not carry over automatically.
3. Custom spawn attributes need per-instance bindings. The port's `ParticleAttribute` annotates its material-local WGSL bindings with `stepMode: 'instance'`; a public constructor option for this would make arbitrary generated particle layouts easier to author.
4. Projected tangent frames need a safe fallback for degenerate derivatives. A NaN normal can propagate through HDR bloom into large black rectangles even without GPU validation errors. The surface graph guards this explicitly.
5. Static draw registration hides its source root. StaticDrawSet v1 requires indexed opaque geometry, so generated scenes should separate transparent meshes and lights, and index non-indexed props before registering them. Using unsupported-material skipping without separating those objects would hide them.
6. A first-person presentation helper would simplify ports with independent weapon FOV/depth and temporal treatment.
7. This port constructs generated geometry/materials in `onPreload()` so Hology's shader/texture warmup sees them before play.

For a renderer comparison, use the same deterministic camera/world seed, viewport, quality and draw content, then collect both engines' profiles after warmup. This port changes lighting and post effects, so its current timing alone is not an apples-to-apples comparison.
