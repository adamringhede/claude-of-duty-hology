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
          colorGrading: { toneMapping: 'agx', exposure: 1, vignetteIntensity: 0.08 } } }} />
    <div id="ui" />
  </div>
}
