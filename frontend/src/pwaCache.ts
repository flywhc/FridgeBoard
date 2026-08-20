import { clearPageCaches } from './pageCache'
import { clearPersistentRuntimeAssetCache } from './runtimeAssetCache'

const APP_CACHE_PREFIX = 'fridgeboard-app-'

/** 判断 Cache Storage 条目是否属于 FridgeBoard 的应用壳缓存。 */
export function isFridgeBoardAppCache(cacheName: string): boolean {
  return cacheName.startsWith(APP_CACHE_PREFIX)
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

  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.filter(isFridgeBoardAppCache).map(cacheName => caches.delete(cacheName)))
  }

  await clearPersistentRuntimeAssetCache()
  clearPageCaches()
  window.location.reload()
}
