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
    this.environment = { source: hdr(environmentBytes, metadata.environmentWidth, metadata.environmentHeight), intensity: 0.25 }
    this.sunLight.color.fromArray(metadata.sunColor)
    this.sunLight.intensity = metadata.sunIntensity
    // The original adds a cool upper band and a much weaker warm street-bounce band.
    this.fill.color.setRGB(0.6, 0.75, 1)
    this.fill.groundColor.setRGB(0.095, 0.083, 0.065)
    this.fill.intensity = 0.5
    ctx.scene.add(this.fill)
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

