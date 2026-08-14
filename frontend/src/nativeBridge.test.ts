import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativePlugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  getNetworkStatus: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => nativePlugin,
}))

import { subscribeNativeBack, subscribeNetworkStatus } from './nativeBridge'

describe('nativeBridge 监听生命周期', () => {
  beforeEach(() => {
    nativePlugin.addListener.mockReset()
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
