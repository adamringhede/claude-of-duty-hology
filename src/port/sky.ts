import * as THREE from 'three'
import { Celestial } from '../legacy/sky/celestial.js'
import { NodeShaderMaterial, UniformSampler2d, varying, attributes, normalize, vec2, atan2, asin, clamp } from '@hology/core/shader-nodes'

/** Original atmospheric radiance baked offline; all sampling and PMREM run on Hology WebGPU. */
export class HologySky {
  static id = 'sky'
  static deps = ['render', 'materials']
  ctx: any
  celestial = new Celestial()
  hour = 16.5
  timeRate = 0
  weather: Record<string, number> = {}
  sunLight = new THREE.DirectionalLight()
  fill = new THREE.HemisphereLight()
  material: NodeShaderMaterial
  dome: THREE.Mesh
  environment: { source: THREE.DataTexture, intensity: number }
  skyTexture: THREE.DataTexture
  metadata: any

  async init(ctx: any) {
    this.ctx = ctx
    const base = `${import.meta.env.BASE_URL}appearance/`
    const [metadata, visibleBytes, environmentBytes] = await Promise.all([
      fetch(base + 'day.json').then(r => r.json()),
      fetch(base + 'sky-day.rgba16f').then(r => r.arrayBuffer()),
      fetch(base + 'sky-environment.rgba16f').then(r => r.arrayBuffer()),
    ])
    this.metadata = metadata
    const hdr = (bytes: ArrayBuffer, width: number, height: number) => {
      const texture = new THREE.DataTexture(new Uint16Array(bytes), width, height, THREE.RGBAFormat, THREE.HalfFloatType)
      texture.colorSpace = THREE.LinearSRGBColorSpace
      texture.mapping = THREE.EquirectangularReflectionMapping
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.needsUpdate = true
      return texture
    }
    this.skyTexture = hdr(visibleBytes, metadata.width, metadata.height)
    this.skyTexture.mapping = THREE.UVMapping
    this.environment = { source: hdr(environmentBytes, metadata.environmentWidth, metadata.environmentHeight), intensity: 1.6 * 0.030 * metadata.indirectScale }
    this.sunLight.color.fromArray(metadata.sunColor)
    this.sunLight.intensity = metadata.sunIntensity
    // Preserve the original upper-sky and street-bounce irradiance budget.
    const skyHue = new THREE.Vector3().fromArray(metadata.ambientColor)
    const ambientLevel = Math.max(skyHue.x, skyHue.y, skyHue.z)
    skyHue.divideScalar(ambientLevel)
    const luminance = skyHue.dot(new THREE.Vector3(0.2126, 0.7152, 0.0722))
    skyHue.set(Math.max(0, luminance + (skyHue.x - luminance) * 1.18),
      Math.max(0, luminance + (skyHue.y - luminance) * 1.18),
      Math.max(0, luminance + (skyHue.z - luminance) * 1.18))
    skyHue.divideScalar(Math.max(skyHue.x, skyHue.y, skyHue.z)).multiplyScalar(0.32 * ambientLevel / 0.15)
    const groundHue = new THREE.Vector3(this.sunLight.color.r * 0.33,
      this.sunLight.color.g * 0.29, this.sunLight.color.b * 0.225)
    groundHue.divideScalar(Math.max(groundHue.x, groundHue.y, groundHue.z)).multiplyScalar(0.013 * this.sunLight.intensity)
    ctx.get('materials')._shared.environment = this.environment.source
    ctx.get('materials')._shared.lighting = { sky: skyHue, ground: groundHue,
      antiSun: new THREE.Vector3(-metadata.sunDirection[0] + 1e-4, 0.2801, -metadata.sunDirection[2] + 1e-4).normalize() }
    const direction = normalize(varying(attributes.position))
    const uv = vec2(atan2(direction.z, direction.x).divide(2 * Math.PI).add(0.5),
      asin(clamp(direction.y, -1, 1)).divide(Math.PI).add(0.5))
    this.material = new NodeShaderMaterial({ color: new UniformSampler2d('atmosphericSky', this.skyTexture).sample(uv), fog: false })
    this.material.side = THREE.BackSide
    this.material.depthWrite = false
    this.material.transparent = false
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.material)
    this.dome.name = 'Original atmospheric sky'
    this.dome.frustumCulled = false
    this.dome.renderOrder = -10000
    ctx.scene.add(this.dome)
    ctx.scene.background = null
    ctx.scene.fog = new THREE.FogExp2(0xb4b6b8, 0.00145)
    this.setTimeOfDay(metadata.hour)
  }
  get sunDirection() { return this.celestial.sun }
  get sunAltitude() { return this.celestial.sunAlt }
  setTimeOfDay(hour: number) {
    this.hour = hour
    this.celestial.setHour(hour)
    this.sunLight.position.copy(this.celestial.sun).multiplyScalar(200)
    const r = this.ctx.get('render')
    r.sunDir.copy(this.celestial.sun)
    r.activeSun = this.sunLight
    const world = this.ctx.hologyWorld
    world.directionalLight.direction.copy(this.celestial.sun).negate()
    world.directionalLight.intensity = this.sunLight.intensity
    this.ctx.events.emit('sky:changed', { hour, sunDir: this.sunDirection, sunIntensity: this.sunLight.intensity })
  }
  setTimeRate(rate: number) { this.timeRate = rate }
  setWeather(weather: Record<string, number>) { Object.assign(this.weather, weather) }
  cloudShadowAt() { return 1 }
  update(dt: number) {
    if (this.timeRate) this.setTimeOfDay((this.hour + dt * this.timeRate / 3600) % 24)
    this.dome.position.copy(this.ctx.camera.position)
  }
  dispose() {
    this.dome.removeFromParent(); this.fill.removeFromParent()
    this.dome.geometry.dispose(); this.material.dispose()
    this.skyTexture.dispose(); this.environment.source.dispose()
  }
}

