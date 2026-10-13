import { Vec2Node, type Vec3Node, type FloatNode, type UniformSampler2d } from '@hology/core/shader-nodes'

/** Bounded height-field march matching the original projected material shader. */
export class ProjectedParallax extends Vec2Node {
  constructor(private map: UniformSampler2d, private uv: Vec2Node, private view: Vec3Node,
    private depth: number, private fade: FloatNode, private layers: number,
    private dx: Vec2Node, private dy: Vec2Node) { super() }
  compile(c: any) {
    const map = c.get(this.map), uv = c.get(this.uv), view = c.get(this.view), fade = c.get(this.fade), dx = c.get(this.dx), dy = c.get(this.dy)
    const name = `projected_parallax_${c.variable()}`
    if (c.isWgslCompiler) {
      c.addWgslDefinition(`
fn portProjectedParallax(map: texture_2d<f32>, mapSampler: sampler, uv: vec2<f32>, view: vec3<f32>, depth: f32, fade: f32, layers: f32, dx: vec2<f32>, dy: vec2<f32>) -> vec2<f32> {
  if (fade <= 0.001) { return uv; }
  let count = max(mix(layers, 8.0, clamp(abs(view.z), 0.0, 1.0)) * fade, 4.0);
  let layer = 1.0 / count;
  let step = view.xy / max(abs(view.z), 0.30) * depth * fade * layer;
  var current = uv;
  var traversed = 0.0;
  var height = 1.0 - textureSampleGrad(map, mapSampler, current, dx, dy).a;
  for (var i = 0; i < 48; i += 1) {
    if (traversed >= height || f32(i) >= count) { break; }
    current -= step;
    height = 1.0 - textureSampleGrad(map, mapSampler, current, dx, dy).a;
    traversed += layer;
  }
  let previous = current + step;
  let after = height - traversed;
  let before = 1.0 - textureSampleGrad(map, mapSampler, previous, dx, dy).a - traversed + layer;
  return mix(current, previous, clamp(after / max(after - before, 0.0001), 0.0, 1.0));
}`)
      return {chunk: c.local('vec2', name, `portProjectedParallax(${map}Texture, ${map}Sampler, ${uv}, ${view}, ${c.floatLiteral(this.depth)}, ${fade}, ${c.floatLiteral(this.layers)}, ${dx}, ${dy})`), out: name}
    }
    const glslFloat = (v: number) => Number.isInteger(v) ? `${v}.0` : `${v}`
    return {pars: `
vec2 portProjectedParallax(sampler2D map, vec2 uv, vec3 view, float depth, float fade, float layers, vec2 dx, vec2 dy) {
  if (fade <= 0.001) return uv;
  float count = max(mix(layers, 8.0, clamp(abs(view.z), 0.0, 1.0)) * fade, 4.0);
  float layer = 1.0 / count;
  vec2 stepUV = view.xy / max(abs(view.z), 0.30) * depth * fade * layer;
  vec2 current = uv;
  float traversed = 0.0;
  float height = 1.0 - texture2D(map, current).a;
  for (int i=0; i<48; i++) { if (traversed >= height || float(i) >= count) break; current -= stepUV; height = 1.0 - texture2D(map, current).a; traversed += layer; }
  vec2 previous = current + stepUV;
  float after = height - traversed;
  float before = 1.0 - texture2D(map, previous).a - traversed + layer;
  return mix(current, previous, clamp(after / max(after-before, 0.0001), 0.0, 1.0));
}`, chunk: `vec2 ${name} = portProjectedParallax(${map}, ${uv}, ${view}, ${glslFloat(this.depth)}, ${fade}, ${glslFloat(this.layers)}, ${dx}, ${dy});`, out: name}
  }
}
