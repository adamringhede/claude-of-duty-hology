import { Service, GameInstance, inject, World, ViewController } from '@hology/core/gameplay'
import { RenderingView } from '@hology/core/rendering'
import { createPort } from '../port/runtime'

@Service()
class Game extends GameInstance {
  private world = inject(World)
  private view = inject(ViewController)
  private rendering = inject(RenderingView)
  private port: Awaited<ReturnType<typeof createPort>>
  private tick: { unsubscribe(): void }
  private releaseStatic?: () => void
  private releaseQuality?: () => void

  async onPreload() {
    // Compile the empty starter once to acquire its canvas and activate the backend.
    // Hology compiles the generated content again after this preload hook returns.
    await this.rendering.compileAsync()
    if (this.view.activeBackend !== 'webgpu') throw new Error('Claude of Duty requires Hology WebGPU.')
    this.world.directionalLight.intensity = 3.2
    this.port = await createPort(this.world.scene, this.rendering.canvas!, this.view, this.world)
    this.view.setCamera(this.port.camera)
    this.releaseStatic = this.rendering.registerExperimentalStaticDrawSet(
      this.port.registry.get('world').root, 'Claude of Duty level', false, 'throw'
    )
    const applyQuality = () => {
      const quality = this.port.config.quality
      this.rendering.setResolutionScale(this.port.config.q.renderScale)
      this.rendering.setAntiAliasingMode(quality === 'low' ? 'fxaa' : 'taa')
      this.rendering.setGTAOQuality(quality === 'low' ? 'off' : quality === 'ultra' ? 'high' : 'medium')
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
    this.releaseQuality?.()
    this.releaseStatic?.()
    this.port?.dispose()
    Object.assign(window, { __ENGINE__: undefined, __READY__: false })
  }
}
export default Game
