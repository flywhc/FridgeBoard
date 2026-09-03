import { Capacitor } from '@capacitor/core'
import { appRuntime, MOBILE_AUTH_REDIRECT_URI, resolveApiUrl } from './runtime'
import { APP_RELEASE } from './release'
import { takePendingMobileAuthCallback, type MobileAuthCallback } from './deepLink'
import { openExternalUrl } from './nativeBridge'
import {
  clearMobileSession,
  createMobileAuthTransaction,
  addMobileDeviceToken,
  readMobileAuthTransaction,
  readMobileSession,
  resetMobileSecureStorage,
  writeMobileSession,
} from './secureSession'

type MobileSessionResponse = { access_token: string; refresh_token: string }

export type MobileAuthIssueReason = 'session_missing' | 'storage_unreadable' | 'server_rejected' | 'refresh_unavailable' | 'access_rejected'
export type MobileAuthIssue = {
  reportId: string
  occurredAt: string
  stage: 'session_read' | 'refresh' | 'access'
  reason: MobileAuthIssueReason
  requiresLogin: boolean
  title: string
  message: string
  httpStatus?: number
  nativeCode?: string
  serverCode?: string
}

export const MOBILE_AUTH_COMPLETED_EVENT = 'fridgeboard:mobile-auth-completed'
export const MOBILE_AUTH_PROGRESS_EVENT = 'fridgeboard:mobile-auth-progress'
export const MOBILE_AUTH_ISSUE_EVENT = 'fridgeboard:mobile-auth-issue'
export const MOBILE_AUTH_CLEARED_EVENT = 'fridgeboard:mobile-auth-cleared'
const MOBILE_AUTH_REQUEST_TIMEOUT_MS = 30_000

let refreshPromise: Promise<string | null> | null = null
let mobileAuthCompletionPromise: Promise<boolean> | null = null
let lastCompletedMobileCallbackKey: string | null = null
let mobileAuthError: string | null = null
let mobileAuthProgress: 'idle' | 'processing' = 'idle'
let currentMobileAuthIssue: MobileAuthIssue | null = null
const MOBILE_AUTH_MARKER_KEY = 'fridgeboard.mobile.auth-established'
const MOBILE_AUTH_ISSUE_KEY = 'fridgeboard.mobile.auth-issue'

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function issueCopy(issue: MobileAuthIssue): MobileAuthIssue {
  return { ...issue }
}

function newReportId(): string {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `auth-${suffix}`
}

function issueText(reason: MobileAuthIssueReason, serverCode?: string): Pick<MobileAuthIssue, 'title' | 'message'> {
  if (reason === 'session_missing') return {
    title: '手机登录信息已丢失',
    message: '这台手机曾经登录过，但加密登录信息已不存在。可能清除了应用数据、恢复了系统备份或重新安装了应用，因此需要重新登录。',
  }
  if (reason === 'storage_unreadable') return {
    title: '手机登录信息无法读取',
    message: '系统无法解密这台手机保存的登录信息，常见于系统备份恢复或安全密钥变化。为保护账号，需要重新登录。',
  }
  if (reason === 'server_rejected' && serverCode === 'mobile_session_revoked') return {
    title: '登录会话已被服务器撤销',
    message: '服务器记录显示这台手机的长期登录会话已被撤销，因此需要重新登录。提交现场信息后，开发人员可按诊断编号继续核对撤销时间。',
  }
  if (reason === 'server_rejected' && serverCode === 'mobile_session_not_found') return {
    title: '服务器已找不到登录会话',
    message: '手机仍保存着长期登录信息，但服务器已找不到对应会话记录，因此需要重新登录。提交现场信息后，开发人员可按诊断编号排查记录为何丢失。',
  }
  if (reason === 'server_rejected' || reason === 'access_rejected') return {
    title: '登录会话已被服务器撤销',
    message: '服务器明确拒绝了这台手机保存的长期登录会话。可能是主动退出、会话被撤销或服务端记录被清理，因此需要重新登录。',
  }
  return {
    title: '暂时无法确认登录状态',
    message: '当前网络或登录服务暂时不可用。登录信息仍保存在手机中，不需要重新登录；联网后重试即可。',
  }
}

