import { describe, expect, it } from 'vitest'
import { getFridgeStatusSummary } from './fridgeStatus'

describe('冰箱列表状态摘要', () => {
  it('将未完成布局与冰箱端连接状态组合为继续设置提示', () => {
    expect(getFridgeStatusSummary({
      setup_status: 'needs_layout',
      display_device_status: 'bound',
    })).toEqual({
      badge: '待完成设置',
      detail: '已连接冰箱端 · 尚未创建布局',
      primaryAction: '继续设置',
    })
  })

  it('为已完成布局但尚未绑定冰箱端保留可发现的绑定提示', () => {
    expect(getFridgeStatusSummary({
      setup_status: 'ready',
      display_device_status: 'unbound',
    })).toEqual({
      badge: null,
      detail: '布局已创建 · 冰箱端未绑定',
      primaryAction: '绑定冰箱端设备',
    })
  })

  it('已完成且已绑定时不重复显示设置或绑定行动', () => {
    expect(getFridgeStatusSummary({
      setup_status: 'ready',
      display_device_status: 'bound',
    })).toEqual({
      badge: null,
      detail: '已连接冰箱端',
      primaryAction: null,
    })
  })
})
