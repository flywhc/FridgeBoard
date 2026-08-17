/** FridgeBoard PWA 的开发入口；P1 仅提供可验证的应用壳。 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { APP_DEEP_LINK_EVENT, initializeDeepLinks } from './deepLink'
import { completeMobileLoginFromUrl } from './mobileAuth'
import { shouldRegisterServiceWorker } from './runtime'
import { initializeTheme } from './theme'
import './styles.css'
import './fridgePreview.css'

initializeTheme()

if ('orientation' in screen && typeof screen.orientation?.lock === 'function') {
  void screen.orientation.lock('portrait').catch(() => undefined)
}

async function bootstrap(): Promise<void> {
  await initializeDeepLinks().catch(() => {
    window.setTimeout(() => { void initializeDeepLinks().catch(() => undefined) }, 1000)
  })
  await completeMobileLoginFromUrl().catch(() => undefined)
  window.addEventListener(APP_DEEP_LINK_EVENT, () => {
    void completeMobileLoginFromUrl().catch(() => undefined)
  })
  if (shouldRegisterServiceWorker() && 'serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
