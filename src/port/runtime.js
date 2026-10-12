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
  init(ctx) { this.ctx = ctx; this.rng = ctx.rng.fork(); this.settings = { practicalGain: 0.55 }; this.lights = []; this.sunDir = new THREE.Vector3(); }
  addLight(light, opts = {}) {
    if (light && !this.lights.some(e => e.light === light)) this.lights.push({ light,
      range: opts.range ?? light.distance ?? 25, baseIntensity: light.intensity, applied: undefined });
    return light;
  }
  removeLight(light) { const i = this.lights.findIndex(e => e.light === light); if (i >= 0) this.lights.splice(i, 1); }
  lateUpdate() {
    for (const e of this.lights) {
      if (e.applied !== undefined && e.light.intensity !== e.applied) e.baseIntensity = e.light.intensity;
      const distance = e.light.position.distanceTo(this.ctx.camera.position);
      const fade = 1 - THREE.MathUtils.smoothstep(distance, e.range * 0.75, e.range * 1.15);
      e.applied = e.baseIntensity * fade * (e.range <= 30 ? this.settings.practicalGain : 1);
      e.light.intensity = e.applied; e.light.visible = fade > 0.002;
    }
  }
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
  const inversePresentation = new THREE.Matrix4();
  const viewmodel = engine.registry.get('weapons').viewmodel;
  const muzzleWorld = viewmodel.muzzleWorld.bind(viewmodel);
  const ejectWorld = viewmodel.ejectWorld.bind(viewmodel);
  const ejectVelocity = viewmodel.ejectVelocity.bind(viewmodel);
  // Simulation/FX coordinates stay in the original world. Only rendering is
  // compressed around the camera; otherwise muzzle sprites are scaled twice.
  viewmodel.muzzleWorld = out => muzzleWorld(out).applyMatrix4(inversePresentation);
  viewmodel.ejectWorld = out => ejectWorld(out).applyMatrix4(inversePresentation);
  viewmodel.ejectVelocity = (out, speed) => {
    ejectVelocity(out, speed);
    const length = out.length();
    return out.transformDirection(inversePresentation).multiplyScalar(length);
  };
  const fx = engine.registry.get('fx');
  fx._toView = function(pos, dir) { this._p2.copy(pos); this._d2.copy(dir); };
  fx._fromView = function(pos) { return this._p2.copy(pos); };
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
    if (engine.ctx.viewCamera.aspect !== engine.camera.aspect) {
      engine.ctx.viewCamera.aspect = engine.camera.aspect;
      engine.ctx.viewCamera.updateProjectionMatrix();
    }
    engine.ctx.viewCamera.position.copy(engine.camera.position);
    engine.ctx.viewCamera.quaternion.copy(engine.camera.quaternion);
    engine.ctx.viewCamera.updateMatrixWorld(true);
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
    inversePresentation.copy(viewRoot.matrix).invert();
    viewRoot.matrixWorldNeedsUpdate = true;
    for (const child of [...engine.viewScene.children]) viewRoot.add(child);
    // LightPool rewrites intensity each update. Preserve inverse-square lighting
    // when the first-person rig is shrunk for Hology's shared depth buffer.
    for (const entry of engine.registry.get('fx').viewLights?.lights ?? []) {
      const light = entry.light;
      if (light.distance !== light.userData.presentationDistance) light.userData.originalDistance = light.distance;
      light.distance = (light.userData.originalDistance ?? light.distance) * 0.12;
      light.userData.presentationDistance = light.distance;
      light.intensity *= 0.12 * 0.12;
    }
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

