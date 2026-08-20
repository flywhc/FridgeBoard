import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPersistentRuntimeAssetCache, clearRuntimeAssetCache, getCachedRuntimeAssetUrl } from './runtimeAssetCache'

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

  it('认证上下文清理只释放内存，不删除公共图标持久化缓存', async () => {
    const cacheDelete = vi.fn(async () => true)
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => undefined }), delete: cacheDelete })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:public-icon')

    await getCachedRuntimeAssetUrl('/api/icon-library/egg.svg?v=1', async () => new Blob(['<svg />']))
    clearRuntimeAssetCache()

    expect(cacheDelete).not.toHaveBeenCalled()
    await clearPersistentRuntimeAssetCache()
    expect(cacheDelete).toHaveBeenCalledWith('fridgeboard-icons-v1')
  })

  it('受保护的用户图标只保留进程内缓存，不写入公共持久化缓存', async () => {
    const put = vi.fn(async () => undefined)
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }), delete: async () => true })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-icon')

    await getCachedRuntimeAssetUrl('/api/owner/refrigerators/fridge-1/icons/custom?v=1', async () => new Blob(['png']))

    expect(put).not.toHaveBeenCalled()
  })
})
