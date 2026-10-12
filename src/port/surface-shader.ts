import * as THREE from 'three'
import {
  NodeShaderMaterial, UniformSampler2d, uniformFloat, uniformVec3,
  varying, attributes, varyingAttributes, varyingTransformed, uniforms,
  RendererWorldPositionNode, RendererWorldNormalNode,
  float, vec2, vec3, abs, select, mix, max, min, normalize, cross, dFdx, dFdy,
  standardMaterial, length,
} from '@hology/core/shader-nodes'

/** Projected PBR graph; both forward and Hology's depth/shadow variants compile from this graph. */
export function buildSurfaceMaterial(source: THREE.MeshStandardMaterial, p: any) {
  const position = p.localSpace ? varying(attributes.position) : new RendererWorldPositionNode(varyingTransformed.worldPosition)
  const normal = p.localSpace ? varying(attributes.normal) : new RendererWorldNormalNode(varyingTransformed.normal)
  const a = abs(normal)
  const tile = uniformFloat('surfaceTile', p.uvMode === 'mesh' ? p.scale : 1 / p.scale)
  const uv = (p.uvMode === 'mesh' ? varyingAttributes.uv : select(
    a.y.gt(max(a.x, a.z)), vec2(position.x, position.z),
    select(a.x.gt(a.z), vec2(position.z, position.y), vec2(position.x, position.y))
  )).multiplyScalar(tile)
  const albedo = new UniformSampler2d('surfaceAlbedo', source.map!).sample(uv)
  const orm = new UniformSampler2d('surfaceOrm', source.roughnessMap!).sample(uv)
  const ntex = new UniformSampler2d('surfaceNormal', source.normalMap!).sample(uv).rgb
    .multiplyScalar(2).subtract(vec3(1, 1, 1))
  const N = varyingTransformed.normal
  const posView = varyingTransformed.mvPosition.xyz
  const dp1 = dFdx(posView), dp2 = dFdy(posView)
  const duv1 = dFdx(uv), duv2 = dFdy(uv)
  const tangent = cross(dp2, N).multiplyScalar(duv1.x).add(cross(N, dp1).multiplyScalar(duv2.x))
  // Projected UVs can collapse on a triangle edge. A zero tangent must never
  // enter normalize(): a NaN in HDR lighting spreads through the bloom pyramid.
  const safeTangent = select(length(tangent).gt(float(0.000001)), tangent,
    cross(select(abs(N.y).lt(float(0.99)), vec3(0, 1, 0), vec3(1, 0, 0)), N))
  const T = safeTangent.divideScalar(max(length(safeTangent), float(0.000001)))
  const b = cross(N, T)
  const B = b.divideScalar(max(length(b), float(0.000001)))
  const perturbation = T.multiplyScalar(ntex.x.multiply(p.normalStrength ?? 1))
    .add(B.multiplyScalar(ntex.y.multiply(p.normalStrength ?? 1))).add(N.multiplyScalar(ntex.z))
  const shadingNormal = perturbation.divideScalar(max(length(perturbation), float(0.000001)))
  const tintColor = source.color.clone().multiply(new THREE.Color(p.tint ?? 0xffffff))
  let color = albedo.rgb.multiply(uniformVec3('surfaceTint', new THREE.Vector3().setFromColor(tintColor)))
  const mask = varying(attributes.color)
  if (p.vertexMasks) {
    color = mix(color, vec3(new THREE.Vector3().setFromColor(new THREE.Color(p.wearColor))),
      min(float(0.65), mask.r.multiply(p.wear?.[0] ?? 0.5))).rgb
    color = color.multiplyScalar(float(1).subtract(mask.g.multiply(0.35)))
  }
  const rough = max(float(p.roughness?.[2] ?? 0.06), min(float(1),
    orm.g.multiply(p.roughness?.[0] ?? 1).add(p.roughness?.[1] ?? 0)))
  const metal = orm.b.multiply(source.metalness)
  const opacity = uniformFloat('surfaceOpacity', source.opacity)
  const alpha = p.alphaMask || source.transparent ? albedo.a.multiply(opacity) : opacity
  const emissive = uniformVec3('surfaceEmissive', new THREE.Vector3().setFromColor(source.emissive))
    .multiplyScalar(uniformFloat('surfaceEmissiveIntensity', source.emissiveIntensity))
  const material = new NodeShaderMaterial({
    color: standardMaterial({ color: color.rgba(alpha), roughness: rough, metalness: metal,
      normal: shadingNormal, ambientOcclusion: orm.r, emissive: emissive.rgb, specular: true }),
    normal: shadingNormal, roughness: rough, opacity: alpha, emissive,
    transparent: source.transparent, alphaTest: p.alphaMask ? 0.35 : source.alphaTest,
  })
  material.name = source.name
  material.side = source.side
  material.depthWrite = source.depthWrite
  material.polygonOffset = source.polygonOffset
  material.polygonOffsetFactor = source.polygonOffsetFactor
  material.polygonOffsetUnits = source.polygonOffsetUnits
  // Keep the original world's lamp animation and material API working.
  Object.assign(material, { color: tintColor, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity })
  material.userData.surfaceParams = p
  return material
}
