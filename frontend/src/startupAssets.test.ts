import { afterEach, describe, expect, it, vi } from 'vitest'
import { refrigeratorListCacheKey, refrigeratorWorkspaceCacheKey, writePageCache } from './pageCache'
import { clearRuntimeAssetCache } from './runtimeAssetCache'
import { preloadCachedWorkspaceIconAssets } from './startupAssets'

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

afterEach(() => {
  clearRuntimeAssetCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('原生启动图片恢复', () => {
  it('恢复当前冰箱全部页面图标，不遗漏未在首页展示的食谱食材', async () => {
    const storage = createStorage()
    vi.stubGlobal('window', { localStorage: storage })
    writePageCache(refrigeratorListCacheKey(), { fridges: [{ id: 'fridge-1' }] })
    writePageCache(refrigeratorWorkspaceCacheKey('fridge-1'), {
      icons: [
        { key: 'home', label: '首页食材', asset_url: '/api/icon-library/home.svg', media_type: 'image/svg+xml' },
        { key: 'recipe-only', label: '食谱食材', asset_url: '/api/icon-library/recipe-only.svg', media_type: 'image/svg+xml' },
      ],
      homeInventory: [{ id: 'item-1', icon_key: 'home' }],
    })
    const match = vi.fn(async (key: RequestInfo | URL) => new Response(String(key), { status: 200, headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('caches', { open: async () => ({ match, put: vi.fn() }) })
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:home').mockReturnValueOnce('blob:recipe-only')

    await preloadCachedWorkspaceIconAssets()

    expect(match).toHaveBeenCalledWith('/api/icon-library/home.svg')
    expect(match).toHaveBeenCalledWith('/api/icon-library/recipe-only.svg')
  })
})
