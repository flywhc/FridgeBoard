import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativePlugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  getNetworkStatus: vi.fn(),
  openExternalUrl: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => nativePlugin,
}))

import { shareContent, subscribeNativeBack, subscribeNetworkStatus } from './nativeBridge'

describe('nativeBridge 监听生命周期', () => {
  beforeEach(() => {
    nativePlugin.addListener.mockReset()
    nativePlugin.openExternalUrl.mockReset()
    nativePlugin.share.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    })
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
