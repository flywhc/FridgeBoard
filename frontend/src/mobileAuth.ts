import { appRuntime, MOBILE_AUTH_REDIRECT_URI, resolveApiUrl } from './runtime'
import { takePendingMobileAuthCallback, type MobileAuthCallback } from './deepLink'
import { openExternalUrl } from './nativeBridge'
import {
  clearMobileSession,
  createMobileAuthTransaction,
  addMobileDeviceToken,
  readMobileAuthTransaction,
  readMobileSession,
  writeMobileSession,
} from './secureSession'

type MobileSessionResponse = { access_token: string; refresh_token: string }

export const MOBILE_AUTH_COMPLETED_EVENT = 'fridgeboard:mobile-auth-completed'
export const MOBILE_AUTH_PROGRESS_EVENT = 'fridgeboard:mobile-auth-progress'

let refreshPromise: Promise<string | null> | null = null
let mobileAuthCompletionPromise: Promise<boolean> | null = null
let lastCompletedMobileCallbackKey: string | null = null
let mobileAuthError: string | null = null
let mobileAuthProgress: 'idle' | 'processing' = 'idle'

function setMobileAuthProgress(progress: 'idle' | 'processing', result?: 'completed' | 'failed'): void {
  mobileAuthProgress = progress
  window.dispatchEvent(new CustomEvent(MOBILE_AUTH_PROGRESS_EVENT, { detail: result ?? progress }))
}

/** 返回回调交换是否正在进行，供 App 在启动阶段显示明确反馈。 */
export function isMobileAuthProcessing(): boolean {
  return mobileAuthProgress === 'processing'
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), { ...init, credentials: 'omit', cache: 'no-store' })
  if (!response.ok) {
    const error = new Error('移动端认证请求失败') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.json() as Promise<T>
}

/** 取出启动阶段记录的登录失败提示，避免 bootstrap 吞掉错误后用户无从判断。 */
export function takeMobileAuthError(): string | null {
  const error = mobileAuthError
  mobileAuthError = null
  return error
}

async function saveResponse(response: MobileSessionResponse): Promise<string> {
  await writeMobileSession({ accessToken: response.access_token, refreshToken: response.refresh_token })
  return response.access_token
}

/** 启动系统浏览器 SSO；默认复用已有会话，显式切换账号时才重新认证。 */
export async function beginMobileLogin(options: { forceLogin?: boolean } = {}): Promise<void> {
  if (appRuntime.kind !== 'capacitor') return
  const transaction = await createMobileAuthTransaction()
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(transaction.verifier))))
  const query = new URLSearchParams({
    client: 'mobile',
    redirect_uri: transaction.redirectUri,
    state: transaction.state,
    code_challenge: challenge,
  })
  if (options.forceLogin) query.set('prompt', 'login')
  await openExternalUrl(resolveApiUrl(`/api/auth/login?${query.toString()}`))
}

/** 在 App 收到专属回调 URI 时消费 code，并立即清理地址栏。 */
export async function completeMobileLoginFromUrl(): Promise<void> {
  if (mobileAuthCompletionPromise) {
    await mobileAuthCompletionPromise
    return
  }
  const completion = completeMobileLoginOnce()
  mobileAuthCompletionPromise = completion
  try {
    if (await completion) {
      setMobileAuthProgress('idle', 'completed')
      window.dispatchEvent(new Event(MOBILE_AUTH_COMPLETED_EVENT))
    }
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    mobileAuthError = status === 400 || status === 401
      ? '登录链接已失效或已被重复使用，请点击“登录或注册”重新登录。'
      : '登录暂时未完成，请检查网络后重新登录。'
    if (isMobileAuthProcessing()) setMobileAuthProgress('idle', 'failed')
    throw error
  } finally {
    if (mobileAuthCompletionPromise === completion) mobileAuthCompletionPromise = null
  }
}

async function completeMobileLoginOnce(): Promise<boolean> {
  if (appRuntime.kind !== 'capacitor') return false
  const pendingCallback = takePendingMobileAuthCallback()
  const url = new URL(window.location.href)
  const callback = pendingCallback ?? readCallbackFromLocation(url)
  const code = callback?.code ?? null
  const returnedState = callback?.state ?? null
  if (!code && !returnedState) return false
  const callbackKey = code && returnedState ? `${code}:${returnedState}` : null
  if (callbackKey && callbackKey === lastCompletedMobileCallbackKey) return false
  setMobileAuthProgress('processing')
  const transaction = await readMobileAuthTransaction()
  if (!pendingCallback) window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`)
  if (callback?.error) throw new Error(callback.errorDescription || '移动端登录未完成，请重新登录')
  if (!code || !returnedState || !transaction || returnedState !== transaction.state) {
    throw new Error('移动端登录回调无效，请重新登录')
  }
  const response = await apiRequest<MobileSessionResponse>('/api/auth/mobile/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri }),
  })
  await saveResponse(response)
  if (callbackKey) lastCompletedMobileCallbackKey = callbackKey
  return true
}

function readCallbackFromLocation(url: URL): MobileAuthCallback | null {
  if (url.hash || `${url.protocol}//${url.hostname}${url.pathname}` !== MOBILE_AUTH_REDIRECT_URI) return null
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (!code && !state && !error) return null
  return {
    code: code ?? undefined,
    error: error ?? undefined,
    errorDescription: url.searchParams.get('error_description') ?? undefined,
    state: state ?? '',
  }
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
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      if (status === 400 || status === 401) await clearMobileSession()
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
