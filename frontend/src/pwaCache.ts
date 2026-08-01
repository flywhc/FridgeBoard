const APP_CACHE_PREFIX = 'fridgeboard-app-'

/** 判断 Cache Storage 条目是否属于 FridgeBoard 的应用壳缓存。 */
export function isFridgeBoardAppCache(cacheName: string): boolean {
  return cacheName.startsWith(APP_CACHE_PREFIX)
}

/** 清理应用壳缓存并重新加载页面，不触碰登录状态和业务数据。 */
export async function refreshPwaCache(): Promise<void> {
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

  window.location.reload()
}
