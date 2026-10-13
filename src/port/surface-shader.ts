import * as THREE from 'three'
import { ProjectedParallax } from './parallax-node'
import {
  NodeShaderMaterial, UniformSampler2d, uniformFloat, uniformVec3,
  varying, attributes, varyingAttributes, varyingTransformed, uniforms,
  RendererWorldPositionNode, RendererWorldNormalNode, RendererViewDirectionNode,
  float, vec2, vec3, vec4, abs, select, mix, max, min, cross, dFdx, dFdy,
  standardMaterial, length, clamp, smoothstep, pow, dot,
  type Vec3Node, type FloatNode,
  colorToNormal, sqrt, transpose,
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
  let uv = p.uvMode === 'mesh' ? varyingAttributes.uv.multiplyScalar(tile).add(offset) : select(yMajor, uy, select(xMajor, ux, uz))
  const map = new UniformSampler2d('surfaceAlbedo', source.map!)
  const uvDx = dFdx(uv), uvDy = dFdy(uv)
  if (p.parallax > 0 && p.uvMode === 'planar' && !p.localSpace) {
    const axisT = select(yMajor, vec3(1, 0, 0), select(xMajor, vec3(float(0), float(0), sx.multiply(-1)), vec3(sz, float(0), float(0))))
    const tangent = safeNormal(axisT.subtract(normal.multiplyScalar(dot3(normal, axisT))))
    const bitangent = cross(normal, tangent)
    const view = new RendererViewDirectionNode(varyingTransformed.viewDir, worldPosition)
    const vt = safeNormal(vec3(dot3(view, tangent), dot3(view, bitangent), dot3(view, normal)))
    const fade = float(1).subtract(smoothstep(float(p.parallaxFade[0]), float(p.parallaxFade[1]), length(varyingTransformed.mvPosition.xyz)))
    uv = new ProjectedParallax(map, uv, vt, p.parallax, fade, p.parallaxLayers, uvDx, uvDy)
  }
  const normalMap = new UniformSampler2d('surfaceNormal', source.normalMap!)
  const ormMap = new UniformSampler2d('surfaceOrm', source.roughnessMap!)
  const detailMap = new UniformSampler2d('surfaceDetail', shared.detailAlbedo)
  const detailNormal = new UniformSampler2d('surfaceDetailNormal', shared.detailNormal)
  const macroMap = new UniformSampler2d('surfaceMacro', shared.macro)
  let sample = map.sampleGrad(uv, uvDx, uvDy)
  let orm = ormMap.sampleGrad(uv, uvDx, uvDy).rgb
  let tangentNormal = normalMap.sampleGrad(uv, uvDx, uvDy).rgb.multiplyScalar(2).subtract(vec3(1, 1, 1))
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
  const microSample = detailMap.sampleGrad(duv, uvDx.multiplyScalar(detailTiles), uvDy.multiplyScalar(detailTiles))
  const micro = microSample.a.subtract(0.5).multiply(2)
  const dn = detailNormal.sampleGrad(duv, uvDx.multiplyScalar(detailTiles), uvDy.multiplyScalar(detailTiles)).rgb.multiplyScalar(2).subtract(vec3(1, 1, 1))
  let albedo: Vec3Node = sample.rgb.multiplyScalar(float(1).add(micro.multiply(0.95).add(microSample.r.subtract(0.5).multiply(1.25)).multiply(p.detail[2]).multiply(detailFade)))
  let ao: FloatNode = orm.r.multiply(float(1).subtract(max(micro.multiply(-1), float(0)).multiply(0.30 * p.detail[2]).multiply(detailFade)))
  let roughness: FloatNode = orm.g
  let metalness: FloatNode = orm.b
  const height = clamp(sample.a.add(micro.multiply(0.16).multiply(detailFade)), 0, 1)

  const macroUv = select(abs(worldNormal.y).gte(float(0.62)), worldPosition.xz,
    vec2(worldPosition.x.add(worldPosition.z.multiply(0.63)), worldPosition.y))
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

  // Match the original projection frames instead of using mesh-UV tangents.
  const Tx = vec3(float(0), float(0), sx.multiply(-1)), Bx = vec3(0, 1, 0), Nx = vec3(sx, float(0), float(0))
  const Ty = vec3(1, 0, 0), By = vec3(float(0), float(0), sy.multiply(-1)), Ny = vec3(float(0), sy, float(0))
  const Tz = vec3(sz, float(0), float(0)), Bz = vec3(0, 1, 0), Nz = vec3(float(0), float(0), sz)
  const T = select(yMajor, Ty, select(xMajor, Tx, Tz))
  const B = select(yMajor, By, select(xMajor, Bx, Bz))
  const axisN = select(yMajor, Ny, select(xMajor, Nx, Nz))
  const decode = (uv: ReturnType<typeof vec2>) => normalMap.sample(uv).rgb.multiplyScalar(2).subtract(vec3(1, 1, 1))
  const frameNormal = (n: Vec3Node, t: Vec3Node, b: Vec3Node, axis: Vec3Node) =>
    t.multiplyScalar(n.x.multiply(p.normalStrength)).add(b.multiplyScalar(n.y.multiply(p.normalStrength))).add(axis.multiplyScalar(n.z))
  let projectedNormal: Vec3Node
  if (p.uvMode === 'triplanar') {
    const weights = pow(a, vec3(5, 5, 5))
    const w = weights.divideScalar(max(weights.x.add(weights.y).add(weights.z), float(0.0001)))
    projectedNormal = safeNormal(frameNormal(decode(ux), Tx, Bx, Nx).multiplyScalar(w.x)
      .add(frameNormal(decode(uy), Ty, By, Ny).multiplyScalar(w.y))
      .add(frameNormal(decode(uz), Tz, Bz, Nz).multiplyScalar(w.z)))
  } else {
    const trueT = safeNormal(T.subtract(normal.multiplyScalar(dot3(normal, T))))
    const n = vec3(tangentNormal.x.multiply(p.normalStrength).add(dn.x.multiply(p.detail[1]).multiply(detailFade)),
      tangentNormal.y.multiply(p.normalStrength).add(dn.y.multiply(p.detail[1]).multiply(detailFade)), tangentNormal.z)
    projectedNormal = safeNormal(trueT.multiplyScalar(n.x).add(cross(normal, trueT).multiplyScalar(n.y)).add(normal.multiplyScalar(n.z)))
  }
  if (p.uvMode === 'triplanar') projectedNormal = safeNormal(projectedNormal.add(T.multiplyScalar(dn.x).add(B.multiplyScalar(dn.y)).multiplyScalar(p.detail[1]).multiplyScalar(detailFade)))
  let surfaceNormal = p.uvMode === 'mesh'
    ? colorToNormal(vec3(tangentNormal.x.multiply(p.normalStrength).add(dn.x.multiply(p.detail[1]).multiply(detailFade)),
        tangentNormal.y.multiply(p.normalStrength).add(dn.y.multiply(p.detail[1]).multiply(detailFade)), tangentNormal.z).addScalar(1).multiplyScalar(0.5), 1, undefined, undefined, uv)
    : safeNormal((p.localSpace ? varying(uniforms.normalMatrix).multiplyVec(projectedNormal)
      : uniforms.viewMatrix.multiplyVec(vec4(projectedNormal, 0)).xyz))
  if (p.cloth?.[1] !== undefined) {
    const underside = float(1).subtract(smoothstep(float(-0.7), float(0.1), worldNormal.y))
    albedo = albedo.multiplyScalar(mix(float(1), float(p.cloth[1]), underside))
    roughness = clamp(roughness.add(underside.multiply(0.05)), 0, 1)
    if (p.cloth[2] > 0) {
      const clothUV = vec2(worldPosition.x.add(worldPosition.z.multiply(0.63)), worldPosition.y.multiply(0.7).add(worldPosition.z.multiply(0.4))).multiplyScalar(3.4)
      const c = macroMap.sample(clothUV).b
      const tilt = vec3(macroMap.sample(clothUV.add(vec2(0.05, 0))).b.subtract(c).multiply(-1),
        macroMap.sample(clothUV.add(vec2(0, 0.05))).b.subtract(c).multiply(-1), float(0)).multiplyScalar(p.cloth[2] * 9)
      surfaceNormal = safeNormal(surfaceNormal.add(tilt))
      albedo = albedo.multiplyScalar(float(1).subtract(c.subtract(0.5).multiply(p.cloth[2] * 0.9)))
    }
  }

  const opacity = uniformFloat('surfaceOpacity', source.opacity)
  const alpha = p.alphaMask ? sample.a.multiply(opacity) : opacity
  const emissive = uniformVec3('surfaceEmissive', new THREE.Vector3().setFromColor(source.emissive)).multiplyScalar(uniformFloat('surfaceEmissiveIntensity', source.emissiveIntensity))
  const worldShadingNormal = safeNormal(transpose(uniforms.viewMatrix).multiplyVec(vec4(surfaceNormal, 0)).xyz)
  const lighting = shared.lighting
  // These RGB irradiances are already linear, matching the original live rig.
  const viewLighting = p.localSpace && lighting?.view ? vec3(lighting.view.key).multiplyScalar(max(float(0), dot3(surfaceNormal, safeNormal(vec3(-0.45, 0.75, 0.55)))))
    .add(vec3(lighting.view.fill).multiplyScalar(max(float(0), dot3(surfaceNormal, safeNormal(vec3(0.6, -0.15, 0.5))))))
    .add(vec3(lighting.view.rim).multiplyScalar(max(float(0), dot3(surfaceNormal, safeNormal(vec3(0.2, 0.35, -0.9))))))
    .add(vec3(lighting.view.bounce).multiplyScalar(max(float(0), dot3(surfaceNormal, safeNormal(vec3(-0.2, -0.86, 0.47))))))
    .add(mix(colorNode(0x36302a), colorNode(0x8fb6ff), worldShadingNormal.y.multiply(0.5).add(0.5)).multiplyScalar(lighting.view.hemisphereIntensity)) : null
  const streetLighting = lighting ? vec3(lighting.sky).multiplyScalar(smoothstep(float(-0.95), float(0.85), worldShadingNormal.y))
    .add(vec3(lighting.ground).multiplyScalar(smoothstep(float(-0.05), float(0.7), worldShadingNormal.y.multiply(-1))))
    .add(vec3(lighting.ground).multiplyScalar(clamp(dot3(worldShadingNormal, vec3(lighting.antiSun)).add(0.12).divide(1.12), 0, 1).multiply(0.008 / 0.013))) : null
  const shading = { color: albedo.rgba(alpha), roughness, metalness, 
    normal: surfaceNormal,
    ambientOcclusion: ao, emissive: emissive.rgb, bakedLight: viewLighting ?? streetLighting?.divideScalar(max(sqrt(ao), float(0.01))) }
  const physicalSource = source as THREE.MeshPhysicalMaterial
  const shadedColor = standardMaterial({ ...shading, specular: true,
    environmentDiffuseIntensity: 0.03,
    specularIntensity: physicalSource.specularIntensity ?? 1,
    specularColor: colorNode(physicalSource.specularColor ?? 0xffffff),
    ior: physicalSource.ior ?? 1.5,
    sheenColor: physicalSource.sheen > 0 ? colorNode(physicalSource.sheenColor).multiplyScalar(physicalSource.sheen) : null,
    sheenRoughness: physicalSource.sheenRoughness ?? 1,
    clearcoat: physicalSource.clearcoat > 0 ? physicalSource.clearcoat : null,
    clearcoatRoughness: physicalSource.clearcoatRoughness ?? 0,
    iridescence: physicalSource.iridescence > 0 ? physicalSource.iridescence : null,
    iridescenceIOR: physicalSource.iridescenceIOR ?? 1.3,
    iridescenceThickness: physicalSource.iridescenceThicknessRange?.[1] ?? 400,
  })
  const material = new NodeShaderMaterial({
    color: shadedColor,
    normal: surfaceNormal, 
    roughness, opacity: alpha, emissive,
    envMap: shared.environment,
    transparent: source.transparent, alphaTest: p.alphaMask ? 0.35 : source.alphaTest,
    uniforms: { surfaceTint: { value: new THREE.Vector3().setFromColor(tintColor) },
      surfaceTile: { value: p.uvMode === 'mesh' ? p.scale : 1 / p.scale },
      surfaceOpacity: { value: source.opacity }, surfaceEmissive: { value: new THREE.Vector3().setFromColor(source.emissive) },
      surfaceEmissiveIntensity: { value: source.emissiveIntensity }, envMapIntensity: { value: source.envMapIntensity } },
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





