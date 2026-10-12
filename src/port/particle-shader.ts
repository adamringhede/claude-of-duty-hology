import * as THREE from 'three'
import {
  AttributeVec4Node, NodeShaderMaterial, UniformSampler2d, uniformFloat,
  attributes, uniforms, varying, float, vec2, vec3, vec4, exp, max, min,
  mix, pow, sin, cos, floor, mod, smoothstep, select, length,
} from '@hology/core/shader-nodes'

// The graph compiler allocates arbitrary attributes as vertex streams. These
// spawn records advance per particle, so annotate the material-local binding.
class ParticleAttribute extends AttributeVec4Node {
  constructor(private attributeName: string) { super(attributeName) }
  compile(compiler: any) {
    const result = super.compile(compiler)
    if (compiler.isWgslCompiler && !compiler.isWgslFragmentCompiler) {
      const binding = compiler.getVertexAttributes().find((a: any) => a.name === this.attributeName)
      if (binding) Object.assign(binding, { stepMode: 'instance' })
    }
    return result
  }
}

/** Closed-form particle motion authored as a Hology TypeScript shader graph. */
export function buildParticleMaterial(o: any, shared: any) {
  const ps = new ParticleAttribute('aPS'), vs = new ParticleAttribute('aVS')
  const life = new ParticleAttribute('aLife'), rot = new ParticleAttribute('aRot')
  const c0 = new ParticleAttribute('aCol0'), c1 = new ParticleAttribute('aCol1')
  const misc = new ParticleAttribute('aMisc'), extra = new ParticleAttribute('aExtra')
  const time = uniformFloat('uTime', 0)
  const t = max(float(0), time.subtract(life.x))
  const age = min(float(1), t.multiply(life.y))
  const k = max(float(0.02), life.z)
  const decay = exp(k.multiply(t).multiply(-1))
  const gk = vec3(float(0), life.w.divide(k), float(0))
  const pos = ps.xyz.add(vs.xyz.subtract(gk).multiplyScalar(float(1).subtract(decay).divide(k)))
    .add(gk.multiplyScalar(t))
  const ph = extra.z.multiply(6.2831853)
  const amp = extra.x.multiply(smoothstep(float(0), float(0.4), age))
  const turb = vec3(sin(t.multiply(extra.y).multiply(1.13).add(ph)),
    sin(t.multiply(extra.y).multiply(0.79).add(ph.multiply(2.1))),
    cos(t.multiply(extra.y).multiply(1.31).add(ph.multiply(1.7)))).multiplyScalar(amp)
  const mv = uniforms.modelViewMatrix.multiplyVec(vec4(pos.add(turb), float(1)))
  const presentationScale = length(uniforms.modelMatrix.multiplyVec(vec4(1, 0, 0, 0)).xyz)
  const size = mix(ps.w, vs.w, pow(age, max(float(0.02), rot.w))).multiply(presentationScale)
  const angle = rot.x.add(rot.y.multiply(t))
  const quad = attributes.position.xy
  const offset = vec2(quad.x.multiply(cos(angle)).subtract(quad.y.multiply(sin(angle))),
    quad.x.multiply(sin(angle)).add(quad.y.multiply(cos(angle)))).multiplyScalar(size)
  const clip = uniforms.projectionMatrix.multiplyVec(vec4(mv.x.add(offset.x), mv.y.add(offset.y), mv.z, mv.w))
  const position = select(time.lt(life.x).or(age.gte(float(1))), vec4(0, 0, 2, 1), clip)
  const uv = varying(attributes.uv.add(vec2(mod(misc.x, float(o.cols)), floor(misc.x.divide(o.cols)))).divideScalar(o.cols))
  const tex = new UniformSampler2d('particleAtlas', o.atlas).sample(uv)
  const alpha = varying(misc.z.multiply(pow(float(1).subtract(age), max(float(0.02), misc.w)))
    .multiply(smoothstep(float(0), float(0.045), age))).multiply(tex.a)
  let color = varying(mix(c0.rgb, c1.rgb, age).multiplyScalar(mix(c0.w, c1.w, age.multiply(age)))).multiply(tex.rgb)
  if (o.mode !== 'additive') color = color.multiplyScalar(0.8)
  const material = new NodeShaderMaterial({
    position, color: color.rgba(alpha), opacity: alpha, transparent: true,
    alphaTest: 0.0035, fog: o.mode !== 'additive', uniforms: { uTime: shared.uTime },
  })
  material.name = `hology-particles-${o.mode}`
  material.side = THREE.DoubleSide
  material.depthWrite = false
  material.blending = o.mode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
  return material
}
