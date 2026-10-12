import * as THREE from 'three';
import { Engine } from '../legacy/core/engine.js';
import { createConfig, FIXED_DT, MAX_SUBSTEPS } from '../legacy/core/config.js';
import { WorldSystem } from '../legacy/world/index.js';
import { PhysicsSystem } from '../legacy/physics/index.js';
import { PlayerSystem } from '../legacy/player/index.js';
import { WeaponSystem } from '../legacy/weapons/index.js';
import { FxSystem } from '../legacy/fx/index.js';
import { AiSystem } from '../legacy/ai/index.js';
import { UiSystem } from '../legacy/ui/index.js';
import { AudioSystem } from '../legacy/audio/index.js';
import { HologyMaterials } from './materials.js';
import { HologySky } from './sky';

// Compatibility API only: no renderer, render(), or independent frame loop.
class RenderBridge {
  static id = 'render';
  static deps = [];
  init(ctx) { this.ctx = ctx; this.rng = ctx.rng.fork(); this.settings = {}; this.sunDir = new THREE.Vector3(); }
  addLight() {}
  patchMaterials() {}
  setExposureBias() {}
  requestEnvMap() { return this.ctx.scene.environment; }
  resize(w, h) { this.screenSize = this.displaySize = { width: w, height: h }; }
}

export async function createPort(scene, canvas, view, hologyWorld) {
  const params = new URLSearchParams(location.search);
  const engine = new Engine({ canvas, config: createConfig({ quality: params.get('q') ?? 'high', deterministic: params.get('capture') === '1' }) });
  // Reuse the original subsystem context, but never call its start/step/render.
  engine.scene = engine.ctx.scene = scene;
  engine.ctx.hologyWorld = hologyWorld;
  engine.camera.near = 0.005;
  engine.camera.updateProjectionMatrix();
  engine.add(RenderBridge).add(HologyMaterials).add(HologySky).add(WorldSystem)
    .add(PhysicsSystem).add(PlayerSystem).add(WeaponSystem).add(FxSystem)
    .add(AiSystem).add(UiSystem).add(AudioSystem);
  await engine.init();
  engine.registry.get('materials').finishBaking();

  // Camera-local viewmodel geometry, projected to match its original 60-degree FOV.
  const viewRoot = new THREE.Group();
  viewRoot.name = 'First person presentation';
  for (const child of [...engine.viewScene.children]) viewRoot.add(child);
  viewRoot.matrixAutoUpdate = false;
  scene.add(viewRoot, engine.camera);
  const scaleMatrix = new THREE.Matrix4(), inverseCamera = new THREE.Matrix4();
  const level = engine.registry.get('world');
  const levelLights = [...level.root.children].filter(o => o.isLight);
  for (const light of levelLights) scene.attach(light);
  // StaticDrawSet v1 cannot sort transparency. Preserve glass/decals as ordinary
  // draws rather than letting an unsupported-material skip hide them with the root.
  const transparentRoot = new THREE.Group();
  transparentRoot.name = 'world-transparent';
  scene.add(transparentRoot);
  for (const object of [...level.root.children]) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(m => m && (m.transparent || !m.depthWrite))) transparentRoot.attach(object);
    else if (object.isMesh && !object.geometry.index) {
      // The indirect static path requires indices. A sequential index preserves
      // every original vertex, normal, UV and triangle without welding seams.
      const count = object.geometry.attributes.position.count;
      const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i++) indices[i] = i;
      object.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
  }
  const oldDispose = engine.dispose.bind(engine);
  let accumulator = 0;
  engine.advance = dt => {
    dt = Math.min(0.1, Math.max(0, dt));
    const t = engine.time;
    t.dt = dt * t.scale; t.raw += dt; t.elapsed += t.dt; t.frame++;
    engine.input.beginFrame();
    accumulator += t.dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      for (const sys of engine.registry.with('fixedUpdate')) sys.fixedUpdate(FIXED_DT, engine.ctx);
      accumulator -= FIXED_DT; steps++;
    }
    if (steps === MAX_SUBSTEPS) accumulator = 0;
    t.alpha = accumulator / FIXED_DT;
    for (const sys of engine.registry.with('update')) sys.update(t.dt, engine.ctx);
    for (const sys of engine.registry.with('lateUpdate')) sys.lateUpdate(t.dt, engine.ctx);
    const scale = Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)) / Math.tan(Math.PI / 6);
    engine.camera.updateMatrixWorld(true);
    inverseCamera.copy(engine.camera.matrixWorld).invert();
    scaleMatrix.makeScale(0.12 * scale, 0.12 * scale, 0.12);
    viewRoot.matrix.copy(engine.camera.matrixWorld).multiply(scaleMatrix).multiply(inverseCamera);
    viewRoot.matrixWorldNeedsUpdate = true;
    for (const child of [...engine.viewScene.children]) viewRoot.add(child);
    engine.input.endFrame();
  };
  engine.dispose = () => {
    oldDispose();
    for (const light of levelLights) light.removeFromParent();
    transparentRoot.removeFromParent();
    engine.camera.removeFromParent(); viewRoot.removeFromParent(); viewRoot.clear();
  };
  view.setProfilingEnabled(true);
  console.info('[port] Hology WebGPU owns rendering and frame scheduling.');
  return engine;
}

