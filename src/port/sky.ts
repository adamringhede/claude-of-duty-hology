import * as THREE from 'three';
import { Celestial } from '../legacy/sky/celestial.js';
import { NodeShaderMaterial, varying, attributes, normalize, mix, vec3, float,
  smoothstep, uniformVec3, dot, pow, max, SimplexNoiseNode } from '@hology/core/shader-nodes';

export class HologySky {
  ctx: any;
  celestial: any;
  hour: number;
  timeRate: number;
  weather: Record<string, number>;
  sunLight: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  sunNode: ReturnType<typeof uniformVec3>;
  material: NodeShaderMaterial;
  dome: THREE.Mesh;
  static id = 'sky';
  static deps = ['render', 'materials'];
  async init(ctx) {
    this.ctx = ctx;
    this.celestial = new Celestial();
    this.hour = 16.5;
    this.timeRate = 0;
    this.weather = {};
    this.sunLight = new THREE.DirectionalLight(0xffe3be, 3.2);
    // Hology's CSM owns the shadow-casting directional light.
    this.fill = new THREE.HemisphereLight(0xb8d3f5, 0x9a8160, 1.7);
    ctx.scene.add(this.fill);
    const direction = normalize(varying(attributes.position));
    this.sunNode = uniformVec3('skySunDirection', this.celestial.sun);
    const gradient = mix(vec3(0.62, 0.68, 0.73), vec3(0.055, 0.20, 0.43), smoothstep(float(0), float(0.8), direction.y));
    const disc = pow(max(float(0), dot(direction, vec3(this.sunNode.x, this.sunNode.y, this.sunNode.z))), float(16000));
    const cloudCoord = vec3(direction.x.divide(max(float(0.12), direction.y)),
      float(1.8), direction.z.divide(max(float(0.12), direction.y)));
    const noise = new SimplexNoiseNode(cloudCoord.xz.multiplyScalar(1.4)).multiply(0.62)
      .add(new SimplexNoiseNode(cloudCoord.xz.multiplyScalar(3.7)).multiply(0.26))
      .add(new SimplexNoiseNode(cloudCoord.xz.multiplyScalar(9)).multiply(0.12));
    const cloud = smoothstep(float(0.56), float(0.78), noise)
      .multiply(smoothstep(float(0.04), float(0.3), direction.y));
    const cloudColor = mix(vec3(0.32, 0.36, 0.43), vec3(0.93, 0.88, 0.79), noise);
    const color = mix(gradient, cloudColor, cloud).add(vec3(4, 3.4, 2.6).multiplyScalar(disc));
    this.material = new NodeShaderMaterial({ color: color.rgba(1), fog: false });
    this.material.side = THREE.BackSide;
    this.material.depthWrite = false;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    ctx.scene.add(this.dome);
    ctx.scene.background = new THREE.Color(0xa5b6c9);
    ctx.scene.fog = new THREE.FogExp2(0xb4b6b8, 0.00145);
    this.setTimeOfDay(this.hour);
  }
  get sunDirection() { return this.celestial.sun; }
  get sunAltitude() { return this.celestial.sunAlt; }
  setTimeOfDay(hour) {
    this.hour = hour;
    this.celestial.setHour(hour);
    this.sunLight.position.copy(this.celestial.sun).multiplyScalar(200);
    const r = this.ctx.get('render');
    r.sunDir.copy(this.celestial.sun); r.activeSun = this.sunLight;
    this.ctx.hologyWorld?.directionalLight.direction.copy(this.celestial.sun).negate();
    this.ctx.events.emit('sky:changed', { hour, sunDir: this.sunDirection, sunIntensity: 3.2 });
  }
  setTimeRate(rate) { this.timeRate = rate; }
  setWeather(weather) { Object.assign(this.weather, weather); }
  cloudShadowAt() { return 1; }
  update(dt) { if (this.timeRate) this.setTimeOfDay((this.hour + dt * this.timeRate / 3600) % 24); this.dome.position.copy(this.ctx.camera.position); }
  dispose() { this.dome.removeFromParent(); this.fill.removeFromParent(); this.dome.geometry.dispose(); this.material.dispose(); }
}
