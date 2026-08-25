/** FridgeBoard PWA 的开发入口；P1 仅提供可验证的应用壳。 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { APP_DEEP_LINK_EVENT, initializeDeepLinks } from './deepLink'
import { completeMobileLoginFromUrl } from './mobileAuth'
import { appRuntime, isAndroidRuntime, shouldRegisterServiceWorker } from './runtime'
import { initializeTheme } from './theme'
import { APP_RELEASE } from './release'
import { installKeyboardViewportHandling } from './keyboardViewport'
import './styles.css'
import './fridgePreview.css'

initializeTheme()

if (isAndroidRuntime()) document.documentElement.dataset.platform = 'android'

if (appRuntime.kind === 'capacitor') installKeyboardViewportHandling()

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
  // 冷启动深链先完成兑换，再让 App 查询认证状态，避免登录成功后短暂落到未登录页。
  await completeMobileLoginFromUrl().catch(() => undefined)
  if (shouldRegisterServiceWorker() && 'serviceWorker' in navigator) {
    const serviceWorkerUrl = `/sw.js?release=${encodeURIComponent(APP_RELEASE)}`
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
  }
  const root = document.getElementById('root')!
  root.replaceChildren()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  window.setTimeout(() => { void completeMobileLoginFromUrl().catch(() => undefined) }, 0)
}

void bootstrap()
