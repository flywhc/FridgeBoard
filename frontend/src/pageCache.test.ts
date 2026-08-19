import { afterEach, describe, expect, it, vi } from 'vitest'
import { PAGE_CACHE_TTL_MS, PAGE_CACHE_VERSION, clearPageCaches, readPageCache, removeRefrigeratorPageCaches, shouldRefreshCachedPage, writePageCache, type CacheSnapshot } from './pageCache'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

describe('P12 页面持久化缓存', () => {
  const storage = createStorage()

  afterEach(() => {
    storage.removeItem(`fb-page-cache:v${PAGE_CACHE_VERSION}:refrigerator:fridge-1:home`)
    storage.removeItem(`fb-page-cache:v${PAGE_CACHE_VERSION}:refrigerator:fridge-2:home`)
    vi.unstubAllGlobals()
  })

  it('保存后可读取，并在一天后标记为过期', () => {
    vi.stubGlobal('window', { localStorage: storage })
    writePageCache('refrigerator:fridge-1:home', { value: 'cached' }, 1_000)

    expect(readPageCache<{ value: string }>('refrigerator:fridge-1:home', 1_000)?.data.value).toBe('cached')
    expect(readPageCache('refrigerator:fridge-1:home', 1_000 + PAGE_CACHE_TTL_MS - 1)?.isStale).toBe(false)
    expect(readPageCache('refrigerator:fridge-1:home', 1_000 + PAGE_CACHE_TTL_MS + 1)?.isStale).toBe(true)
  })

  it('不会读取旧版本缓存，确保新增主题图标字段重新从服务端获取', () => {
    vi.stubGlobal('window', { localStorage: storage })
    storage.setItem('fb-page-cache:v1:refrigerator:fridge-1:home', JSON.stringify({ version: 1, savedAt: 1_000, data: { icons: [{ key: 'egg', asset_url: '/egg.svg' }] } }))

    expect(readPageCache('refrigerator:fridge-1:home')).toBeNull()
  })

  it('删除一台冰箱的缓存不会影响其他冰箱', () => {
    vi.stubGlobal('window', { localStorage: storage })
    writePageCache('refrigerator:fridge-1:home', { value: 1 })
    writePageCache('refrigerator:fridge-2:home', { value: 2 })

    removeRefrigeratorPageCaches('fridge-1')

    expect(readPageCache('refrigerator:fridge-1:home')).toBeNull()
    expect(readPageCache<{ value: number }>('refrigerator:fridge-2:home')?.data.value).toBe(2)
  })

  it('认证失效时可以清理全部业务缓存', () => {
    vi.stubGlobal('window', { localStorage: storage })
    writePageCache('refrigerator:fridge-1:home', { value: 1 })
    writePageCache('refrigerator:fridge-2:home', { value: 2 })

    clearPageCaches()

    expect(readPageCache('refrigerator:fridge-1:home')).toBeNull()
    expect(readPageCache('refrigerator:fridge-2:home')).toBeNull()
  })

  it('普通页面切换复用已有快照，启动过期或主动刷新才读取远端', () => {
    const fresh: CacheSnapshot<unknown> = { version: PAGE_CACHE_VERSION, savedAt: 1_000, data: {}, isStale: false }
    const stale = { ...fresh, isStale: true }

    expect(shouldRefreshCachedPage(null, 'navigation')).toBe(true)
    expect(shouldRefreshCachedPage(fresh, 'navigation')).toBe(false)
    expect(shouldRefreshCachedPage(stale, 'navigation')).toBe(false)
    expect(shouldRefreshCachedPage(stale, 'startup')).toBe(true)
    expect(shouldRefreshCachedPage(fresh, 'manual')).toBe(true)
  })
})
