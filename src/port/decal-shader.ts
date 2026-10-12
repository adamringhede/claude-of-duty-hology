import {
  AttributeVec4Node, NodeShaderMaterial, UniformSampler2d, uniformFloat,
  varying, varyingAttributes, varyingTransformed, float, smoothstep,
  standardMaterial, colorToNormal,
} from '@hology/core/shader-nodes'

export function buildDecalMaterial(source: any, now: any) {
  const data = varying(new AttributeVec4Node('aDecal'))
  const age = uniformFloat('uNow', 0).subtract(data.x).multiply(data.y)
  const fade = float(1).subtract(smoothstep(data.z, float(1), age)).multiply(data.w)
  const uv = varyingAttributes.uv
  const sample = new UniformSampler2d('decalColor', source.map).sample(uv)
  const orm = new UniformSampler2d('decalOrm', source.roughnessMap).sample(uv)
  const normal = colorToNormal(new UniformSampler2d('decalNormal', source.normalMap).sample(uv), float(1.35))
  const alpha = sample.a.multiply(fade)
  const material = new NodeShaderMaterial({
    color: standardMaterial({ color: sample.rgb.rgba(alpha), roughness: orm.g,
      metalness: orm.b, ambientOcclusion: orm.r, normal, specular: true }),
    normal, roughness: orm.g, opacity: alpha, alphaTest: 0.004,
    discard: age.lt(float(0)).or(age.gt(float(1))), transparent: true,
    uniforms: { uNow: now },
  })
  material.name = 'hology-impact-decals'
  material.depthWrite = false
  material.polygonOffset = true
  material.polygonOffsetFactor = -4
  material.polygonOffsetUnits = -8
  return material
}
