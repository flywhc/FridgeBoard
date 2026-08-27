import { clearPageCaches } from './pageCache'
import { clearPersistentRuntimeAssetCache } from './runtimeAssetCache'
import { isAppRelease } from './release'

const APP_CACHE_PREFIX = 'fridgeboard-app-'
export const PWA_RELEASE_MARKER_KEY = 'fridgeboard-pwa-release-v1'
export const PWA_RELEASE_RELOAD_MARKER_KEY = 'fridgeboard-pwa-reloaded-release-v1'
export const PWA_RELEASE_SYNC_TIMEOUT_MS = 1500

export type PwaReleaseSyncResult = {
  releaseChanged: boolean
  reloaded: boolean
  skipped: boolean
}

type StorageReadResult = {
  available: boolean
  value: string | null
}

/** 判断 Cache Storage 条目是否属于 FridgeBoard 的应用壳缓存。 */
export function isFridgeBoardAppCache(cacheName: string): boolean {
  return cacheName.startsWith(APP_CACHE_PREFIX)
}

/** 删除所有应用壳缓存；业务页面和公共图标缓存由各自生命周期管理。 */
export async function clearPwaAppShellCaches(targetWindow: Window = window, keepRelease?: string): Promise<void> {
  if (!('caches' in targetWindow)) return
  try {
    const cacheNames = await targetWindow.caches.keys()
    const currentCacheName = keepRelease ? `${APP_CACHE_PREFIX}${keepRelease}` : null
    await Promise.all(cacheNames
      .filter(cacheName => isFridgeBoardAppCache(cacheName) && cacheName !== currentCacheName)
      .map(cacheName => targetWindow.caches.delete(cacheName)))
  } catch {
    // Cache Storage 被禁用或临时失败时仍允许页面继续启动。
  }
}

/** 读取 release marker，并保留存储不可用与 marker 缺失的区别。 */
function readStorage(targetWindow: Window, key: string): StorageReadResult {
  try {
    return { available: true, value: targetWindow.localStorage.getItem(key) }
  } catch {
    return { available: false, value: null }
  }
}

function canWriteStorage(targetWindow: Window): boolean {
  try {
    const probeKey = `${PWA_RELEASE_MARKER_KEY}:probe`
    targetWindow.localStorage.setItem(probeKey, '1')
    targetWindow.localStorage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

function writeStorage(targetWindow: Window, key: string, value: string): boolean {
  try {
    targetWindow.localStorage.setItem(key, value)
    return targetWindow.localStorage.getItem(key) === value
  } catch {
    return false
  }
}

function registrationHasRelease(registration: ServiceWorkerRegistration, release: string): boolean {
  return [registration.installing, registration.waiting, registration.active].some(worker => {
    if (!worker) return false
    try {
      return new URL(worker.scriptURL).searchParams.get('release') === release
    } catch {
      return false
    }
  })
}

async function unregisterOldServiceWorkers(targetNavigator: Navigator, release: string): Promise<void> {
  if (!('serviceWorker' in targetNavigator)) return
  try {
    const registrations = await targetNavigator.serviceWorker.getRegistrations()
    await Promise.all(registrations
      .filter(registration => !registrationHasRelease(registration, release))
      .map(registration => registration.unregister()))
  } catch {
    // Service Worker API may be unavailable in private browsing or embedded WebViews.
  }
}

function hasActiveReleaseWorker(registration: ServiceWorkerRegistration | undefined, release: string): boolean {
  if (!registration?.active) return false
  try {
    return new URL(registration.active.scriptURL).searchParams.get('release') === release
  } catch {
    return false
  }
}

function withTimeout<T>(promise: Promise<T>, targetWindow: Window, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>(resolve => targetWindow.setTimeout(() => resolve(undefined), timeoutMs)),
  ])
}

