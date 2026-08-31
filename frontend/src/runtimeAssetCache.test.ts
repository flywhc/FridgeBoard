import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPersistentRuntimeAssetCache, clearRuntimeAssetCache, getCachedRuntimeAssetUrl, getRuntimeAssetUrl, preloadPersistentRuntimeAssets } from './runtimeAssetCache'

afterEach(() => {
  clearRuntimeAssetCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('原生图片资源缓存', () => {
  it('同一资源合并重复请求并复用 Blob URL', async () => {
    const load = vi.fn(async () => new Blob(['<svg />'], { type: 'image/svg+xml' }))
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:fridgeboard-icon')

    const first = await getCachedRuntimeAssetUrl('icon-egg?v=1', load)
    const second = await getCachedRuntimeAssetUrl('icon-egg?v=1', load)

    expect(first).toBe('blob:fridgeboard-icon')
    expect(second).toBe(first)
    expect(load).toHaveBeenCalledOnce()
    expect(createObjectUrl).toHaveBeenCalledOnce()
  })

  it('清理认证上下文时释放 Blob URL', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fridgeboard-icon')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    await getCachedRuntimeAssetUrl('icon-egg?v=1', async () => new Blob(['<svg />']))
    clearRuntimeAssetCache()

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fridgeboard-icon')
  })

  it('优先读取持久化缓存，断网时不调用网络加载器', async () => {
    const persistentResponse = new Response('<svg />', { status: 200, headers: { 'content-type': 'image/svg+xml' } })
    const match = vi.fn(async () => persistentResponse)
    const put = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      open: async () => ({ match, put }),
      delete: async () => true,
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:persisted-icon')
    const load = vi.fn(async () => { throw new Error('offline') })

    const objectUrl = await getCachedRuntimeAssetUrl('/api/icon-library/egg.svg?v=1', load)

    expect(objectUrl).toBe('blob:persisted-icon')
    expect(load).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(match).toHaveBeenCalledWith('/api/icon-library/egg.svg?v=1')
  })

  it('启动预热后可在首屏渲染时同步取得持久化 Blob URL', async () => {
    const match = vi.fn(async () => new Response('<svg />', { status: 200, headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('caches', {
      open: async () => ({ match, put: vi.fn() }),
      delete: async () => true,
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preloaded-icon')

    await preloadPersistentRuntimeAssets(['/api/icon-library/egg.svg?v=1'])

    expect(getRuntimeAssetUrl('/api/icon-library/egg.svg?v=1')).toBe('blob:preloaded-icon')
    expect(match).toHaveBeenCalledWith('/api/icon-library/egg.svg?v=1')
  })

  it('联网首次读取后写入持久化缓存', async () => {
    const put = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined, put }),
      delete: async () => true,
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-icon')

    await getCachedRuntimeAssetUrl('/api/icon-library/egg.svg?v=1', async () => new Blob(['<svg />'], { type: 'image/svg+xml' }))

    expect(put).toHaveBeenCalledWith('/api/icon-library/egg.svg?v=1', expect.any(Response))
  })

  it('自定义图标首次读取后写入持久化缓存，认证上下文清理只释放内存', async () => {
    const cacheDelete = vi.fn(async () => true)
    const put = vi.fn(async () => undefined)
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }), delete: cacheDelete })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:custom-icon')

    await getCachedRuntimeAssetUrl('/api/owner/refrigerators/fridge-1/icons/custom?v=1', async () => new Blob(['png']))
    clearRuntimeAssetCache()

    expect(cacheDelete).not.toHaveBeenCalled()
    expect(put).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icons/custom?v=1', expect.any(Response))
    await clearPersistentRuntimeAssetCache()
    expect(cacheDelete).toHaveBeenCalledWith('fridgeboard-icons-v1')
  })

  it('同一自定义图标版本命中持久化缓存，版本变化才重新加载', async () => {
    const stored = new Map<string, Response>()
    const match = vi.fn(async (request: RequestInfo | URL) => stored.get(String(request))?.clone())
    const put = vi.fn(async (request: RequestInfo | URL, response: Response) => {
      stored.set(String(request), response.clone())
    })
    vi.stubGlobal('caches', { open: async () => ({ match, put }), delete: async () => true })
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:custom-v1-first')
      .mockReturnValueOnce('blob:custom-v1-cached')
      .mockReturnValueOnce('blob:custom-v2-loaded')
    const load = vi.fn(async () => new Blob(['v2'], { type: 'image/png' }))

    await getCachedRuntimeAssetUrl('/api/owner/refrigerators/fridge-1/icons/custom?v=1', load)
    clearRuntimeAssetCache()
    await getCachedRuntimeAssetUrl('/api/owner/refrigerators/fridge-1/icons/custom?v=1', load)
    await getCachedRuntimeAssetUrl('/api/owner/refrigerators/fridge-1/icons/custom?v=2', load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(match).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icons/custom?v=1')
    expect(match).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icons/custom?v=2')
    expect(put).toHaveBeenCalledTimes(2)
  })
})
