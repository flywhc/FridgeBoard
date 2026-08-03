import type { InventoryBatch } from './appTypes'

function dateToUtcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function getInventoryExpiryLabel(item: Pick<InventoryBatch, 'best_before'>, today = new Date()): string {
  if (!item.best_before) return ''
  const todayValue = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const remainingDays = Math.round((dateToUtcDay(item.best_before) - todayValue) / 86_400_000)
  return remainingDays >= 0 ? `还有${remainingDays}天` : `已过期${Math.abs(remainingDays)}天`
}
