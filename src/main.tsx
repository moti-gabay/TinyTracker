import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { registerServiceWorker } from './lib/pwa/appUpdate'
import './styles/index.css'

// Register before first paint work so the app is offline-capable from the
// very first visit, regardless of which screens the parent ever opens.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
