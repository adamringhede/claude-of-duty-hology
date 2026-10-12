import * as THREE from 'three'
import {
  NodeShaderMaterial, UniformSampler2d, uniformFloat, uniformVec3,
  varying, attributes, varyingAttributes, varyingTransformed, uniforms,
  RendererWorldPositionNode, RendererWorldNormalNode,
  float, vec2, vec3, vec4, abs, select, mix, max, min, cross, dFdx, dFdy,
  standardMaterial, length, clamp, smoothstep, pow, dot,
  type Vec3Node, type FloatNode,
} from '@hology/core/shader-nodes'

const safeNormal = (v: Vec3Node) => v.divideScalar(max(length(v), float(0.000001)))
const colorNode = (color: THREE.ColorRepresentation) => vec3(new THREE.Vector3().setFromColor(new THREE.Color(color)))
const dot3 = (a: Vec3Node, b: Vec3Node) => dot(vec3(a.x, a.y, a.z), vec3(b.x, b.y, b.z))


/** Original material layers expressed as Hology nodes, with linear color throughout. */
export function buildSurfaceMaterial(source: THREE.MeshStandardMaterial, p: any, shared: any) {
  const worldPosition = new RendererWorldPositionNode(varyingTransformed.worldPosition)
  const worldNormal = new RendererWorldNormalNode(varyingTransformed.normal)
  const position = p.localSpace ? varying(attributes.position) : worldPosition
  const normal = p.localSpace ? varying(attributes.normal) : worldNormal
  const a = abs(normal)
  const sx = select(normal.x.gte(float(0)), float(1), float(-1))
  const sy = select(normal.y.gte(float(0)), float(1), float(-1))
  const sz = select(normal.z.gte(float(0)), float(1), float(-1))
  const tile = uniformFloat('surfaceTile', p.uvMode === 'mesh' ? p.scale : 1 / p.scale)
  const offset = vec2(p.offset?.[0] ?? 0, p.offset?.[1] ?? 0)
  const ux = vec2(position.z.multiply(sx).multiply(-1), position.y).multiplyScalar(tile).add(offset)
  const uy = vec2(position.x, position.z.multiply(sy).multiply(-1)).multiplyScalar(tile).add(offset)
  const uz = vec2(position.x.multiply(sz), position.y).multiplyScalar(tile).add(offset)
  const yMajor = a.y.gt(max(a.x, a.z))
  const xMajor = a.x.gt(a.z)
  const uv = p.uvMode === 'mesh' ? varyingAttributes.uv.multiplyScalar(tile).add(offset) : select(yMajor, uy, select(xMajor, ux, uz))
  const map = new UniformSampler2d('surfaceAlbedo', source.map!)
  const normalMap = new UniformSampler2d('surfaceNormal', source.normalMap!)
  const ormMap = new UniformSampler2d('surfaceOrm', source.roughnessMap!)
  const detailMap = new UniformSampler2d('surfaceDetail', shared.detailAlbedo)
  const detailNormal = new UniformSampler2d('surfaceDetailNormal', shared.detailNormal)
  const macroMap = new UniformSampler2d('surfaceMacro', shared.macro)
  let sample = map.sample(uv)
  let orm = ormMap.sample(uv).rgb
  let tangentNormal: Vec3Node = normalMap.sample(uv).rgb.multiplyScalar(2).subtract(vec3(1, 1, 1))
  if (p.uvMode === 'triplanar') {
    const weights = pow(a, vec3(5, 5, 5))
    const w = weights.divideScalar(max(weights.x.add(weights.y).add(weights.z), float(0.0001)))
    sample = map.sample(ux).multiplyScalar(w.x).add(map.sample(uy).multiplyScalar(w.y)).add(map.sample(uz).multiplyScalar(w.z))
    orm = ormMap.sample(ux).rgb.multiplyScalar(w.x).add(ormMap.sample(uy).rgb.multiplyScalar(w.y)).add(ormMap.sample(uz).rgb.multiplyScalar(w.z))
  }
  const distance = length(varyingTransformed.mvPosition.xyz)
  const detailFade = float(1).subtract(smoothstep(float(p.detail[3] * 0.45), float(p.detail[3]), distance))
  const detailTiles = p.uvMode === 'mesh' || !(p.detailWorld > 0) || p.scale < 0.3 ? p.detail[0] : Math.max(1.2, p.scale / p.detailWorld)
  const duv = uv.multiplyScalar(detailTiles)
  const microSample = detailMap.sample(duv)
  const micro = microSample.a.subtract(0.5).multiply(2)
  const dn = detailNormal.sample(duv).rgb.multiplyScalar(2).subtract(vec3(1, 1, 1))
  tangentNormal = vec3(tangentNormal.x.multiply(p.normalStrength).add(dn.x.multiply(p.detail[1]).multiply(detailFade)),
    tangentNormal.y.multiply(p.normalStrength).add(dn.y.multiply(p.detail[1]).multiply(detailFade)), tangentNormal.z)
  let albedo: Vec3Node = sample.rgb.multiplyScalar(float(1).add(micro.multiply(0.95).add(microSample.r.subtract(0.5).multiply(1.25)).multiply(p.detail[2]).multiply(detailFade)))
  let ao: FloatNode = orm.r.multiply(float(1).subtract(max(micro.multiply(-1), float(0)).multiply(0.30 * p.detail[2]).multiply(detailFade)))
  let roughness: FloatNode = orm.g
  let metalness: FloatNode = orm.b
  const height = clamp(sample.a.add(micro.multiply(0.16).multiply(detailFade)), 0, 1)

  const macroUv = vec2(position.x.add(position.y.multiply(0.37)), position.z.add(position.y.multiply(0.53)))
  const mac1 = macroMap.sample(macroUv.multiplyScalar(p.macro[0]))
  const mac2 = macroMap.sample(macroUv.multiplyScalar(p.macro[0] * 0.211).addScalar(0.37))
  const macro = clamp(mac1.r.multiply(0.55).add(mac2.b.multiply(0.45)).subtract(0.5).multiply(p.macroBig[0]).add(0.5), 0, 1)
  albedo = albedo.multiplyScalar(mix(float(1), macro.multiply(0.92).add(0.55), float(p.macro[1])))
  if (p.macroBig[1] > 0) {
    const bigUv = macroUv.multiplyScalar(p.macroBig[2])
    const big = clamp(macroMap.sample(bigUv).r.multiply(0.62).add(macroMap.sample(bigUv.multiplyScalar(0.37).addScalar(0.61)).b.multiply(0.38)).subtract(0.5).multiply(2.3), -1, 1)
    albedo = albedo.multiplyScalar(float(1).add(big.multiply(p.macroBig[1])))
    roughness = roughness.subtract(big.multiply(p.macroBig[1] * 0.55))
  }
  albedo = albedo.multiply(mix(vec3(1, 1, 1), vec3(1.05, 1, 0.93), mac2.r.subtract(0.5).multiply(p.macro[3])))
  roughness = clamp(roughness.add(mac1.g.subtract(0.5).multiply(p.macro[2])).add(mac1.a.subtract(0.5).multiply(0.16)).subtract(micro.multiply(0.07).multiply(detailFade)), 0, 1)
  const cavity = float(1).subtract(height)
  const up = clamp(worldNormal.y, 0, 1)
  const vertical = float(1).subtract(smoothstep(float(0.34), float(0.72), abs(worldNormal.y)))
  const dust = up.multiply(up).multiply(p.weather[0]).multiply(smoothstep(float(0.30), float(0.80), mac1.b.multiply(0.7).add(mac2.g.multiply(0.5))))
  albedo = mix(albedo, colorNode(p.dustColor), dust.multiply(0.75))
  roughness = roughness.add(dust.multiply(0.30))
  metalness = metalness.multiply(float(1).subtract(dust.multiply(0.85)))
  const aboveGround = max(float(0), worldPosition.y.subtract(p.groundY ?? 0))
  const splash = float(1).subtract(smoothstep(float(0), float(Math.max(p.weather[2], 0.001)), aboveGround)).multiply(vertical).multiply(p.weather[2] > 0 ? 1 : 0)
  albedo = mix(albedo, colorNode(p.dustColor), splash.multiply(0.4))
  albedo = mix(albedo, colorNode(p.grimeColor), cavity.multiply(cavity).multiply(p.weather[3]))
  ao = ao.multiply(float(1).subtract(cavity.multiply(p.weather[3] * 0.5)))
  const mask = varying(attributes.color)
  if (p.vertexMasks) {
    const wearNoise = smoothstep(float(0.25), float(0.85), mac1.b.multiply(0.65).add(mac2.a.multiply(0.55)))
    const wear = clamp(mask.r.multiply(p.wear[0]).multiply(smoothstep(float(0.30), float(0.80), height).multiply(0.45).add(0.55)).multiply(wearNoise.multiply(1.15).add(0.25)), 0, 1)
    albedo = mix(albedo, colorNode(p.wearColor), wear.multiply(p.wearMaterial[3]))
    roughness = mix(roughness, float(p.wearMaterial[0]), wear)
    metalness = mix(metalness, float(p.wearMaterial[1]), wear)
    const grime = mask.g.multiply(p.wear[1]).multiply(cavity.multiply(0.65).add(0.35)).multiply(mac2.g.multiply(0.9).add(0.45))
    albedo = mix(albedo, colorNode(p.grimeColor), grime.multiply(0.8))
    roughness = roughness.add(grime.multiply(0.22))
    metalness = metalness.multiply(float(1).subtract(grime.multiply(0.8)))
    ao = ao.multiply(float(1).subtract(mask.b.multiply(p.wear[2])))
  }
  const tintColor = source.color.clone().multiply(new THREE.Color(p.tint ?? 0xffffff))
  albedo = albedo.multiply(uniformVec3('surfaceTint', new THREE.Vector3().setFromColor(tintColor)))
  roughness = clamp(roughness.multiply(p.roughness[0]).add(p.roughness[1]), Math.max(p.roughness[2], 0.015), 1)
  metalness = clamp(metalness.multiply(source.metalness), 0, 1)
  ao = clamp(ao.subtract(1).multiply(p.aoStrength).add(1), 0, 1)

  const N = varyingTransformed.normal
  const posView = varyingTransformed.mvPosition.xyz
  const dp1 = dFdx(posView), dp2 = dFdy(posView)
  const tangent = cross(dp2, N).multiplyScalar(dFdx(uv).x).add(cross(N, dp1).multiplyScalar(dFdy(uv).x))
  const T = safeNormal(select(length(tangent).gt(float(0.000001)), tangent,
    cross(select(abs(N.y).lt(float(0.99)), vec3(0, 1, 0), vec3(1, 0, 0)), N)))
  const B = safeNormal(cross(N, T))
  let shadingNormal = safeNormal(T.multiplyScalar(tangentNormal.x).add(B.multiplyScalar(tangentNormal.y)).add(N.multiplyScalar(tangentNormal.z)))

  const opacity = uniformFloat('surfaceOpacity', source.opacity)
  const alpha = p.alphaMask ? sample.a.multiply(opacity) : opacity
  const emissive = uniformVec3('surfaceEmissive', new THREE.Vector3().setFromColor(source.emissive)).multiplyScalar(uniformFloat('surfaceEmissiveIntensity', source.emissiveIntensity))
  // Camera-space key/fill/rim/bounce reproduces the original first-person light rig.
  const viewLighting = p.localSpace ? colorNode(0xffe8c4).multiplyScalar(max(float(0), dot3(varyingTransformed.normal, safeNormal(vec3(-0.45, 0.75, 0.55)))).multiply(2.53))
    .add(vec3(0.56, 0.74, 1).multiplyScalar(max(float(0), dot3(varyingTransformed.normal, safeNormal(vec3(0.6, -0.15, 0.5)))).multiply(0.76)))
    .add(vec3(1, 0.8, 0.55).multiplyScalar(max(float(0), dot3(varyingTransformed.normal, safeNormal(vec3(0.2, 0.35, -0.9)))).multiply(1.26)))
    .add(vec3(1, 0.75, 0.5).multiplyScalar(max(float(0), dot3(varyingTransformed.normal, safeNormal(vec3(-0.2, -0.86, 0.47)))).multiply(0.86))) : null
  const lighting = shared.lighting
  const streetLighting = lighting ? vec3(lighting.sky).multiplyScalar(smoothstep(float(-0.95), float(0.85), worldNormal.y))
    .add(vec3(lighting.ground).multiplyScalar(smoothstep(float(-0.05), float(0.7), worldNormal.y.multiply(-1))))
    .add(vec3(lighting.ground).multiplyScalar(clamp(dot3(worldNormal, vec3(lighting.antiSun)).add(0.12).divide(1.12), 0, 1).multiply(0.008 / 0.013))) : null
  const shading = { color: albedo.rgba(alpha), roughness, metalness, normal: shadingNormal,
    ambientOcclusion: ao, emissive: emissive.rgb, bakedLight: viewLighting ?? streetLighting }
  const physical = standardMaterial({ ...shading, specular: true })
  const intensity = (source as THREE.MeshPhysicalMaterial).specularIntensity ?? 1
  const shadedColor = intensity < 1 ? mix(standardMaterial({ ...shading, specular: false }), physical,
    metalness.multiply(1 - intensity).add(intensity)) : physical
  const material = new NodeShaderMaterial({
    color: shadedColor,
    normal: shadingNormal, roughness, opacity: alpha, emissive,
    transparent: source.transparent, alphaTest: p.alphaMask ? 0.35 : source.alphaTest,
    uniforms: { surfaceTint: { value: new THREE.Vector3().setFromColor(tintColor) },
      surfaceTile: { value: p.uvMode === 'mesh' ? p.scale : 1 / p.scale },
      surfaceOpacity: { value: source.opacity }, surfaceEmissive: { value: new THREE.Vector3().setFromColor(source.emissive) },
      surfaceEmissiveIntensity: { value: source.emissiveIntensity } },
  })
  material.name = source.name
  material.side = source.side
  material.depthWrite = source.depthWrite
  material.polygonOffset = source.polygonOffset
  material.polygonOffsetFactor = source.polygonOffsetFactor
  material.polygonOffsetUnits = source.polygonOffsetUnits
  Object.assign(material, { color: tintColor, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity })
  material.userData.surfaceParams = p
  return material
}





