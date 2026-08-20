import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))
vi.mock('./mobileAuth', () => ({
  getAccessToken: async () => 'owner-token',
  refreshMobileSession: async () => null,
}))
vi.mock('./secureSession', () => ({
  clearMobileDeviceToken: async () => undefined,
  clearMobileSession: vi.fn(async () => undefined),
  readMobileDeviceToken: async () => null,
}))

import { fetchRuntimeAsset, request } from './appApi'
import { clearMobileSession } from './secureSession'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('原生受保护图片资源', () => {
  it('使用 Owner Bearer 读取分类图标并返回 Blob', async () => {
    let requestedUrl = ''
    let requestedAuthorization = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input)
      requestedAuthorization = new Headers(init?.headers).get('Authorization') ?? ''
      return new Response('<svg />', { status: 200, headers: { 'content-type': 'image/svg+xml' } })
    }))

    const blob = await fetchRuntimeAsset('/api/owner/refrigerators/fridge-1/icons/egg?v=1')

    expect(requestedUrl).toBe('https://fridge.flycn.fyi/api/owner/refrigerators/fridge-1/icons/egg?v=1')
    expect(requestedAuthorization).toBe('Bearer owner-token')
    expect(blob.type).toBe('image/svg+xml')
  })
})

describe('原生会话恢复', () => {
  it('刷新暂时失败时保留本地会话，避免网络抖动变成强制重新登录', async () => {
    vi.mocked(clearMobileSession).mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: '访问令牌已过期' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )))

    await expect(request('/api/auth/status')).rejects.toMatchObject({ status: 401 })
    expect(clearMobileSession).not.toHaveBeenCalled()
  })
})
