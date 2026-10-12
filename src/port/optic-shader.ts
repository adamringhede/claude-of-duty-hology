import * as THREE from 'three'
import { NodeShaderMaterial, UniformSampler2d, RendererWorldNormalNode,
  RendererWorldPositionNode, RendererViewDirectionNode, varyingTransformed,
  vec2, vec3, float, dot, abs, pow, mix, reflect, atan2, asin, clamp } from '@hology/core/shader-nodes'

/** Alpha-blended AR coating: the original lens has no transmission/refraction. */
export function buildOpticGlass(environment: THREE.Texture) {
  const position = new RendererWorldPositionNode(varyingTransformed.worldPosition)
  const normal = new RendererWorldNormalNode(varyingTransformed.normal)
  const view = new RendererViewDirectionNode(varyingTransformed.viewDir, position)
  const grazing = pow(float(1).subtract(clamp(abs(dot(vec3(normal.x, normal.y, normal.z), vec3(view.x, view.y, view.z))), 0, 1)), float(5))
  const direction = reflect(view.multiplyScalar(-1), normal)
  const uv = vec2(atan2(direction.z, direction.x).divide(2 * Math.PI).add(0.5), asin(clamp(direction.y, -1, 1)).divide(Math.PI).add(0.5))
  const sky = new UniformSampler2d('opticEnvironment', environment).sample(uv).rgb
  const coating = mix(vec3(new THREE.Vector3().setFromColor(new THREE.Color(0x59c489))),
    vec3(new THREE.Vector3().setFromColor(new THREE.Color(0xa856b8))), grazing)
  const alpha = grazing.multiply(0.08).add(0.1)
  const color = sky.multiplyScalar(grazing.multiply(0.2).add(0.04)).multiply(coating)
  const material = new NodeShaderMaterial({color: color.rgba(alpha), opacity: alpha, transparent: true, fog: false})
  material.name = 'Hology optic AR coating'
  material.side = THREE.DoubleSide
  material.depthWrite = false
  return material
}

