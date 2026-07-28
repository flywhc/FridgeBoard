/** FridgeBoard PWA 的开发入口；P1 仅提供可验证的应用壳。 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles.css'

if ('orientation' in screen && typeof screen.orientation?.lock === 'function') {
  void screen.orientation.lock('portrait').catch(() => undefined)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
