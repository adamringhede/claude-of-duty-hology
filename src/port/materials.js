import * as THREE from 'three';
import { MaterialSystem } from '../legacy/materials/index.js';
import { DEFAULT_PARAMS } from '../legacy/materials/shader.js';
import { LIBRARY } from '../legacy/materials/library.js';
import { buildSurfaceMaterial } from './surface-shader';

/** Portable texture assets and Hology node materials; no WebGL renderer at runtime. */
export class HologyMaterials extends MaterialSystem {
  static id = 'materials';
  static deps = ['render'];
  async init(ctx) {
    this.ctx = ctx;
    this._quality = 1;
    this._built = true; this._shared = { detailNormal: null, macro: null };
    this.nodeMaterials = new Map();
    this.textures = new Set();
    const base = `${import.meta.env.BASE_URL}port-textures/`;
    const response = await fetch(`${base}manifest.json`);
    if (!response.ok) throw new Error(`Texture manifest: HTTP ${response.status}`);
    const manifest = await response.json();
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.entries(manifest).map(async ([key, entry]) => {
      const set = { ...entry };
      await Promise.all(['albedo', 'normal', 'orm'].map(async channel => {
        const texture = await loader.loadAsync(base + entry[channel]);
        texture.flipY = false;
        texture.colorSpace = channel === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = ctx.config.q.anisotropy;
        texture.needsUpdate = true;
        set[channel] = texture;
        this.textures.add(texture);
      }));
      this._sets.set(key, set);
    }));
  }
  getTextureSet(name, opts = {}) {
    const key = this._resolve(name);
    const bake = { ...LIBRARY[key].bake, ...(opts.bake ?? {}) };
    bake.size = this._size(bake.size);
    const set = this._sets.get(this._bakeKey(key, bake));
    if (!set) throw new Error(`Missing baked surface: ${this._bakeKey(key, bake)}`);
    return set;
  }
  get(name, opts = {}) {
    const source = super.get(name, opts);
    if (this.nodeMaterials.has(source)) return this.nodeMaterials.get(source);
    const p = { ...DEFAULT_PARAMS, ...LIBRARY[this._resolve(name)].mat, ...opts };
    const material = buildSurfaceMaterial(source, p);
    this.nodeMaterials.set(source, material);
    return material;
  }
  tune(material, changes) {
    const u = material.uniforms;
    if (changes.tint !== undefined) {
      material.color.set(changes.tint);
      u.surfaceTint?.value.setFromColor(material.color);
    }
    if (changes.scale !== undefined) u.surfaceTile.value = material.userData.surfaceParams.uvMode === 'mesh' ? changes.scale : 1 / changes.scale;
    return material;
  }
  update() {
    for (const material of this.nodeMaterials.values()) {
      material.uniforms.surfaceEmissive?.value.setFromColor(material.emissive);
      if (material.uniforms.surfaceEmissiveIntensity) material.uniforms.surfaceEmissiveIntensity.value = material.emissiveIntensity;
    }
  }
  finishBaking() {}
  dispose() {
    for (const m of this.nodeMaterials.values()) m.dispose();
    for (const texture of this.textures) texture.dispose();
    super.dispose();
  }
}
