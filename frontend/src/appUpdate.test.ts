import { describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  getNativeAppInfo: vi.fn(),
  getAppInfo: vi.fn(),
  downloadAndInstallApk: vi.fn(),
  openInstallSettings: vi.fn(),
}))

vi.mock('./nativeBridge', () => native)

import { checkForAndroidUpdate, isAndroidUpdateAvailable, parsePublicAndroidRelease } from './appUpdate'

const release = {
  app_slug: 'fridgeboard',
  platform: 'android',
  variant: 'universal',
  version: '1.2.0',
  build_number: '120',
  artifact_filename: 'FridgeBoard.apk',
  file_size: 10_000,
  sha256: 'a'.repeat(64),
  release_notes: '修复更新流程。',
  download_url: 'https://app.flycn.fyi/download/public-install_token/FridgeBoard.apk',
  expires_at: '2026-08-24T00:00:00Z',
}

describe('Android APK 更新检查', () => {
  it('只把更大的 numeric build number 视为更新', () => {
    expect(isAndroidUpdateAvailable(100, '101')).toBe(true)
    expect(isAndroidUpdateAvailable(100, '100')).toBe(false)
    expect(isAndroidUpdateAvailable(100, '99')).toBe(false)
    expect(isAndroidUpdateAvailable(100, 'not-a-number')).toBe(false)
  })

  it('拒绝不可信的下载地址、哈希和包元数据', () => {
    expect(() => parsePublicAndroidRelease({ ...release, download_url: 'http://evil.test/app.apk' })).toThrow()
    expect(() => parsePublicAndroidRelease({ ...release, sha256: 'short' })).toThrow()
    expect(() => parsePublicAndroidRelease({ ...release, build_number: '0' })).toThrow()
  })

  it('接受已是最新版时没有下载地址的响应', () => {
    expect(parsePublicAndroidRelease({ ...release, download_url: null, expires_at: null }).download_url).toBeNull()
  })

  it('读取原生 versionCode 并返回更新状态', async () => {
    native.getNativeAppInfo.mockResolvedValue({ platform: 'android', versionName: '1.0.0', versionCode: 100 })
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => release })

    await expect(checkForAndroidUpdate(fetcher)).resolves.toEqual({
      local: { platform: 'android', versionName: '1.0.0', versionCode: 100 },
      remote: release,
      available: true,
    })
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/apps/fridgeboard/releases/latest'),
        search: expect.stringContaining('current_build_number=100'),
      }),
      { cache: 'no-store', credentials: 'omit' },
    )
  })
})
