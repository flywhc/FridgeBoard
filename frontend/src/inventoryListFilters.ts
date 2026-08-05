import type { InventoryBatch, Refrigerator } from './appTypes'

export type InventorySortKey = 'recent' | 'oldest' | 'expiry'
export const INVENTORY_SORT_STORAGE_KEY = 'fb-inventory-sort-key'

const inventorySortKeys: InventorySortKey[] = ['recent', 'oldest', 'expiry']

/** 读取所有物品列表共用的上次排序选择；存储不可用或值非法时回退到最近添加。 */
export function readInventorySortKey(): InventorySortKey {
  if (typeof window === 'undefined') return 'recent'
  try {
    const value = window.localStorage.getItem(INVENTORY_SORT_STORAGE_KEY)
    return inventorySortKeys.includes(value as InventorySortKey) ? value as InventorySortKey : 'recent'
  } catch {
    return 'recent'
  }
}

/** 保存所有物品列表共用的排序选择，避免隐私模式等存储异常阻断列表使用。 */
export function saveInventorySortKey(sortKey: InventorySortKey): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INVENTORY_SORT_STORAGE_KEY, sortKey)
  } catch {
    // 本地存储不可用时保留当前会话内的排序状态。
  }
}

export function formatInventoryScopeTitle(zoneLabel: string, slotKey: string): string {
  const slotNumber = slotKey.match(/(\d+)$/)?.[1]
  return slotNumber ? `${zoneLabel}-${slotNumber}` : zoneLabel
}

/** 返回不泄露布局内部 key 的存放位置文案。 */
export function formatStorageSlotLabel(zoneLabel: string, slotKey: string): string {
  const slotNumber = slotKey.match(/(\d+)$/)?.[1]
  return slotNumber ? `${zoneLabel} · 第 ${slotNumber} 格` : zoneLabel
}

export function filterInventory(
  inventory: InventoryBatch[],
  query: string,
  slotId?: string,
  refrigeratorByItemId?: Record<string, Refrigerator>,
): InventoryBatch[] {
  const keyword = query.trim().toLocaleLowerCase()
  return inventory.filter(item => {
    if (slotId && item.storage_slot_id !== slotId) return false
    if (!keyword) return true
    return [
      item.item_name,
      item.subcategory_name,
      item.product_description,
      item.best_before,
      refrigeratorByItemId?.[item.id]?.name,
    ]
      .some(value => Boolean(value?.toLocaleLowerCase().includes(keyword)))
  })
}

function compareDate(left: string | null, right: string | null, direction: 'asc' | 'desc'): number {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
}

/** 按物品列表筛选菜单的语义返回稳定排序结果。 */
export function sortInventory(inventory: InventoryBatch[], sortKey: InventorySortKey): InventoryBatch[] {
  return [...inventory].sort((left, right) => {
    if (sortKey === 'oldest') {
      return compareDate(left.production_date, right.production_date, 'asc')
        || right.id.localeCompare(left.id)
    }
    if (sortKey === 'expiry') {
      const leftHasExpiry = Boolean(left.best_before)
      const rightHasExpiry = Boolean(right.best_before)
      if (leftHasExpiry !== rightHasExpiry) return leftHasExpiry ? -1 : 1
      if (leftHasExpiry && rightHasExpiry) {
        return compareDate(left.best_before, right.best_before, 'asc')
          || compareDate(left.production_date, right.production_date, 'desc')
      }
      return compareDate(left.production_date, right.production_date, 'desc')
        || right.id.localeCompare(left.id)
    }
    return compareDate(left.production_date, right.production_date, 'desc')
      || right.id.localeCompare(left.id)
  })
}
