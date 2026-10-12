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
          motionBlur: { enabled: true, sampleCount: 16, shutterScale: 0.42,
            cameraBlurScale: 1, objectBlurScale: 1, maxBlurPixels: 48,
            depthRejectionStrength: 6, dilation: true },
          colorGrading: false } }} />
    <div id="ui" />
  </div>
}

