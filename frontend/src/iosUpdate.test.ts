import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ getNativeAppInfo: vi.fn(), openExternalUrl: vi.fn() }))
vi.mock('./nativeBridge', () => native)

import { checkForIosUpdate, installIosUpdate, IOS_INSTALL_URL, isIosUpdateAvailable, markIosUpdateCheck, parseIosRelease, shouldAutoCheckIosUpdate, type IosRelease } from './iosUpdate'

const remote: IosRelease = {
  version: '0.2.11', build_number: 4, release: '261104173345', release_notes: '更新说明',
  artifact_filename: 'FridgeBoard-0.2.11-ios.ipa', file_size: 10000,
  sha256: 'a'.repeat(64), install_url: IOS_INSTALL_URL,
}
const local = { platform: 'ios' as const, versionName: '0.2.10', versionCode: 3 }

describe('iOS Ad Hoc 更新', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    native.getNativeAppInfo.mockResolvedValue(local)
    native.openExternalUrl.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('比较产品版本，同版本比较构建号，拒绝降级', () => {
    expect(isIosUpdateAvailable(local, remote)).toBe(true)
    expect(isIosUpdateAvailable({ ...local, versionCode: 999 }, remote)).toBe(true)
    expect(isIosUpdateAvailable({ ...local, versionName: remote.version }, remote)).toBe(true)
    expect(isIosUpdateAvailable({ ...local, versionName: remote.version, versionCode: 4 }, remote)).toBe(false)
    expect(isIosUpdateAvailable({ ...local, versionName: '0.3.0' }, remote)).toBe(false)
    expect(() => isIosUpdateAvailable({ ...local, versionName: 'dev' }, remote)).toThrow()
  })

  it.each([
    { install_url: 'https://evil.example/apps/fridgeboard' },
    { install_url: `${IOS_INSTALL_URL}?next=https://evil.example` },
    { install_url: 'itms-services://malicious' },
    { build_number: 0 }, { sha256: 'bad' }, { artifact_filename: 'other.ipa' },
    { version: '0.2.11-beta' }, { file_size: -1 },
  ])('拒绝异常契约 %o', patch => {
    expect(() => parseIosRelease({ ...remote, ...patch })).toThrow()
  })

  it('无凭据读取同域元数据，204 不作为失败', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    expect(await checkForIosUpdate(fetcher)).toMatchObject({ remote: null, available: false })
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/mobile/ios/releases/latest'), expect.objectContaining({ credentials: 'omit', cache: 'no-store' }))
  })

  it('安装前重新检查，再通过原生 HTTPS 桥打开门户', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(remote))
    expect((await installIosUpdate(fetcher)).available).toBe(true)
    expect(native.openExternalUrl).toHaveBeenCalledWith(IOS_INSTALL_URL)
  })

  it('当前版本或更高版本不打开安装页面', async () => {
    native.getNativeAppInfo.mockResolvedValue({ ...local, versionName: '0.3.0' })
    expect((await installIosUpdate(vi.fn().mockResolvedValue(Response.json(remote)))).available).toBe(false)
    expect(native.openExternalUrl).not.toHaveBeenCalled()
  })

  it('门户打开失败保留错误，不报告安装成功', async () => {
    native.openExternalUrl.mockRejectedValue(new Error('无法打开系统浏览器'))
    await expect(installIosUpdate(vi.fn().mockResolvedValue(Response.json(remote)))).rejects.toThrow('无法打开系统浏览器')
  })

  it.each([429, 503])('HTTP %i 可重试且不打开门户', async status => {
    await expect(installIosUpdate(vi.fn().mockResolvedValue(new Response(null, { status })))).rejects.toThrow(String(status))
    expect(native.openExternalUrl).not.toHaveBeenCalled()
  })

  it('非 JSON/截断 JSON 不会触发安装', async () => {
    await expect(installIosUpdate(vi.fn().mockResolvedValue(new Response('{"version":')))).rejects.toThrow()
    expect(native.openExternalUrl).not.toHaveBeenCalled()
  })

  it('非 iOS 环境不检查更新', async () => {
    native.getNativeAppInfo.mockResolvedValue({ ...local, platform: 'web' })
    const fetcher = vi.fn()
    await expect(checkForIosUpdate(fetcher)).rejects.toThrow('不是 iOS')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('取消的检查不请求或打开安装页面', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn()
    await expect(installIosUpdate(fetcher, controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    expect(native.openExternalUrl).not.toHaveBeenCalled()
  })

  it('超时终止请求并释放定时器', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    }))
    const assertion = expect(checkForIosUpdate(fetcher)).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('六小时冷却只约束自动检查，存储异常和时钟回拨可恢复', () => {
    let stored: string | null = null
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } }
    markIosUpdateCheck(100, storage)
    expect(shouldAutoCheckIosUpdate(101, storage)).toBe(false)
    expect(shouldAutoCheckIosUpdate(100 + 6 * 3600000, storage)).toBe(true)
    expect(shouldAutoCheckIosUpdate(99, storage)).toBe(true)
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(() => markIosUpdateCheck(100, broken)).not.toThrow()
    expect(shouldAutoCheckIosUpdate(100, broken)).toBe(true)
  })
})
