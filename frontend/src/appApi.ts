import { appRuntime, getRequestCredentials, resolveApiUrl } from './runtime'
import { getAccessToken, refreshMobileSession } from './mobileAuth'
import { clearMobileDeviceToken, clearMobileSession, readMobileDeviceToken } from './secureSession'

/** 统一 PWA 同源和 Capacitor 远程 API 请求。 */
export const REQUEST_TIMEOUT_MS = 30_000
export const SSE_IDLE_TIMEOUT_MS = 120_000

export type SseEvent = { type: string; data: Record<string, unknown> }

type AppAuthKind = 'owner' | 'device' | 'none'
type AuthenticatedResponse = { response: Response; authKind: AppAuthKind }

function isDevicePath(path: string): boolean {
  return path.startsWith('/api/devices') || path.startsWith('/api/daily/')
}

async function fetchWithAppAuth(path: string, init: RequestInit = {}): Promise<AuthenticatedResponse> {
  const headers = new Headers(init.headers)
  let authKind: AppAuthKind = 'none'
  if (appRuntime.kind === 'capacitor' && !headers.has('Authorization')) {
    const ownerOnlyPath = path.startsWith('/api/owner/')
    const deviceFirst = isDevicePath(path)
    const ownerToken = deviceFirst ? null : await getAccessToken()
    const deviceToken = deviceFirst || !ownerToken || !ownerOnlyPath
      ? await readMobileDeviceToken()
      : null
    const token = deviceFirst ? deviceToken : ownerToken ?? deviceToken
    authKind = deviceFirst || (!ownerToken && deviceToken) ? 'device' : ownerToken ? 'owner' : 'none'
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return {
    response: await fetch(resolveApiUrl(path, appRuntime), {
      ...init,
      headers,
      credentials: init.credentials ?? getRequestCredentials(appRuntime),
    }),
    authKind,
  }
}

async function retryAfterMobileRefresh(
  path: string,
  init: RequestInit,
  attempt: AuthenticatedResponse,
): Promise<AuthenticatedResponse> {
  if (attempt.response.status !== 401 || appRuntime.kind !== 'capacitor' || attempt.authKind !== 'owner') return attempt
  const token = await refreshMobileSession()
  if (!token) return attempt
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const retry = await fetchWithAppAuth(path, { ...init, headers })
  return { ...retry, authKind: 'owner' }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()
  if (init?.signal?.aborted) controller.abort()
  init?.signal?.addEventListener('abort', abort, { once: true })
  try {
    const requestInit = { ...init, cache: 'no-store' as RequestCache, signal: controller.signal }
    let attempt = await fetchWithAppAuth(path, requestInit)
    attempt = await retryAfterMobileRefresh(path, requestInit, attempt)
    const response = attempt.response
    if (!response.ok) {
      if (response.status === 401 && appRuntime.kind === 'capacitor') {
        if (attempt.authKind === 'device') await clearMobileDeviceToken()
        else await clearMobileSession()
      }
      const error = new Error((await response.json().catch(() => null))?.detail ?? '请求失败，请稍后重试。') as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
  } catch (error) {
    if (timedOut) throw new Error('请求超过 30 秒仍未完成，请检查网络连接后重试。', { cause: error })
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', abort)
  }
}

/** 使用当前 App 会话读取受保护的图片或其他二进制资源。 */
export async function fetchRuntimeAsset(path: string, signal?: AbortSignal): Promise<Blob> {
  const init: RequestInit = { cache: 'no-store', signal }
  let attempt = await fetchWithAppAuth(path, init)
  attempt = await retryAfterMobileRefresh(path, init, attempt)
  const response = attempt.response
  if (!response.ok) {
    if (response.status === 401 && appRuntime.kind === 'capacitor') {
      if (attempt.authKind === 'device') await clearMobileDeviceToken()
      else await clearMobileSession()
    }
    const error = new Error('图片资源请求失败') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.blob()
}

/**
 * 消费同域 SSE 模型请求。超时按“无任何上游增量”计算，而不是限制整个推理时长。
 * `result` 事件是唯一的成功返回值，`token`/`status` 只用于即时反馈。
 */
export async function streamRequest<T>(
  path: string,
  init: RequestInit,
  onEvent: (event: SseEvent) => void,
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (init.signal?.aborted) controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const requestInit = {
      ...init,
      cache: 'no-store' as RequestCache,
      signal: controller.signal,
      headers: (() => {
        const headers = new Headers(init.headers)
        headers.set('Accept', 'text/event-stream')
        return headers
      })(),
    }
    let attempt = await fetchWithAppAuth(path, requestInit)
    attempt = await retryAfterMobileRefresh(path, requestInit, attempt)
    const response = attempt.response
    if (!response.ok) {
      if (response.status === 401 && appRuntime.kind === 'capacitor') {
        if (attempt.authKind === 'device') await clearMobileDeviceToken()
        else await clearMobileSession()
      }
      const error = new Error((await response.json().catch(() => null))?.detail ?? '请求失败，请稍后重试。') as Error & { status?: number }
      error.status = response.status
      throw error
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
      throw new Error('流式响应格式无效，请稍后重试。')
    }
    if (!response.body) throw new Error('流式响应不可用，请稍后重试。')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: T | undefined
    const consumeFrame = (frame: string) => {
      let type = 'message'
    const dataLines: string[] = []
      frame.split(/\r?\n/).forEach(line => {
        if (line.startsWith('event:')) type = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      })
      if (!dataLines.length) return
      const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
      const event = { type, data }
      onEvent(event)
      if (type === 'error') throw new Error(String(data.message ?? '模型服务暂时不可用，请稍后重试。'))
      if (type === 'result') result = data as T
    }
    const readWithIdleTimeout = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        controller.abort()
        reject(new Error('模型响应超过 120 秒没有新内容，请重试。'))
      }, SSE_IDLE_TIMEOUT_MS)
      reader!.read().then(value => {
        globalThis.clearTimeout(timeout)
        resolve(value)
      }).catch(error => {
        globalThis.clearTimeout(timeout)
        reject(error)
      })
    })
    while (true) {
      const read = await readWithIdleTimeout()
      if (read.done) break
      buffer += decoder.decode(read.value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      frames.forEach(consumeFrame)
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeFrame(buffer)
    if (result === undefined) throw new Error('模型未返回最终结果，请重试。')
    return result
  } catch (error) {
    if (init.signal?.aborted) throw new Error('请求被取消', { cause: error })
    throw error
  } finally {
    await reader?.cancel().catch(() => undefined)
    init.signal?.removeEventListener('abort', abort)
  }
}

export function isStandalone() {
  return appRuntime.kind === 'capacitor'
    || window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
}
