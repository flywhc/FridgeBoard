/** FridgeBoard PWA 的开发入口；P1 仅提供可验证的应用壳。 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { APP_DEEP_LINK_EVENT, initializeDeepLinks } from './deepLink'
import { completeMobileLoginFromUrl } from './mobileAuth'
import { shouldRegisterServiceWorker } from './runtime'
import { initializeTheme } from './theme'
import { APP_RELEASE } from './release'
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
  window.addEventListener(APP_DEEP_LINK_EVENT, () => {
    void completeMobileLoginFromUrl().catch(() => undefined)
  })
  if (shouldRegisterServiceWorker() && 'serviceWorker' in navigator) {
    const serviceWorkerUrl = `/sw.js?release=${encodeURIComponent(APP_RELEASE)}`
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  window.setTimeout(() => { void completeMobileLoginFromUrl().catch(() => undefined) }, 0)
}

void bootstrap()