function recordMobileAuthIssue(
  stage: MobileAuthIssue['stage'],
  reason: MobileAuthIssueReason,
  requiresLogin: boolean,
  details: Pick<MobileAuthIssue, 'httpStatus' | 'nativeCode' | 'serverCode'> = {},
  reportId?: string,
): MobileAuthIssue {
  if (!reportId && currentMobileAuthIssue?.stage === stage && currentMobileAuthIssue.reason === reason) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOBILE_AUTH_ISSUE_EVENT))
    return issueCopy(currentMobileAuthIssue)
  }
  const issue = { reportId: reportId ?? newReportId(), occurredAt: new Date().toISOString(), stage, reason, requiresLogin, ...issueText(reason, details.serverCode), ...details }
  currentMobileAuthIssue = issue
  try { storage()?.setItem(MOBILE_AUTH_ISSUE_KEY, JSON.stringify(issue)) } catch { /* 诊断持久化失败不影响认证恢复。 */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOBILE_AUTH_ISSUE_EVENT))
  return issue
}

/** 返回最近一次移动认证故障，供页面解释重新登录原因。 */
export function getMobileAuthIssue(): MobileAuthIssue | null {
  if (currentMobileAuthIssue) return issueCopy(currentMobileAuthIssue)
  try {
    const raw = storage()?.getItem(MOBILE_AUTH_ISSUE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MobileAuthIssue
    if (!parsed.reportId || !parsed.reason || typeof parsed.requiresLogin !== 'boolean') return null
    currentMobileAuthIssue = parsed
    return issueCopy(parsed)
  } catch { return null }
}

/** 清理已解决或主动退出后的认证故障提示。 */
export function clearMobileAuthIssue(): void {
  currentMobileAuthIssue = null
  try { storage()?.removeItem(MOBILE_AUTH_ISSUE_KEY) } catch { /* Web Storage 不可用时仅清理内存。 */ }
}

/** 提交严格白名单化的认证现场信息；凭证和业务数据不会进入请求。 */
export async function submitMobileAuthDiagnostic(issue: MobileAuthIssue): Promise<string> {
  const response = await apiRequest<{ accepted: true; report_id: string }>('/api/auth/mobile/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      report_id: issue.reportId,
      occurred_at: issue.occurredAt,
      stage: issue.stage,
      reason: issue.reason,
      requires_login: issue.requiresLogin,
      http_status: issue.httpStatus ?? null,
      native_code: issue.nativeCode ?? null,
      server_code: issue.serverCode ?? null,
      app_release: APP_RELEASE,
      platform: Capacitor.getPlatform(),
      network_online: typeof navigator === 'undefined' ? null : navigator.onLine,
    }),
  })
  return response.report_id
}

class MobileAuthUnavailableError extends Error {
  code = 'MOBILE_AUTH_REFRESH_UNAVAILABLE'
}

class MobileAuthReauthenticationRequiredError extends Error {
  code = 'MOBILE_AUTH_REAUTHENTICATION_REQUIRED'
}

function reauthenticationRequiredError(issue: MobileAuthIssue): MobileAuthReauthenticationRequiredError {
  return new MobileAuthReauthenticationRequiredError(issue.message)
}

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
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), MOBILE_AUTH_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(resolveApiUrl(path), { ...init, credentials: 'omit', cache: 'no-store', signal: controller.signal })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: { code?: unknown; diagnostic_id?: unknown } } | null
      const error = new Error('移动端认证请求失败') as Error & { status?: number; serverCode?: string; diagnosticId?: string }
      error.status = response.status
      if (typeof payload?.detail?.code === 'string') error.serverCode = payload.detail.code.slice(0, 80)
      if (typeof payload?.detail?.diagnostic_id === 'string') error.diagnosticId = payload.detail.diagnostic_id.slice(0, 80)
      throw error
    }
    return response.json() as Promise<T>
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

/** 取出启动阶段记录的登录失败提示，避免 bootstrap 吞掉错误后用户无从判断。 */
export function takeMobileAuthError(): string | null {
  const error = mobileAuthError
  mobileAuthError = null
  return error
}

