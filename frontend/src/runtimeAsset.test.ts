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
  clearMobileSession: async () => undefined,
  readMobileDeviceToken: async () => null,
}))

import { fetchRuntimeAsset } from './appApi'

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
