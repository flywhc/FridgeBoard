import type { InventoryBatch } from './appTypes'

/** 生成批量移动确认卡片中的物品摘要，避免多选名称撑破页面。 */
export function getInventorySelectionSummary(
  items: Pick<InventoryBatch, 'item_name'>[],
  maxLength = 48,
): string {
  const summary = items.map(item => item.item_name).join('，')
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, Math.max(0, maxLength - 1))}…`
}
