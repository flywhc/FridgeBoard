import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FridgeDeviceBinding, LayoutBindingGuide } from './FridgeDeviceBinding'
import {
  formatPasscodeExpiry,
  getActiveDisplayDevice,
  getDisplayBindingErrorMessage,
  getDisplayBindingSummary,
  isDisplayPasscodeComplete,
  normalizeDisplayPasscode,
} from './fridgeDeviceBinding.logic'

const callbacks = {
  onBack: () => undefined,
  onScanQr: async () => null,
  onBindByQr: async () => undefined,
  onCreatePasscode: async () => ({ passcode: '042913', expiresInSeconds: 300 }),
}

describe('冰箱端绑定纯逻辑', () => {
  it('只选择仍有效的 Kindle 设备作为当前冰箱端', () => {
    expect(getActiveDisplayDevice([
      { kind: 'phone', revoked_at: null },
      { kind: 'kindle', revoked_at: '2026-08-07T00:00:00Z' },
      { kind: 'kindle', revoked_at: null },
    ] as never[])).toEqual({ kind: 'kindle', revoked_at: null })
  })

  it('按服务端绑定状态生成未绑定和已绑定文案', () => {
    expect(getDisplayBindingSummary({ display_device_status: 'unbound' }, undefined)).toEqual({
      bound: false,
      title: '尚未绑定',
      detail: '扫描冰箱屏幕上的绑定二维码。',
      badge: '未连接',
    })
    expect(getDisplayBindingSummary({ display_device_status: 'bound' }, { label: '厨房 Kindle', last_seen_at: null })).toEqual({
      bound: true,
      title: '厨房 Kindle',
      detail: '尚未同步',
      badge: '已连接',
    })
  })

  it('清理六位码输入并检查完整长度', () => {
    expect(normalizeDisplayPasscode('0a4-2913')).toBe('042913')
    expect(isDisplayPasscodeComplete('042913')).toBe(true)
    expect(isDisplayPasscodeComplete('42913')).toBe(false)
    expect(formatPasscodeExpiry(300)).toBe('5 分钟内有效')
    expect(formatPasscodeExpiry(45)).toBe('45 秒内有效')
  })

  it('换绑失败提示明确保留旧设备', () => {
    expect(getDisplayBindingErrorMessage(new Error('二维码已过期'), 'replace_display_device')).toBe('二维码已过期 当前绑定设备仍保持访问。')
    expect(getDisplayBindingErrorMessage(null, 'bind_display_device')).toBe('绑定失败，请回到冰箱屏幕扫描当前显示的二维码。')
  })
})

describe('冰箱端绑定页面状态', () => {
  it('覆盖未绑定、已绑定和六位码次级入口', () => {
    const unbound = renderToStaticMarkup(createElement(FridgeDeviceBinding, {
      refrigerator: { id: 'fridge-1', name: '阳台冰柜', display_device_status: 'unbound' },
      devices: [],
      ...callbacks,
    }))
    expect(unbound).toContain('尚未绑定')
    expect(unbound).toContain('绑定冰箱端设备')
    expect(unbound).toContain('使用六位绑定码')

    const bound = renderToStaticMarkup(createElement(FridgeDeviceBinding, {
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', display_device_status: 'bound' },
      devices: [{ id: 'kindle-1', kind: 'kindle', label: '厨房 Kindle', last_seen_at: null, revoked_at: null }],
      ...callbacks,
    }))
    expect(bound).toContain('厨房 Kindle')
    expect(bound).toContain('更换冰箱端设备')
    expect(bound).toContain('新设备绑定成功后，当前冰箱端将停止访问')
  })

  it('渲染布局完成后的立即绑定/稍后绑定分流', () => {
    const markup = renderToStaticMarkup(createElement(LayoutBindingGuide, {
      refrigeratorName: '阳台冰柜',
      onBindNow: () => undefined,
      onLater: () => undefined,
    }))
    expect(markup).toContain('冰箱布局已创建')
    expect(markup).toContain('扫码绑定冰箱端')
    expect(markup).toContain('稍后绑定')
  })
})
