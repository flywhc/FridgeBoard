import { afterEach, describe, expect, it, vi } from 'vitest'
import { PWA_RELEASE_MARKER_KEY, PWA_RELEASE_RELOAD_MARKER_KEY, PWA_RELEASE_SYNC_TIMEOUT_MS, refreshPwaCache, synchronizePwaRelease } from './pwaCache'

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

  it('首次启动记录 release 并清理旧应用壳，但不打断当前页面或公共图标缓存', async () => {
    const values = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const cacheDelete = vi.fn(async () => true)
    const oldRegistration = {
      active: { scriptURL: 'https://fridge.example/sw.js' },
      installing: null,
      waiting: null,
      unregister: vi.fn(async () => true),
    }
    const currentRegistration = {
      active: { scriptURL: 'https://fridge.example/sw.js?release=260827010203' },
      installing: null,
      waiting: null,
      unregister: vi.fn(async () => true),
    }
    const fakeWindow = {
      localStorage,
      caches: { keys: vi.fn(async () => ['fridgeboard-app-legacy', 'fridgeboard-icons-v1']), delete: cacheDelete },
      location: { reload: vi.fn() },
      setTimeout,
    } as unknown as Window
    const fakeNavigator = {
      serviceWorker: {
        register: vi.fn(async () => currentRegistration),
        getRegistrations: vi.fn(async () => [oldRegistration]),
      },
    } as unknown as Navigator

    const result = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(result).toEqual({ releaseChanged: false, reloaded: false, skipped: false })
    expect(localStorage.getItem(PWA_RELEASE_MARKER_KEY)).toBe('260827010203')
    expect(localStorage.getItem(PWA_RELEASE_RELOAD_MARKER_KEY)).toBeNull()
    expect(cacheDelete).toHaveBeenCalledWith('fridgeboard-app-legacy')
    expect(cacheDelete).not.toHaveBeenCalledWith('fridgeboard-icons-v1')
    expect(oldRegistration.unregister).toHaveBeenCalledOnce()
    expect(fakeWindow.location.reload).not.toHaveBeenCalled()
  })

  it('release 变化时清理旧壳并只刷新一次，避免 reload 循环', async () => {
    const values = new Map([
      [PWA_RELEASE_MARKER_KEY, '260826235959'],
    ])
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const fakeWindow = {
      localStorage,
      caches: { keys: vi.fn(async () => ['fridgeboard-app-old']), delete: vi.fn(async () => true) },
      location: { reload: vi.fn() },
      setTimeout,
    } as unknown as Window
    const currentRegistration = {
      active: { scriptURL: 'https://fridge.example/sw.js?release=260827010203' },
      installing: null,
      waiting: null,
      unregister: vi.fn(async () => true),
    }
    const fakeNavigator = {
      serviceWorker: {
        register: vi.fn(async () => currentRegistration),
        getRegistrations: vi.fn(async () => []),
      },
    } as unknown as Navigator

    const first = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)
    const deletedCacheCount = (fakeWindow.caches.delete as ReturnType<typeof vi.fn>).mock.calls.length
    const second = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(first.reloaded).toBe(true)
    expect(second.reloaded).toBe(false)
    expect(fakeWindow.location.reload).toHaveBeenCalledOnce()
    expect((fakeWindow.caches.delete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(deletedCacheCount)
    expect(localStorage.getItem(PWA_RELEASE_RELOAD_MARKER_KEY)).toBe('260827010203')
  })

  it('release 无效时跳过同步，不写入 marker 或刷新', async () => {
    const setItem = vi.fn()
    const reload = vi.fn()
    const fakeWindow = { localStorage: { getItem: () => null, setItem, removeItem: vi.fn() }, location: { reload }, setTimeout } as unknown as Window
    const result = await synchronizePwaRelease('dev', fakeWindow, {} as Navigator)

    expect(result.skipped).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('清理接口挂起时在有界时间后仍写入 marker 并完成启动任务', async () => {
    const setItem = vi.fn()
    const fakeWindow = {
      localStorage: { getItem: () => null, setItem, removeItem: vi.fn() },
      caches: { keys: () => new Promise<string[]>(() => undefined), delete: vi.fn() },
      location: { reload: vi.fn() },
      setTimeout: (callback: TimerHandler, delay?: number) => {
        expect(delay).toBe(PWA_RELEASE_SYNC_TIMEOUT_MS)
        if (typeof callback === 'function') queueMicrotask(callback as () => void)
        return 0
      },
    } as unknown as Window
    const currentRegistration = {
      active: { scriptURL: 'https://fridge.example/sw.js?release=260827010203' },
      installing: null,
      waiting: null,
      unregister: vi.fn(async () => true),
    }
    const fakeNavigator = {
      serviceWorker: {
        register: async () => currentRegistration,
        getRegistrations: () => new Promise<ServiceWorkerRegistration[]>(() => undefined),
      },
    } as unknown as Navigator

    const result = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(result.skipped).toBe(false)
    expect(setItem.mock.calls).toContainEqual([PWA_RELEASE_MARKER_KEY, '260827010203'])
  })

  it('当前 release 的 worker 安装失败且断网时保留旧壳，不写新 marker 或刷新', async () => {
    const values = new Map([[PWA_RELEASE_MARKER_KEY, '260826235959']])
    const cacheDelete = vi.fn(async () => true)
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const fakeWindow = {
      localStorage,
      caches: { keys: vi.fn(async () => ['fridgeboard-app-260826235959']), delete: cacheDelete },
      fetch: vi.fn(async () => { throw new Error('offline') }),
      location: { reload: vi.fn() },
      setTimeout,
    } as unknown as Window
    const fakeNavigator = {
      serviceWorker: {
        register: vi.fn(async () => { throw new Error('install failed') }),
        getRegistrations: vi.fn(async () => []),
      },
    } as unknown as Navigator

    const result = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(result.reloaded).toBe(false)
    expect(result.skipped).toBe(false)
    expect(cacheDelete).not.toHaveBeenCalled()
    expect(localStorage.getItem(PWA_RELEASE_MARKER_KEY)).toBe('260826235959')
    expect(fakeWindow.location.reload).not.toHaveBeenCalled()
  })

  it('localStorage 不可用时区分于 marker 缺失，不清理壳、不注册 worker 且不刷新', async () => {
    const cacheDelete = vi.fn(async () => true)
    const fakeWindow = {
      localStorage: {
        getItem: () => { throw new Error('storage unavailable') },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      caches: { keys: vi.fn(async () => ['fridgeboard-app-old']), delete: cacheDelete },
      location: { reload: vi.fn() },
      setTimeout,
    } as unknown as Window
    const register = vi.fn()
    const fakeNavigator = { serviceWorker: { register, getRegistrations: vi.fn() } } as unknown as Navigator

    const result = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(result.skipped).toBe(true)
    expect(cacheDelete).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(fakeWindow.location.reload).not.toHaveBeenCalled()
  })

  it('localStorage 写入不可用时不把 marker 缺失当作首次安装，不清理壳或刷新', async () => {
    const cacheDelete = vi.fn(async () => true)
    const register = vi.fn()
    const fakeWindow = {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('quota exceeded') },
        removeItem: vi.fn(),
      },
      caches: { keys: vi.fn(async () => ['fridgeboard-app-old']), delete: cacheDelete },
      location: { reload: vi.fn() },
      setTimeout,
    } as unknown as Window
    const fakeNavigator = { serviceWorker: { register, getRegistrations: vi.fn() } } as unknown as Navigator

    const result = await synchronizePwaRelease('260827010203', fakeWindow, fakeNavigator)

    expect(result.skipped).toBe(true)
    expect(cacheDelete).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(fakeWindow.location.reload).not.toHaveBeenCalled()
  })
})