/** 先准备当前 release 的 worker 或在线应用壳，避免清理后离线刷新失去回退。 */
export async function ensureCurrentServiceWorkerReady(
  release: string,
  targetWindow: Window,
  targetNavigator: Navigator,
): Promise<boolean> {
  const deadline = Date.now() + PWA_RELEASE_SYNC_TIMEOUT_MS
  let registration: ServiceWorkerRegistration | undefined
  if ('serviceWorker' in targetNavigator) {
    try {
      const registrationPromise = targetNavigator.serviceWorker.register(
        `/sw.js?release=${encodeURIComponent(release)}`,
        { scope: '/', updateViaCache: 'none' },
      )
      registration = await withTimeout(registrationPromise, targetWindow, Math.max(0, deadline - Date.now()))
      if (hasActiveReleaseWorker(registration, release)) return true
    } catch {
      // 注册失败时继续尝试读取在线应用壳。
    }
  }

  if (typeof targetWindow.fetch !== 'function') return false
  const remaining = Math.max(0, deadline - Date.now())
  const response = await withTimeout(
    targetWindow.fetch(`/index.html?release=${encodeURIComponent(release)}`, { cache: 'no-store' }),
    targetWindow,
    remaining,
  )
  return Boolean(response?.ok)
}

/**
 * Synchronize the PWA shell with the current release after the first render.
 *
 * A missing marker is treated as first install: stale shell caches and workers
 * are removed, but the current page is kept alive. A changed marker reloads at
 * most once after cleanup, with the marker written before reload to prevent a loop.
 */
export async function synchronizePwaRelease(
  release: string,
  targetWindow: Window = window,
  targetNavigator: Navigator = navigator,
): Promise<PwaReleaseSyncResult> {
  if (!isAppRelease(release)) return { releaseChanged: false, reloaded: false, skipped: true }

  const marker = readStorage(targetWindow, PWA_RELEASE_MARKER_KEY)
  if (!marker.available) return { releaseChanged: false, reloaded: false, skipped: true }
  const previousRelease = marker.value
  const releaseChanged = previousRelease !== null && previousRelease !== release
  if (previousRelease === null || releaseChanged) {
    if (!canWriteStorage(targetWindow)) return { releaseChanged, reloaded: false, skipped: true }
    if (!await ensureCurrentServiceWorkerReady(release, targetWindow, targetNavigator)) {
      return { releaseChanged, reloaded: false, skipped: false }
    }
    await Promise.race([
      Promise.all([
        clearPwaAppShellCaches(targetWindow, release),
        unregisterOldServiceWorkers(targetNavigator, release),
      ]).then(() => undefined),
      new Promise<void>(resolve => targetWindow.setTimeout(resolve, PWA_RELEASE_SYNC_TIMEOUT_MS)),
    ])
  }

  const markerSaved = writeStorage(targetWindow, PWA_RELEASE_MARKER_KEY, release)
  if (!releaseChanged || !markerSaved) return { releaseChanged, reloaded: false, skipped: false }

  const alreadyReloaded = readStorage(targetWindow, PWA_RELEASE_RELOAD_MARKER_KEY).value === release
  if (alreadyReloaded || !writeStorage(targetWindow, PWA_RELEASE_RELOAD_MARKER_KEY, release)) {
    return { releaseChanged, reloaded: false, skipped: false }
  }
  targetWindow.location.reload()
  return { releaseChanged, reloaded: true, skipped: false }
}

/** 清除浏览器和应用壳可能恢复的滚动位置，避免刷新后首页从视口外开始渲染。 */
export function resetPwaScrollPosition(targetWindow: Window = window): void {
  targetWindow.history.scrollRestoration = 'manual'
  targetWindow.scrollTo(0, 0)
  targetWindow.document.documentElement.scrollTop = 0
  targetWindow.document.body.scrollTop = 0
  targetWindow.document.querySelectorAll<HTMLElement>('.mobile-page-body').forEach(element => {
    element.scrollTop = 0
  })
}

/** 清理应用壳和前端页面数据缓存并重新加载页面，不触碰登录状态和远端业务数据。 */
export async function refreshPwaCache(): Promise<void> {
  resetPwaScrollPosition()
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      await registration?.update()
    } catch {
      // 更新检查失败时仍继续清理本地应用壳，便于离线或代理异常时恢复页面。
    }
  }

  await clearPwaAppShellCaches()

  await clearPersistentRuntimeAssetCache()
  clearPageCaches()
  window.location.reload()
}
