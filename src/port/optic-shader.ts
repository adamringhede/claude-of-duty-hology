import * as THREE from 'three'
import { NodeShaderMaterial, standardMaterial, float, vec3, uniformFloat, uniformVec3, varyingTransformed, uniforms, varying, transpose, vec4, max, length, attributes, dot, select } from '@hology/core/shader-nodes'

/** Retain the original physical AR-coated lens; it uses alpha, not transmission. */
export function buildOpticGlass(source: THREE.MeshPhysicalMaterial, environment: THREE.Texture) {
  const color = uniformVec3('opticColor', new THREE.Vector3().setFromColor(source.color))
  const opacity = uniformFloat('opticOpacity', source.opacity)
  // Undo the presentation-only FOV stretch and near-camera compression for
  // optical lighting; rasterization still uses the presented mesh coordinates.
  const presentation = uniformVec3('opticPresentationScale', new THREE.Vector3(0.12, 0.12, 0.12))
  const viewPosition = varyingTransformed.mvPosition.xyz.divide(presentation)
  const worldPosition = uniforms.cameraPosition.add(transpose(uniforms.viewMatrix).multiplyVec(vec4(viewPosition, 0)).xyz)
  const viewNormal = varying(uniforms.normalMatrix).multiplyVec(varying(attributes.normal)).multiply(presentation)
  const orientedNormal = select(dot(viewNormal, viewPosition).gt(float(0)), viewNormal.multiplyScalar(-1), viewNormal)
  const normal = orientedNormal.divideScalar(max(length(orientedNormal), float(0.000001)))
  const material = new NodeShaderMaterial({
    color: standardMaterial({ color: color.rgba(opacity), normal, worldPosition, roughness: source.roughness,
      metalness: source.metalness, ior: source.ior, specularIntensity: source.specularIntensity,
      specularColor: vec3(new THREE.Vector3().setFromColor(source.specularColor)),
      iridescence: source.iridescence, iridescenceIOR: source.iridescenceIOR,
      iridescenceThickness: source.iridescenceThicknessRange[1],
      sheenColor: vec3(new THREE.Vector3().setFromColor(source.sheenColor)).multiplyScalar(source.sheen),
      sheenRoughness: source.sheenRoughness, environmentDiffuseIntensity: 0.03,
    }),
    opacity, roughness: float(source.roughness), transparent: true, fog: false,
    envMap: environment, uniforms: { envMapIntensity: {value: source.envMapIntensity} },
  })
  material.name = 'Hology physical optic AR coating'
  material.side = source.side
  material.depthWrite = source.depthWrite
  return material
}

