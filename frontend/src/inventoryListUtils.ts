import type { InventoryBatch } from './appTypes'

/** 统计仍有库存的物品批次；数量为 0 的批次保留在列表中，但不属于当前库存。 */
export function countActiveInventoryItems(quantities: readonly number[]): number {
  return quantities.filter(quantity => quantity > 0).length
}

function dateToUtcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function getInventoryAddedDaysLabel(item: Pick<InventoryBatch, 'production_date'>, today = new Date()): string {
  if (!item.production_date) return ''
  const todayValue = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const addedDays = Math.max(0, Math.round((todayValue - dateToUtcDay(item.production_date)) / 86_400_000))
  return `已添加${addedDays}天`
}

export function getInventoryExpiryLabel(item: Pick<InventoryBatch, 'best_before'>, today = new Date()): string {
  if (!item.best_before) return ''
  const todayValue = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const remainingDays = Math.round((dateToUtcDay(item.best_before) - todayValue) / 86_400_000)
  return remainingDays >= 0 ? `还有${remainingDays}天` : `已过期${Math.abs(remainingDays)}天`
}
