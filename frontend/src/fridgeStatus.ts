import type { Refrigerator } from './appTypes'

export type FridgeStatusSummary = {
  badge: '待完成设置' | null
  detail: string
  primaryAction: '继续设置' | '绑定冰箱端设备' | null
}

/** 将服务端明确返回的布局与冰箱端状态转换为列表可用的文案。 */
export function getFridgeStatusSummary(
  refrigerator: Pick<Refrigerator, 'setup_status' | 'display_device_status'>,
): FridgeStatusSummary {
  if (refrigerator.setup_status === 'needs_layout') {
    return {
      badge: '待完成设置',
      detail: refrigerator.display_device_status === 'bound'
        ? '已连接冰箱端 · 尚未创建布局'
        : '尚未连接冰箱端 · 尚未创建布局',
      primaryAction: '继续设置',
    }
  }

  if (refrigerator.display_device_status === 'unbound') {
    return {
      badge: null,
      detail: '布局已创建 · 冰箱端未绑定',
      primaryAction: '绑定冰箱端设备',
    }
  }

  return { badge: null, detail: '已连接冰箱端', primaryAction: null }
}
