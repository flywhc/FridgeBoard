import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secureSession = vi.hoisted(() => ({
  clearMobileSession: vi.fn(),
  readMobileSession: vi.fn(),
  resetMobileSecureStorage: vi.fn(),
  writeMobileSession: vi.fn(),
}))

vi.mock('./runtime', () => ({
  appRuntime: { kind: 'capacitor', apiOrigin: 'https://api.example.test' },
  MOBILE_AUTH_REDIRECT_URI: 'fridgeboard://mobile/auth/callback',
  resolveApiUrl: (path: string) => `https://api.example.test${path}`,
}))
vi.mock('./secureSession', () => ({
  ...secureSession,
  addMobileDeviceToken: vi.fn(),
  createMobileAuthTransaction: vi.fn(),
  readMobileAuthTransaction: vi.fn(),
}))
vi.mock('./nativeBridge', () => ({ openExternalUrl: vi.fn() }))
vi.mock('./deepLink', () => ({ takePendingMobileAuthCallback: vi.fn() }))

import {
  clearMobileAuthIssue,
  approveMobileSessionClear,
  getAccessToken,
  getMobileAuthIssue,
  refreshMobileSession,
  submitMobileAuthDiagnostic,
} from './mobileAuth'

describe('Capacitor 长期登录恢复', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    vi.clearAllMocks()
    secureSession.clearMobileSession.mockResolvedValue(undefined)
    secureSession.resetMobileSecureStorage.mockResolvedValue(undefined)
    secureSession.writeMobileSession.mockResolvedValue(undefined)
    clearMobileAuthIssue()
    secureSession.readMobileSession.mockResolvedValue({
      accessToken: 'short-lived-access-token',
      refreshToken: 'long-lived-refresh-token',
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('曾登录设备的安全存储为空时记录凭证丢失，首次安装不误报', async () => {
    secureSession.readMobileSession.mockResolvedValue(null)

    await expect(getAccessToken()).resolves.toBeNull()
    expect(getMobileAuthIssue()).toBeNull()

    localStorage.setItem('fridgeboard.mobile.auth-established', '1')
    await expect(getAccessToken()).resolves.toBeNull()
    expect(getMobileAuthIssue()).toMatchObject({ reason: 'session_missing', requiresLogin: true })
  })

  it('安全存储解密失败时保留稳定原生错误码', async () => {
    secureSession.readMobileSession.mockRejectedValue(Object.assign(new Error('raw native failure'), {
      code: 'SECURE_STORAGE_KEY_MISMATCH',
    }))

    await expect(getAccessToken()).resolves.toBeNull()
    expect(getMobileAuthIssue()).toMatchObject({
      reason: 'storage_unreadable',
      nativeCode: 'SECURE_STORAGE_KEY_MISMATCH',
      requiresLogin: true,
    })
  })

  it('刷新请求网络失败时保留长期会话，不把用户转成未登录', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(refreshMobileSession()).rejects.toMatchObject({
      code: 'MOBILE_AUTH_REFRESH_UNAVAILABLE',
      message: '暂时无法连接登录服务，已保留登录状态，请联网后重试。',
    })
    expect(secureSession.resetMobileSecureStorage).not.toHaveBeenCalled()
    expect(getMobileAuthIssue()).toMatchObject({
      reason: 'refresh_unavailable',
      requiresLogin: false,
    })
  })

  it('服务端明确拒绝长期凭证时仍保留本地 token，等待用户确认', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: { message: '移动会话已失效，请重新登录', code: 'mobile_session_revoked', diagnostic_id: 'auth-server-12345678' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )))

    await expect(refreshMobileSession()).rejects.toMatchObject({
      code: 'MOBILE_AUTH_REAUTHENTICATION_REQUIRED',
    })
    expect(secureSession.clearMobileSession).not.toHaveBeenCalled()
    expect(getMobileAuthIssue()).toMatchObject({
      reason: 'server_rejected',
      requiresLogin: true,
      httpStatus: 401,
      serverCode: 'mobile_session_revoked',
      reportId: 'auth-server-12345678',
    })
  })

  it('只有用户确认函数会清理本地 token', async () => {
    expect(secureSession.clearMobileSession).not.toHaveBeenCalled()

    await approveMobileSessionClear()

    expect(secureSession.resetMobileSecureStorage).toHaveBeenCalledOnce()
  })

  it('自动刷新写入遇到 Keystore 错误时不重置安全存储', async () => {
    secureSession.writeMobileSession.mockRejectedValue(Object.assign(new Error('native write failed'), {
      code: 'SECURE_STORAGE_KEY_MISMATCH',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'long-lived-refresh-token',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await expect(refreshMobileSession()).rejects.toMatchObject({
      code: 'MOBILE_AUTH_REAUTHENTICATION_REQUIRED',
    })
    expect(secureSession.resetMobileSecureStorage).not.toHaveBeenCalled()
    expect(secureSession.clearMobileSession).not.toHaveBeenCalled()
    expect(getMobileAuthIssue()).toMatchObject({
      reason: 'storage_unreadable',
      nativeCode: 'SECURE_STORAGE_KEY_MISMATCH',
    })
  })

  it('提交诊断只发送白名单元数据，不发送任何会话令牌', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')))
    await refreshMobileSession().catch(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ accepted: true, report_id: 'auth-test-report' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
    const issue = getMobileAuthIssue()
    expect(issue).not.toBeNull()

    await submitMobileAuthDiagnostic(issue!)

    const [, init] = vi.mocked(fetch).mock.calls.at(-1)!
    const body = String(init?.body)
    expect(body).toContain('refresh_unavailable')
    expect(body).not.toContain('short-lived-access-token')
    expect(body).not.toContain('long-lived-refresh-token')
  })
})
