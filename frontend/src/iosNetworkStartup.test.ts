import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  network: undefined as undefined | ((status: { connected: boolean }) => void),
  resume: undefined as undefined | (() => void),
  removeNetwork: vi.fn(), removeResume: vi.fn(),
}))
vi.mock('./nativeBridge', () => ({
  subscribeNetworkStatus: (callback: typeof native.network) => {
    native.network = callback
    return native.removeNetwork
  },
  subscribeAppResume: (callback: typeof native.resume) => {
    native.resume = callback
    return native.removeResume
  },
}))
vi.mock('./runtime', () => ({ resolveApiUrl: (path: string) => `https://example.com${path}` }))

import { startIosNetworkStartup } from './iosNetworkStartup'

describe('iOS 首次联网启动', () => {
  let cleanups: (() => void)[]
  let visibility: EventTarget & { visibilityState: string }
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('document', visibility)
    cleanups = []
  })
  afterEach(() => {
    cleanups.forEach(cleanup => cleanup())
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  function start() {
    const callbacks = { onReady: vi.fn(), onUnavailable: vi.fn() }
    const cleanup = startIosNetworkStartup(callbacks)
    cleanups.push(cleanup)
    return { ...callbacks, cleanup }
  }
  it('只读探测不携带凭据；收到 HTTP 错误也放行业务，不误报权限', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/auth/status', {
      credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal),
    })
    expect(callbacks.onReady).toHaveBeenCalledOnce()
    expect(callbacks.onUnavailable).not.toHaveBeenCalled()
    native.network?.({ connected: true })
    native.resume?.()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(native.removeNetwork).toHaveBeenCalledOnce()
    expect(native.removeResume).toHaveBeenCalledOnce()
  })
  it('授权前失败只提示一次，授权后即使没有路径变化也自动继续', async () => {
    const failure = new TypeError('Load failed')
    fetchMock.mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValue(new Response(null))
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onUnavailable).toHaveBeenCalledOnce()
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'GET', path: '/api/auth/status', phase: 'connectivity_probe',
    }), failure)
    expect(failure.stack).toContain('TypeError: Load failed')
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/Bearer|Authorization|Cookie/)
    expect(callbacks.onReady).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(6000)
    expect(callbacks.onUnavailable).toHaveBeenCalledOnce()
    expect(callbacks.onReady).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it.each(['network', 'resume', 'visibility'] as const)('%s 恢复立即重试', async event => {
    fetchMock.mockRejectedValueOnce(new TypeError('Load failed')).mockResolvedValue(new Response(null))
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(0)
    if (event === 'network') native.network?.({ connected: true })
    if (event === 'resume') native.resume?.()
    if (event === 'visibility') visibility.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onReady).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('多个恢复事件不产生并发请求，卸载取消请求并忽略迟到结果', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise(done => { resolve = done }))
    const callbacks = start()
    const signal = fetchMock.mock.calls[0][1]!.signal!
    native.network?.({ connected: true })
    native.resume?.()
    expect(fetchMock).toHaveBeenCalledOnce()
    callbacks.cleanup()
    expect(signal.aborted).toBe(true)
    resolve(new Response(null))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(callbacks.onReady).not.toHaveBeenCalled()
    expect(callbacks.onUnavailable).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it('探测超时可重试，后台暂停，前台恢复后继续', async () => {
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })).mockResolvedValue(new Response(null))
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(callbacks.onUnavailable).toHaveBeenCalledOnce()
    visibility.visibilityState = 'hidden'
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledOnce()
    visibility.visibilityState = 'visible'
    visibility.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onReady).toHaveBeenCalledOnce()
  })
  it('卸载取消重试，不再显示提示或启动业务', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'))
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(0)
    callbacks.cleanup()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(callbacks.onReady).not.toHaveBeenCalled()
  })
})
