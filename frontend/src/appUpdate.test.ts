import { describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  getNativeAppInfo: vi.fn(),
  getAppInfo: vi.fn(),
  downloadAndInstallApk: vi.fn(),
  openInstallSettings: vi.fn(),
}))

vi.mock('./nativeBridge', () => native)

import { ANDROID_UPDATE_CHECK_COOLDOWN_MS, checkForAndroidUpdate, isAndroidUpdateAvailable, markAndroidUpdateCheck, parseGitHubAndroidRelease, shouldAutoCheckAndroidUpdate } from './appUpdate'

const release = {
  tag_name: 'v1.2.0',
  name: 'FridgeBoard 1.2.0 · release 260825112917',
  body: '修复更新流程。',
  assets: [{
    name: 'FridgeBoard-1.2.0-android-120.apk',
    size: 10_000,
    digest: `sha256:${'a'.repeat(64)}`,
    browser_download_url: 'https://github.com/flywhc/FridgeBoard/releases/download/v1.2.0/FridgeBoard-1.2.0-android-120.apk',
  }],
}

describe('Android APK 更新检查', () => {
  const createStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial))
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
  }

  it('只把更大的 numeric build number 视为更新', () => {
    expect(isAndroidUpdateAvailable(100, '101')).toBe(true)
    expect(isAndroidUpdateAvailable(100, '100')).toBe(false)
    expect(isAndroidUpdateAvailable(100, '99')).toBe(false)
    expect(isAndroidUpdateAvailable(100, 'not-a-number')).toBe(false)
  })

  it('拒绝不可信的下载地址、哈希和包元数据', () => {
    expect(() => parseGitHubAndroidRelease({ ...release, assets: [{ ...release.assets[0], browser_download_url: 'http://evil.test/app.apk' }] })).toThrow()
    expect(() => parseGitHubAndroidRelease({ ...release, assets: [{ ...release.assets[0], digest: 'sha256:short' }] })).toThrow()
    expect(() => parseGitHubAndroidRelease({ ...release, assets: [{ ...release.assets[0], name: 'FridgeBoard-1.2.0-android-0.apk' }] })).toThrow()
  })

  it('从 GitHub Release asset 提取版本、构建号、大小和摘要', () => {
    expect(parseGitHubAndroidRelease(release)).toEqual({
      app_slug: 'fridgeboard',
      platform: 'android',
      variant: 'universal',
      version: '1.2.0',
      release: '260825112917',
      build_number: '120',
      artifact_filename: 'FridgeBoard-1.2.0-android-120.apk',
      file_size: 10_000,
      sha256: 'a'.repeat(64),
      release_notes: '修复更新流程。',
      download_url: release.assets[0].browser_download_url,
      expires_at: null,
    })
  })

  it('读取原生 versionCode 并返回更新状态', async () => {
    native.getNativeAppInfo.mockResolvedValue({ platform: 'android', versionName: '1.0.0', versionCode: 100 })
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => release })

    await expect(checkForAndroidUpdate(fetcher)).resolves.toEqual({
      local: { platform: 'android', versionName: '1.0.0', versionCode: 100 },
      remote: expect.objectContaining({ build_number: '120' }),
      available: true,
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/flywhc/FridgeBoard/releases/latest',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
  })

  it('自动检查使用本地冷却，手动检查可通过标记时间控制下一次自动检查', () => {
    const storage = createStorage()
    const now = 1_800_000_000_000
    expect(shouldAutoCheckAndroidUpdate(now, storage)).toBe(true)
    markAndroidUpdateCheck(now, storage)
    expect(shouldAutoCheckAndroidUpdate(now + ANDROID_UPDATE_CHECK_COOLDOWN_MS - 1, storage)).toBe(false)
    expect(shouldAutoCheckAndroidUpdate(now + ANDROID_UPDATE_CHECK_COOLDOWN_MS, storage)).toBe(true)
  })

  it('将 GitHub API 限流响应转换为可操作的重试提示', async () => {
    native.getNativeAppInfo.mockResolvedValue({ platform: 'android', versionName: '1.0.0', versionCode: 100 })
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    await expect(checkForAndroidUpdate(fetcher)).rejects.toThrow('暂时受限')
  })
})