async function saveResponse(response: MobileSessionResponse): Promise<string> {
  try {
    await writeMobileSession({ accessToken: response.access_token, refreshToken: response.refresh_token })
  } catch (error) {
    const nativeCode = (error as { code?: unknown }).code
    const issue = recordMobileAuthIssue('session_read', 'storage_unreadable', true, {
      nativeCode: typeof nativeCode === 'string' ? nativeCode.slice(0, 80) : 'SECURE_STORAGE_WRITE_FAILED',
    })
    throw reauthenticationRequiredError(issue)
  }
  try { storage()?.setItem(MOBILE_AUTH_MARKER_KEY, '1') } catch { /* 标记仅用于区分首次安装与异常丢失。 */ }
  clearMobileAuthIssue()
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
  try {
    const session = await readMobileSession()
    if (!session && storage()?.getItem(MOBILE_AUTH_MARKER_KEY) === '1') {
      recordMobileAuthIssue('session_read', 'session_missing', true)
    }
    return session?.accessToken ?? null
  } catch (error) {
    const nativeCode = (error as { code?: unknown }).code
    recordMobileAuthIssue('session_read', 'storage_unreadable', true, {
      nativeCode: typeof nativeCode === 'string' ? nativeCode.slice(0, 80) : 'SECURE_STORAGE_READ_FAILED',
    })
    return null
  }
}

/** 保存配对接口返回的设备 Bearer 凭证。 */
export { addMobileDeviceToken }

/** 单飞刷新 App 会话，避免并发 401 产生多次刷新令牌消费。 */
export async function refreshMobileSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const existingIssue = getMobileAuthIssue()
    if (existingIssue?.requiresLogin) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOBILE_AUTH_ISSUE_EVENT))
      throw reauthenticationRequiredError(existingIssue)
    }
    let session
    try {
      session = await readMobileSession()
    } catch (error) {
      const nativeCode = (error as { code?: unknown }).code
      const issue = recordMobileAuthIssue('session_read', 'storage_unreadable', true, {
        nativeCode: typeof nativeCode === 'string' ? nativeCode.slice(0, 80) : 'SECURE_STORAGE_READ_FAILED',
      })
      throw reauthenticationRequiredError(issue)
    }
    if (!session && storage()?.getItem(MOBILE_AUTH_MARKER_KEY) === '1') {
      throw reauthenticationRequiredError(recordMobileAuthIssue('session_read', 'session_missing', true))
    }
    if (!session) return null
    try {
      const response = await apiRequest<MobileSessionResponse>('/api/auth/mobile/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      })
      return await saveResponse(response)
    } catch (error) {
      const { status, serverCode, diagnosticId, code } = error as Error & { status?: number; serverCode?: string; diagnosticId?: string; code?: string }
      if (code === 'MOBILE_AUTH_REAUTHENTICATION_REQUIRED') throw error
      if (status === 400 || status === 401) {
        const issue = recordMobileAuthIssue('refresh', 'server_rejected', true, { httpStatus: status, serverCode }, diagnosticId)
        throw reauthenticationRequiredError(issue)
      }
      recordMobileAuthIssue('refresh', 'refresh_unavailable', false)
      throw new MobileAuthUnavailableError('暂时无法连接登录服务，已保留登录状态，请联网后重试。', { cause: error })
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
    try { storage()?.removeItem(MOBILE_AUTH_MARKER_KEY) } catch { /* 主动退出仍继续完成。 */ }
    clearMobileAuthIssue()
  }
}

/** 记录刷新成功后仍被服务端拒绝的异常会话。 */
export async function rejectCurrentMobileSession(httpStatus: number): Promise<void> {
  const issue = recordMobileAuthIssue('access', 'access_rejected', true, { httpStatus })
  throw reauthenticationRequiredError(issue)
}

/** 用户明确同意后清理本机会话；自动错误处理不得调用此函数。 */
export async function approveMobileSessionClear(): Promise<void> {
  await resetMobileSecureStorage()
  try { storage()?.removeItem(MOBILE_AUTH_MARKER_KEY) } catch { /* 用户已授权清理，标记失败不阻断登录。 */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOBILE_AUTH_CLEARED_EVENT))
}
