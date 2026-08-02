/** 统一同域 API 请求和运行环境判断。 */
export const REQUEST_TIMEOUT_MS = 30_000

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()
  if (init?.signal?.aborted) controller.abort()
  init?.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, signal: controller.signal })
    if (!response.ok) {
      const error = new Error((await response.json().catch(() => null))?.detail ?? '请求失败，请稍后重试。') as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
  } catch (error) {
    if (timedOut) throw new Error('请求超过 30 秒仍未完成，请检查网络连接后重试。', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', abort)
  }
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
}
