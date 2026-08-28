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
import { isExternalRuntimeAsset } from './runtime'
import { clearMobileSession } from './secureSession'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('原生受保护图片资源', () => {
  it('识别第三方绝对 URL，供无凭证 Blob 请求使用', () => {
    expect(isExternalRuntimeAsset('https://cdn.example.com/icon.png')).toBe(true)
    expect(isExternalRuntimeAsset('https://fridge.flycn.fyi/api/icon-library/egg.svg')).toBe(false)
    expect(isExternalRuntimeAsset('/api/owner/refrigerators/fridge-1/icons/egg')).toBe(false)
  })

  it('不携带 Owner Bearer 或 Cookie 读取第三方在线图片', async () => {
    let requestedAuthorization = ''
    let requestedCredentials = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://cdn.example.com/icon.png')
      requestedAuthorization = new Headers(init?.headers).get('Authorization') ?? ''
      requestedCredentials = String(init?.credentials ?? '')
      return new Response('<svg />', { status: 200, headers: { 'content-type': 'image/svg+xml' } })
    }))

    const blob = await fetchRuntimeAsset('https://cdn.example.com/icon.png')

    expect(requestedAuthorization).toBe('')
    expect(requestedCredentials).toBe('omit')
    expect(blob.type).toBe('image/svg+xml')
  })

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

  it('保留受保护图片接口返回的具体错误详情', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: '图标草稿变体不存在' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )))

    await expect(fetchRuntimeAsset('/api/owner/refrigerators/fridge-1/icons/missing'))
      .rejects.toMatchObject({ message: '图标草稿变体不存在', status: 404 })
  })
})

describe('公共内置图片资源', () => {
  it('不携带 Owner Bearer 或 Cookie 读取公共图标', async () => {
    let requestedAuthorization = ''
    let requestedCredentials = ''
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestedAuthorization = new Headers(init?.headers).get('Authorization') ?? ''
      requestedCredentials = String(init?.credentials ?? '')
      return new Response('<svg />', { status: 200, headers: { 'content-type': 'image/svg+xml' } })
    }))

    await fetchRuntimeAsset('/api/icon-library/egg.svg?v=stable')

    expect(requestedAuthorization).toBe('')
    expect(requestedCredentials).toBe('omit')
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
