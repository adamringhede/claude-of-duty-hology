import 'reflect-metadata'
import { HologyScene } from '@hology/react'
import Game from './services/game'
import './App.css'
export default function App() {
  return <div className="app-shell">
    <HologyScene gameClass={Game} sceneName="main" dataDir="data"
      actors={{}} components={{}} shaders={{}}
      rendering={{ backend: 'webgpu', maxPixelRatio: 1, bloom: { enabled: true }, reflection: { enabled: false },
        webgpuPostProcessing: { antiAliasing: 'taa', gtao: {},
          // Original thresholds are exposure-scaled; Hology blooms before exposure.
          // Its five mip weights sum to 3, unlike the original normalized pyramid.
          bloom: { threshold: 1.6 / 4.84, knee: 0.9 / 4.84, strength: 0.14 / 3, radius: 0.2 },
          motionBlur: { enabled: true, sampleCount: 16, shutterScale: 0.42,
            cameraBlurScale: 1, objectBlurScale: 1, maxBlurPixels: 48,
            depthRejectionStrength: 6, dilation: true },
          colorGrading: false } }} />
    <div id="ui" />
  </div>
}

