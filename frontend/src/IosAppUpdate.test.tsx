import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { findNode, findText, installDom, invoke, reactProps, type TestDocument } from './testSupport/dom'

const mocks = vi.hoisted(() => ({
  checkForIosUpdate: vi.fn(), installIosUpdate: vi.fn(), markIosUpdateCheck: vi.fn(),
  shouldAutoCheckIosUpdate: vi.fn(), subscribeAppResume: vi.fn(),
}))
vi.mock('./iosUpdate', () => mocks)
vi.mock('./nativeBridge', () => ({ subscribeAppResume: mocks.subscribeAppResume }))
vi.mock('./sharedUi', () => ({
  NoticeDialog: ({ message }: { message: string }) => createElement('div', { role: 'dialog' }, message),
}))

const available = {
  available: true,
  remote: { version: '0.2.11', release: '261104173345', release_notes: '新版说明' },
}

describe('iOS 更新区域交互', () => {
  let IosAppUpdate: typeof import('./IosAppUpdate').IosAppUpdate
  let createRoot: typeof import('react-dom/client').createRoot
  let documentRef: TestDocument
  beforeAll(async () => {
    documentRef = installDom()
    ;({ createRoot } = await import('react-dom/client'))
    ;({ IosAppUpdate } = await import('./IosAppUpdate'))
  })
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    mocks.shouldAutoCheckIosUpdate.mockReturnValue(true)
    mocks.checkForIosUpdate.mockResolvedValue(available)
    mocks.installIosUpdate.mockResolvedValue(available)
    mocks.subscribeAppResume.mockReturnValue(vi.fn())
  })
  afterEach(() => vi.useRealTimers())

  async function mount() {
    const container = documentRef.createElement('div')
    documentRef.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    await act(async () => {
      root.render(createElement(IosAppUpdate))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    return { container, root }
  }

  it('自动检查后展示可用更新，点击交接后允许重试并在返回时复查', async () => {
    const { container, root } = await mount()
    expect(container.textContent).toContain('0.2.11')
    const notes = findNode(container, node => node.tagName === 'TEXTAREA')
    expect(reactProps(notes)?.value).toBe('新版说明')
    const button = findText(container, '下载并安装更新')
    expect(button).not.toBeNull()
    await act(async () => { invoke(button, 'onClick'); await Promise.resolve() })
    expect(mocks.installIosUpdate).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('已打开安装页面')
    const resume = mocks.subscribeAppResume.mock.calls[0][0]
    await act(async () => { resume(); await Promise.resolve() })
    expect(mocks.checkForIosUpdate).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })

  it('冷却期间不自动检查，但手动检查仍然工作', async () => {
    mocks.shouldAutoCheckIosUpdate.mockReturnValue(false)
    const { container, root } = await mount()
    expect(mocks.checkForIosUpdate).not.toHaveBeenCalled()
    await act(async () => { invoke(findText(container, '检查更新'), 'onClick'); await Promise.resolve() })
    expect(mocks.checkForIosUpdate).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })

  it('没有更新时保留检查入口，不显示下载按钮', async () => {
    mocks.checkForIosUpdate.mockResolvedValue({ available: false, remote: null })
    const { container, root } = await mount()
    expect(findText(container, '下载并安装更新')).toBeNull()
    expect(findText(container, '检查更新')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('错误使用通知弹窗且仍可手动重试', async () => {
    mocks.checkForIosUpdate.mockRejectedValue(new Error('网络失败，请重试'))
    const { container, root } = await mount()
    expect(container.textContent).toContain('网络失败，请重试')
    mocks.checkForIosUpdate.mockResolvedValue(available)
    await act(async () => { invoke(findText(container, '检查更新'), 'onClick'); await Promise.resolve() })
    expect(findText(container, '下载并安装更新')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('检查中去重，卸载取消请求并清理恢复监听', async () => {
    mocks.checkForIosUpdate.mockImplementation(() => new Promise(() => undefined))
    const { container, root } = await mount()
    const signal = mocks.checkForIosUpdate.mock.calls[0][1] as AbortSignal
    await act(async () => { invoke(findText(container, '检查中…'), 'onClick') })
    expect(mocks.checkForIosUpdate).toHaveBeenCalledOnce()
    const unsubscribe = mocks.subscribeAppResume.mock.results[0].value
    await act(async () => root.unmount())
    expect(signal.aborted).toBe(true)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
