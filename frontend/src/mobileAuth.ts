import { appRuntime, resolveApiUrl } from './runtime'
import {
  clearMobileSession,
  createMobileAuthTransaction,
  addMobileDeviceToken,
  readMobileAuthTransaction,
  readMobileSession,
  writeMobileSession,
} from './secureSession'

type MobileSessionResponse = { access_token: string; refresh_token: string }

let refreshPromise: Promise<string | null> | null = null

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), { ...init, credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error('移动端认证请求失败')
  return response.json() as Promise<T>
}

async function saveResponse(response: MobileSessionResponse): Promise<string> {
  await writeMobileSession({ accessToken: response.access_token, refreshToken: response.refresh_token })
  return response.access_token
}

/** 启动系统浏览器 SSO；回调只返回一次性 code，不返回长期令牌。 */
export async function beginMobileLogin(): Promise<void> {
  if (appRuntime.kind !== 'capacitor') return
  const transaction = await createMobileAuthTransaction()
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(transaction.verifier))))
  const query = new URLSearchParams({
    client: 'mobile',
    redirect_uri: transaction.redirectUri,
    state: transaction.state,
    code_challenge: challenge,
  })
  window.location.assign(resolveApiUrl(`/api/auth/login?${query.toString()}`))
}

/** 在 App 回到公开回调路径时消费 code，并立即清理地址栏。 */
export async function completeMobileLoginFromUrl(): Promise<void> {
  if (appRuntime.kind !== 'capacitor') return
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  if (!code && !returnedState) return
  const transaction = await readMobileAuthTransaction()
  window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`)
  if (!code || !returnedState || !transaction || returnedState !== transaction.state) {
    throw new Error('移动端登录回调无效，请重新登录')
  }
  const response = await apiRequest<MobileSessionResponse>('/api/auth/mobile/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri }),
  })
  await saveResponse(response)
}

/** 返回当前短期访问令牌；调用方只在内存中使用，不写入 Web Storage。 */
export async function getAccessToken(): Promise<string | null> {
  return (await readMobileSession())?.accessToken ?? null
}

/** 保存配对接口返回的设备 Bearer 凭证。 */
export { addMobileDeviceToken }

/** 单飞刷新 App 会话，避免并发 401 产生多次刷新令牌消费。 */
export async function refreshMobileSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const session = await readMobileSession()
    if (!session) return null
    try {
      const response = await apiRequest<MobileSessionResponse>('/api/auth/mobile/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      })
      return await saveResponse(response)
    } catch {
      await clearMobileSession()
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

/** 退出 App 并同时撤销服务端会话与原生安全存储。 */
export async function logoutMobileSession(): Promise<void> {
  const accessToken = await getAccessToken()
  try {
    if (accessToken) {
      await fetch(resolveApiUrl('/api/auth/mobile/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'omit',
        cache: 'no-store',
      })
    }
  } finally {
    await clearMobileSession()
  }
}
