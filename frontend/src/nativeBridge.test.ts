import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativePlugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  downloadAndInstallApk: vi.fn(),
  getAppInfo: vi.fn(),
  getNetworkStatus: vi.fn(),
  openInstallSettings: vi.fn(),
  openExternalUrl: vi.fn(),
  setSystemBars: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true), getPlatform: vi.fn(() => 'android') },
  registerPlugin: () => nativePlugin,
}))

import { shareContent, subscribeNativeBack, subscribeNetworkStatus } from './nativeBridge'

describe('nativeBridge 监听生命周期', () => {
  beforeEach(() => {
    nativePlugin.addListener.mockReset()
    nativePlugin.downloadAndInstallApk.mockReset()
    nativePlugin.getAppInfo.mockReset()
    nativePlugin.openExternalUrl.mockReset()
    nativePlugin.setSystemBars.mockReset()
    nativePlugin.share.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    })
  })

  it('Android 主题切换同步系统栏颜色和图标样式', async () => {
    nativePlugin.setSystemBars.mockResolvedValue(undefined)

    const { setNativeSystemBars } = await import('./nativeBridge')
    await setNativeSystemBars({ color: '#EAF5F1', style: 'LIGHT' })

    expect(nativePlugin.setSystemBars).toHaveBeenCalledWith({ color: '#EAF5F1', style: 'LIGHT' })
  })

  it('原生更新事件在订阅完成前取消时仍移除监听', async () => {
    const { subscribeApkUpdate } = await import('./nativeBridge')
    let resolveRegistration: (handle: { remove: () => Promise<void> }) => void = () => undefined
    nativePlugin.addListener.mockImplementation(() => new Promise(resolve => { resolveRegistration = resolve }))

    const cleanup = subscribeApkUpdate(() => undefined)
    cleanup()
    const remove = vi.fn(async () => undefined)
    resolveRegistration({ remove })
    await Promise.resolve()
    await Promise.resolve()

    expect(remove).toHaveBeenCalledOnce()
  })

  it('原生恢复事件在订阅完成前取消时仍移除监听并转发事件', async () => {
    const { subscribeAppResume } = await import('./nativeBridge')
    let emit: (() => void) | undefined
    const remove = vi.fn(async () => undefined)
    nativePlugin.addListener.mockImplementation((eventName: string, listener: () => void) => {
      if (eventName === 'appResume') emit = listener
      return Promise.resolve({ remove })
    })
    const onResume = vi.fn()

    const cleanup = subscribeAppResume(onResume)
    await Promise.resolve()
    emit?.()
    expect(onResume).toHaveBeenCalledOnce()
    cleanup()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('原生分享成功时保留完整 payload', async () => {
    nativePlugin.share.mockResolvedValue(undefined)

    await expect(shareContent({ title: '购物清单', text: '鸡蛋 × 2', url: 'https://example.test/list' })).resolves.toBe('shared')
    expect(nativePlugin.share).toHaveBeenCalledWith({ title: '购物清单', text: '鸡蛋 × 2', url: 'https://example.test/list' })
  })

  it('原生登录页交给明确的系统浏览器打开', async () => {
    const { openExternalUrl } = await import('./nativeBridge')
    nativePlugin.openExternalUrl.mockResolvedValue(undefined)

    await expect(openExternalUrl('https://fridge.flycn.fyi/api/auth/login')).resolves.toBeUndefined()
    expect(nativePlugin.openExternalUrl).toHaveBeenCalledWith({ url: 'https://fridge.flycn.fyi/api/auth/login' })
  })

  it('原生分享失败时复制文本和 URL，而不是丢失其中一项', async () => {
    nativePlugin.share.mockRejectedValue(new Error('no share target'))
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>

    await expect(shareContent({ text: '鸡蛋 × 2', url: 'https://example.test/list' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('鸡蛋 × 2\nhttps://example.test/list')
  })

  it('原生分享取消时不复制内容并返回取消状态', async () => {
    nativePlugin.share.mockRejectedValue({ code: 'SHARE_CANCELLED' })
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>

    await expect(shareContent({ text: '鸡蛋 × 2' })).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('返回监听在注册完成前取消时仍移除原生监听', async () => {
    let resolveRegistration: (handle: { remove: () => Promise<void> }) => void = () => undefined
    nativePlugin.addListener.mockImplementation(() => new Promise(resolve => { resolveRegistration = resolve }))

    const cleanup = subscribeNativeBack(() => undefined)
    cleanup()
    const remove = vi.fn(async () => undefined)
    resolveRegistration({ remove })
    await Promise.resolve()
    await Promise.resolve()

    expect(remove).toHaveBeenCalledOnce()
  })

  it('网络监听在注册完成前取消时仍移除原生监听', async () => {
    let resolveRegistration: (handle: { remove: () => Promise<void> }) => void = () => undefined
    nativePlugin.addListener.mockImplementation(() => new Promise(resolve => { resolveRegistration = resolve }))

    const cleanup = subscribeNetworkStatus(() => undefined)
    cleanup()
    const remove = vi.fn(async () => undefined)
    resolveRegistration({ remove })
    await Promise.resolve()
    await Promise.resolve()

    expect(remove).toHaveBeenCalledOnce()
  })
})
