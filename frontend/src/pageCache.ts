/** P12：顶级页面持久化缓存，提供版本隔离、过期判断和按上下文删除能力。 */

/** 缓存新鲜度标记周期；过期只供诊断，不触发可见自动刷新。 */
export const PAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CacheEnvelope<T> = {
  version: typeof PAGE_CACHE_VERSION
  savedAt: number
  data: T
}

export const PAGE_CACHE_VERSION = 2
export const PAGE_CACHE_RELEASE_KEY = 'fb-page-cache:last-complete-release'
const CACHE_PREFIX = `fb-page-cache:v${PAGE_CACHE_VERSION}:`
const LEGACY_CACHE_PREFIXES = ['fb-page-cache:v1:']
const PAGE_CACHE_PREFIXES = [CACHE_PREFIX, ...LEGACY_CACHE_PREFIXES]

export type CacheSnapshot<T> = CacheEnvelope<T> & { isStale: boolean }

export type PageLoadMode = 'startup' | 'navigation' | 'manual'

/** 根据加载来源判断是否需要读取远端；普通页面切换只复用已有快照。 */
export function shouldRefreshCachedPage(snapshot: CacheSnapshot<unknown> | null, mode: PageLoadMode): boolean {
  return !snapshot || mode === 'manual'
}

/** 首页缓存缺失或构建 release 变化时，需要重新静默预取全部页面数据。 */
export function shouldRefreshAllPages(homeSnapshot: CacheSnapshot<unknown> | null, currentRelease: string, cachedRelease: string | null): boolean {
  return !homeSnapshot || currentRelease !== cachedRelease
}

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`
}

/** 读取持久化页面缓存；损坏或版本不匹配的缓存会被忽略并删除。 */
export function readPageCache<T>(key: string, now = Date.now()): CacheSnapshot<T> | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(key))
    if (!raw) return null
    const envelope = JSON.parse(raw) as Partial<CacheEnvelope<T>>
    if (envelope.version !== PAGE_CACHE_VERSION || typeof envelope.savedAt !== 'number' || !('data' in envelope)) {
      window.localStorage.removeItem(cacheKey(key))
      return null
    }
    return { version: PAGE_CACHE_VERSION, savedAt: envelope.savedAt, data: envelope.data as T, isStale: now - envelope.savedAt >= PAGE_CACHE_TTL_MS }
  } catch {
    window.localStorage.removeItem(cacheKey(key))
    return null
  }
}

/** 保存一次成功读取的数据；只保存业务数据，不保存错误、加载状态或认证信息。 */
export function writePageCache<T>(key: string, data: T, savedAt = Date.now()): void {
  try {
    window.localStorage.setItem(cacheKey(key), JSON.stringify({ version: PAGE_CACHE_VERSION, savedAt, data } satisfies CacheEnvelope<T>))
  } catch {
    // 本地存储空间不足时不影响在线使用，下一次启动仍可重新获取数据。
  }
}

/** 删除一个页面缓存。 */
export function removePageCache(key: string): void {
  window.localStorage.removeItem(cacheKey(key))
}

/** 删除与某台冰箱相关的全部页面缓存。 */
export function removeRefrigeratorPageCaches(refrigeratorId: string): void {
  for (const cachePrefix of PAGE_CACHE_PREFIXES) {
    const prefix = `${cachePrefix}refrigerator:${refrigeratorId}:`
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key)
    }
  }
}

/** 删除当前应用持有的全部业务页面缓存，用于认证上下文失效时避免泄露旧用户数据。 */
export function clearPageCaches(): void {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key && PAGE_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) window.localStorage.removeItem(key)
  }
  window.localStorage.removeItem(PAGE_CACHE_RELEASE_KEY)
}

export function refrigeratorWorkspaceCacheKey(refrigeratorId: string): string {
  return `refrigerator:${refrigeratorId}:workspace`
}

export function refrigeratorListCacheKey(): string {
  return 'refrigerators'
}

export function recipeCacheKey(refrigeratorId: string, weekStart: string): string {
  return `refrigerator:${refrigeratorId}:recipes:${weekStart}`
}

export function inventorySearchCacheKey(refrigeratorId: string): string {
  return `inventory-search:${refrigeratorId}`
}
