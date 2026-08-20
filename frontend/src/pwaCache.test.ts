import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshPwaCache } from './pwaCache'

describe('PWA 刷新缓存', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('刷新应用时同时清理页面 localStorage 缓存和应用壳缓存', async () => {
    const values = new Map([
      ['fb-page-cache:v1:refrigerator:fridge-1:workspace', 'cached-workspace'],
      ['fb-page-cache:v1:inventory-search:fridge-1', 'cached-search'],
      ['unrelated-setting', 'keep'],
    ])
    const localStorage = {
      get length() { return values.size },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key) },
    }
    const cacheDelete = vi.fn(async () => true)
    const fakeWindow = {
      history: { scrollRestoration: 'auto' as ScrollRestoration },
      scrollTo: vi.fn(),
      document: { documentElement: { scrollTop: 0 }, body: { scrollTop: 0 }, querySelectorAll: () => [] },
      localStorage,
      location: { reload: vi.fn() },
      caches: { keys: vi.fn(async () => ['fridgeboard-app-v4', 'fridgeboard-icons-v1', 'unrelated-cache']), delete: cacheDelete },
    }
    vi.stubGlobal('window', fakeWindow)
    vi.stubGlobal('caches', fakeWindow.caches)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn(async () => undefined) } })

    await refreshPwaCache()

    expect(values).toEqual(new Map([['unrelated-setting', 'keep']]))
    expect(cacheDelete).toHaveBeenCalledWith('fridgeboard-app-v4')
    expect(cacheDelete).toHaveBeenCalledWith('fridgeboard-icons-v1')
    expect(cacheDelete).not.toHaveBeenCalledWith('unrelated-cache')
    expect(fakeWindow.location.reload).toHaveBeenCalledOnce()
  })
})
