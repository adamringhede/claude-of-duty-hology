import * as THREE from 'three'
import { createGradeLut } from '../legacy/render/lut.js'
import {
  sampleSceneColor, screenUV, uniformFloat, UniformSampler2d, vec2, vec3,
  mat4, vec4, clamp, max, min, pow, log2, dot, mix, floor, select, float,
  type FloatNode, type Vec3Node,
} from '@hology/core/shader-nodes'

// Embed each column-major 3x3 color transform in a native WGSL Matrix4.
// w=0 prevents translation and leaves the RGB transformation unchanged.
const matrix = (v: number[]) => {
  const transform = mat4(new THREE.Matrix4().fromArray([
    v[0], v[1], v[2], 0, v[3], v[4], v[5], 0,
    v[6], v[7], v[8], 0, 0, 0, 0, 1,
  ]))
  return { multiplyVec: (color: Vec3Node) => transform.multiplyVec(vec4(color, 0)).xyz }
}
const toDisplay = (x: FloatNode) => select(x.lte(float(0.0031308)), x.multiply(12.92), pow(max(x, float(0)), float(1 / 2.4)).multiply(1.055).subtract(0.055))
const toLinear = (x: FloatNode) => select(x.lte(float(0.04045)), x.divide(12.92), pow(x.add(0.055).divide(1.055), float(2.4)))

/** Original AgX + display-referred grade, returning linear color for Hology's final OETF. */
export function createOriginalComposite() {
  const lut = createGradeLut('default')
  const n = lut.size
  const volume = lut.texture.image.data
  const data = new Uint8Array(n * n * n * 4)
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const from = ((z * n + y) * n + x) * 4
    const to = (y * n * n + z * n + x) * 4
    data.set(volume.subarray(from, from + 4), to)
  }
  lut.texture.dispose()
  const texture = new THREE.DataTexture(data, n * n, n)
  texture.colorSpace = THREE.NoColorSpace // The LUT contains display code values, not an albedo.
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  const sampler = new UniformSampler2d('originalGrade', texture)
  const exposure = uniformFloat('originalExposure', 4.84)
  const source = sampleSceneColor(screenUV)
  let color: Vec3Node = source.rgb.multiplyScalar(exposure)
  color = matrix([0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.088, 0.0433, 0.0113, 0.8956]).multiplyVec(color)
  color = matrix([0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859]).multiplyVec(color)
  color = clamp(log2(max(color, vec3(1e-10, 1e-10, 1e-10))).addScalar(12.47393).divideScalar(16.499999), vec3(0, 0, 0), vec3(1, 1, 1))
  const luminance = dot(vec3(color.x, color.y, color.z), vec3(0.2126, 0.7152, 0.0722))
  color = vec3(luminance, luminance, luminance).add(color.subtract(vec3(luminance, luminance, luminance)).multiplyScalar(1.08))
  color = clamp(color, vec3(0, 0, 0), vec3(1, 1, 1))
  const c2 = color.multiply(color), c4 = c2.multiply(c2)
  color = c4.multiply(c2).multiplyScalar(15.5).subtract(c4.multiply(color).multiplyScalar(40.14))
    .add(c4.multiplyScalar(31.96)).subtract(c2.multiply(color).multiplyScalar(6.868))
    .add(c2.multiplyScalar(0.4298)).add(color.multiplyScalar(0.1191)).subtract(vec3(0.00232, 0.00232, 0.00232))
  color = matrix([1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405]).multiplyVec(color)
  color = pow(max(color, vec3(0, 0, 0)), vec3(2.2, 2.2, 2.2))
  color = clamp(matrix([1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187]).multiplyVec(color), vec3(0, 0, 0), vec3(1, 1, 1))
  const display = vec3(toDisplay(color.x), toDisplay(color.y), toDisplay(color.z)).multiplyScalar(n - 1)
  const layer = floor(display.z)
  const uv = (z: FloatNode) => vec2(display.x.add(z.multiply(n)).add(0.5).divide(n * n), display.y.add(0.5).divide(n))
  const graded = mix(sampler.sample(uv(layer)).rgb, sampler.sample(uv(min(layer.add(1), float(n - 1)))).rgb, display.z.subtract(layer))
  const output = vec3(toLinear(graded.x), toLinear(graded.y), toLinear(graded.z)).rgba(source.a)
  return { output, texture, exposure }
}
