/** FridgeBoard PWA 的开发入口；P1 仅提供可验证的应用壳。 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { preloadCapacitorPageModules } from './pageModules'
import { preloadCachedWorkspaceIconAssets } from './startupAssets'
import { APP_DEEP_LINK_EVENT, initializeDeepLinks } from './deepLink'
import { completeMobileLoginFromUrl } from './mobileAuth'
import { appRuntime, isAndroidRuntime, shouldRegisterServiceWorker } from './runtime'
import { initializeTheme } from './theme'
import { APP_RELEASE, isAppRelease } from './release'
import { installKeyboardViewportHandling } from './keyboardViewport'
import { DEEP_LINK_INIT_TIMEOUT_MS, waitForPromiseOutcome } from './bootstrapTimeout'
import { isPwaReleaseUpdatePending, PWA_RELEASE_BOOT_TIMEOUT_MS, synchronizePwaRelease, type PwaReleaseSyncResult } from './pwaCache'
import './styles.css'
import './fridgePreview.css'

initializeTheme()

if (isAndroidRuntime()) document.documentElement.dataset.platform = 'android'

if (appRuntime.kind === 'capacitor') installKeyboardViewportHandling()

const capacitorStartupPreload = appRuntime.kind === 'capacitor'
  ? Promise.all([preloadCapacitorPageModules(), preloadCachedWorkspaceIconAssets()]).then(() => undefined).catch(() => undefined)
  : Promise.resolve()

if ('orientation' in screen && typeof screen.orientation?.lock === 'function') {
  void screen.orientation.lock('portrait').catch(() => undefined)
}

let appShellReloadRequested = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'APP_SHELL_UPDATED' || appShellReloadRequested) return
    appShellReloadRequested = true
    setAppBootStatus('正在更新...')
    window.location.reload()
  })
}

async function bootstrap(): Promise<void> {
  const shouldSyncPwaRelease = !import.meta.env.DEV && isAppRelease(APP_RELEASE) && shouldRegisterServiceWorker() && 'serviceWorker' in navigator
  const releaseUpdatePending = shouldSyncPwaRelease && isPwaReleaseUpdatePending(APP_RELEASE)
  if (releaseUpdatePending) setAppBootStatus('正在更新...')
  const pwaReleaseSync = shouldSyncPwaRelease
    ? synchronizePwaRelease(APP_RELEASE).catch((): PwaReleaseSyncResult => ({ releaseChanged: false, reloaded: false, skipped: true }))
    : null
  window.addEventListener(APP_DEEP_LINK_EVENT, () => {
    void completeMobileLoginFromUrl().catch(() => undefined)
  })
  const deepLinkInitialization = initializeDeepLinks()
  void deepLinkInitialization.catch(() => {
    window.setTimeout(() => { void initializeDeepLinks().catch(() => undefined) }, 1000)
  })
  await waitForPromiseOutcome(deepLinkInitialization, DEEP_LINK_INIT_TIMEOUT_MS)
  // 冷启动深链先完成兑换，再让 App 查询认证状态，避免登录成功后短暂落到未登录页。
  await completeMobileLoginFromUrl().catch(() => undefined)
  if (releaseUpdatePending && pwaReleaseSync) {
    const result = await Promise.race([
      pwaReleaseSync,
      new Promise<undefined>(resolve => window.setTimeout(() => resolve(undefined), PWA_RELEASE_BOOT_TIMEOUT_MS)),
    ])
    if (result?.reloaded) return
  }
  await capacitorStartupPreload
  const root = document.getElementById('root')!
  root.replaceChildren()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  window.setTimeout(() => {
    void completeMobileLoginFromUrl().catch(() => undefined)
    if (pwaReleaseSync) {
      void pwaReleaseSync.then(({ reloaded }) => {
        if (reloaded) return
        const serviceWorkerUrl = `/sw.js?release=${encodeURIComponent(APP_RELEASE)}`
        void navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
      })
    }
  }, 0)
}

function setAppBootStatus(message: string): void {
  const status = document.getElementById('app-boot-status')
  if (!status) return
  status.textContent = message
  status.hidden = !message
}

void bootstrap()
