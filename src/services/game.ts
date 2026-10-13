import { Service, GameInstance, inject, World, ViewController } from '@hology/core/gameplay'
import { RenderingView } from '@hology/core/rendering'
import { createPort } from '../port/runtime'
import { NoToneMapping } from 'three'
import { createOriginalComposite } from '../port/composite-shader'

@Service()
class Game extends GameInstance {
  private world = inject(World)
  private view = inject(ViewController)
  private rendering = inject(RenderingView)
  private port: Awaited<ReturnType<typeof createPort>>
  private tick: { unsubscribe(): void }
  private releaseStatic?: () => void
  private releaseQuality?: () => void
  private composite?: ReturnType<typeof createOriginalComposite>
  private compositeEffect?: { dispose(): void }

  async onPreload() {
    // Compile the empty starter once to acquire its canvas and activate the backend.
    // Hology compiles the generated content again after this preload hook returns.
    await this.rendering.compileAsync()
    this.rendering.setBaseToneMapping(NoToneMapping, 1)
    if (this.view.activeBackend !== 'webgpu') throw new Error('Claude of Duty requires Hology WebGPU.')
    this.port = await createPort(this.world.scene, this.rendering.canvas!, this.view, this.world)
    // Empty starter scenes still receive Hology's default white hemisphere.
    // The original game supplies its own shader-based indirect lighting.
    this.world.scene.children.filter(o => o.type === 'HemisphereLight' || o.type === 'AmbientLight').forEach(o => o.removeFromParent())
    const sky = this.port.registry.get('sky')
    this.rendering.csm?.lights.forEach(light => light.color.copy(sky.sunLight.color))
    this.rendering.setWorldEnvironment(sky.environment)
    this.composite = createOriginalComposite()
    this.compositeEffect = this.view.addPostProcessEffect(this.composite.output, { stage: 'beforeOutput' })
    // The original composites its first-person pass after world motion blur.
    this.world.scene.children.find(o => o.name === 'First person presentation')?.traverse(o => {
      if ('isMesh' in o) this.rendering.setObjectMotionBlur(o, 'disabled')
    })
    this.view.setCamera(this.port.camera)
    this.rendering.setDirectionalShadowUpdateOptions({
      enabled: new URLSearchParams(location.search).get('shadowScheduling') !== 'off',
      maxUpdateHz: 60, cascadeUpdateHz: [60, 30, 15, 7.5],
      maxUpdatesPerFrame: 2, coverageMargin: .05,
    })
    this.releaseStatic = this.rendering.registerExperimentalStaticDrawSet(
      this.port.registry.get('world').root, 'Claude of Duty level', false, 'throw'
    )
    const applyQuality = () => {
      const quality = this.port.config.quality
      this.rendering.setResolutionScale(this.port.config.q.renderScale)
      this.rendering.setAntiAliasingMode(quality === 'low' ? 'fxaa' : 'taa')
      this.rendering.setGTAOQuality(quality === 'low' ? 'off' : quality === 'ultra' ? 'high' : 'medium')
      this.rendering.configureAmbientOcclusion(quality !== 'low', 1.1, { radius: 1.35, enabled: true, thickness: 1, intensity: 1.1 })
      this.rendering.setMotionBlurOptions({ enabled: this.port.config.q.motionBlur,
        shutterScale: 0.42, cameraBlurScale: 1, objectBlurScale: 1,
        maxBlurPixels: 48, sampleCount: 16, depthRejectionStrength: 6, dilation: true })
    }
    applyQuality()
    this.releaseQuality = this.port.events.on('ui:quality', applyQuality)
    // Present the procedural content before Hology compiles and warms its pipelines.
    this.port.advance(0)
  }
  onStart() {
    this.tick = this.view.onUpdate().subscribe(dt => this.port.advance(dt))
    Object.assign(window, { __ENGINE__: this.port, __HOLOGY_VIEW__: this.view, __READY__: true })
  }
  onUnload() {
    this.tick?.unsubscribe()
    this.compositeEffect?.dispose()
    this.composite?.texture.dispose()
    this.releaseQuality?.()
    this.releaseStatic?.()
    this.port?.dispose()
    Object.assign(window, { __ENGINE__: undefined, __READY__: false })
  }
}
export default Game



