import { afterEach, describe, expect, it, vi } from 'vitest'
import { SSE_IDLE_TIMEOUT_MS, streamRequest } from './appApi'
import { getRequestCredentials, resolveApiUrl, resolveRuntimeUrl, shouldRegisterServiceWorker, type AppRuntimeConfig } from './runtime'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('streamRequest', () => {
  it('消费 SSE 事件并强制使用 text/event-stream Accept', async () => {
    let requestHeaders: Headers | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = new Headers(init?.headers)
      return new Response(
        'event: status\ndata: {"message":"等待模型"}\n\nevent: result\ndata: {"status":"matched"}\n\nevent: done\ndata: {}\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }))
    const events: string[] = []

    const result = await streamRequest<{ status: string }>('/api/test/stream', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }, event => events.push(event.type))

    expect(result).toEqual({ status: 'matched' })
    expect(events).toEqual(['status', 'result', 'done'])
    expect(requestHeaders?.get('Accept')).toBe('text/event-stream')
  })

  it('拒绝成功但非 SSE 的响应，避免把 JSON 当作事件帧解析', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":"matched"}', {
      headers: { 'content-type': 'application/json' },
    })))

    await expect(streamRequest('/api/test/stream', {}, () => undefined))
      .rejects.toThrow('流式响应格式无效')
  })

  it('空闲超时时主动 abort 当前连接', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    const stream = new ReadableStream<Uint8Array>({ cancel: () => undefined })
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    }))

    const request = streamRequest('/api/test/stream', {}, () => undefined)
    const outcome = request.then(() => null, error => error as Error)
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS)

    await expect(outcome).resolves.toMatchObject({ message: '模型响应超过 120 秒没有新内容，请重试。' })
    expect(signal?.aborted).toBe(true)
  })
})

describe('运行时 API 边界', () => {
  const pwa: AppRuntimeConfig = { kind: 'pwa', apiOrigin: null }
  const capacitor: AppRuntimeConfig = { kind: 'capacitor', apiOrigin: 'https://api.example.test' }

  it('PWA 保留相对同源请求，Capacitor 使用绝对 HTTPS 地址', () => {
    expect(resolveApiUrl('/api/fridges', pwa)).toBe('/api/fridges')
    expect(resolveApiUrl('/api/fridges', capacitor)).toBe('https://api.example.test/api/fridges')
  })

  it('原生壳不注册 Service Worker，也不依赖跨源 Cookie', () => {
    expect(shouldRegisterServiceWorker(pwa)).toBe(true)
    expect(shouldRegisterServiceWorker(capacitor)).toBe(false)
    expect(getRequestCredentials(pwa)).toBe('same-origin')
    expect(getRequestCredentials(capacitor)).toBe('omit')
  })

  it('原生壳将服务端相对图标地址解析到 API Origin', () => {
    expect(resolveRuntimeUrl('/api/icon-library/egg.svg', pwa)).toBe('/api/icon-library/egg.svg')
    expect(resolveRuntimeUrl('/api/icon-library/egg.svg', capacitor)).toBe('https://api.example.test/api/icon-library/egg.svg')
  })
})
