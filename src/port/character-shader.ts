import {
  NodeShaderMaterial, UniformSampler2d, varyingAttributes, varyingTransformed, varying, attributes,
  uniformFloat, uniformVec3, vec3, float, mix, min, max, colorToNormal,
  standardMaterial, smoothstep, pow, abs, dot, normalize,
} from '@hology/core/shader-nodes'
import { Vector3 } from 'three'

/** Preserve the original soldier detail layer and silhouette shading in Hology's graph. */
export function buildCharacterMaterial(source: any, detailTexture: any, detail: any, rim: number) {
  const uv = varyingAttributes.uv
  const sample = new UniformSampler2d('characterColor', source.map).sample(uv)
  const orm = new UniformSampler2d('characterOrm', source.roughnessMap).sample(uv)
  let normals = new UniformSampler2d('characterNormal', source.normalMap).sample(uv)
  let roughness = orm.g.multiply(source.roughness)
  if (detailTexture) {
    const micro = new UniformSampler2d('characterDetail', detailTexture).sample(uv.multiplyScalar(detail.scale ?? 8))
    normals = normals.add(vec3(micro.x.subtract(0.5), micro.y.subtract(0.5), float(0)).rgba(0)
      .multiplyScalar(detail.normal ?? 0.7))
    roughness = min(float(1), max(float(0.04), roughness.add(micro.a.subtract(0.5).multiply(detail.rough ?? 0.2))))
  }
  const normal = colorToNormal(normals, float(source.normalScale.x))
  const alpha = uniformFloat('characterOpacity', 1)
  const edge = pow(smoothstep(float(0.45), float(1), float(1).subtract(abs(dot(
    normalize(varyingTransformed.viewDir), varyingTransformed.normal)))), float(2))
  const color = sample.rgb.multiply(uniformVec3('characterTint', new Vector3().setFromColor(source.color)))
    .multiply(varying(attributes.color).rgb).multiplyScalar(float(1).subtract(edge.multiply(0.25 * (rim ?? 1))))
  const material = new NodeShaderMaterial({
    color: standardMaterial({ color: color.rgba(alpha), normal, roughness,
      metalness: orm.b.multiply(source.metalness), ambientOcclusion: orm.r, specular: true }),
    normal, roughness, opacity: alpha,
  })
  material.name = source.name
  material.side = source.side
  return material
}
