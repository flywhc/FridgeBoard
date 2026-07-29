/** 统一同域 API 请求和运行环境判断。 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init })
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.detail ?? '请求失败，请稍后重试。') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
}


