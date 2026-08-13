import type { InventoryBatch } from './appTypes'

/** 统计仍有库存的物品批次；数量为 0 的批次保留在列表中，但不属于当前库存。 */
export function countActiveInventoryItems(quantities: readonly number[]): number {
  return quantities.filter(quantity => quantity > 0).length
}

/** 将一次库存保存响应合并到当前列表，保留同一批量操作中已完成的其他响应。 */
export function upsertInventoryBatch(
  items: readonly InventoryBatch[],
  batch: InventoryBatch,
): InventoryBatch[] {
  return [...items.filter(item => item.id !== batch.id), batch]
}

/** 将 API 返回的两位小数价格转换为分，避免合计金额产生浮点误差。 */
export function parseInventoryPriceCents(price: string | null | undefined): number {
  if (!price || !/^\d+(?:\.\d{1,2})?$/.test(price)) return 0
  const [yuan, fraction = ''] = price.split('.')
  const cents = Number(`${fraction}00`.slice(0, 2))
  const total = Number(yuan) * 100 + cents
  return Number.isSafeInteger(total) ? total : 0
}

/** 格式化库存列表中的单项价格；空价格不渲染为伪造金额。 */
export function formatInventoryPrice(price: string | null | undefined): string {
  if (!price) return ''
  const cents = parseInventoryPriceCents(price)
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** 计算当前列表中仍有库存物品的价格合计，未填写价格按 0 处理。 */
export function sumInventoryPrices(items: readonly Pick<InventoryBatch, 'quantity' | 'price'>[]): string {
  const totalCents = items.reduce((total, item) => total + (item.quantity > 0 ? parseInventoryPriceCents(item.price) : 0), 0)
  return `¥${Math.floor(totalCents / 100)}.${String(totalCents % 100).padStart(2, '0')}`
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
