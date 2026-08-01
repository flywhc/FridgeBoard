import type { InventoryBatch } from './appTypes'

export function formatInventoryScopeTitle(zoneLabel: string, slotKey: string): string {
  const slotNumber = slotKey.match(/(\d+)$/)?.[1]
  return slotNumber ? `${zoneLabel}-${slotNumber}` : zoneLabel
}

/** 返回不泄露布局内部 key 的存放位置文案。 */
export function formatStorageSlotLabel(zoneLabel: string, slotKey: string): string {
  const slotNumber = slotKey.match(/(\d+)$/)?.[1]
  return slotNumber ? `${zoneLabel} · 第 ${slotNumber} 格` : zoneLabel
}

export function filterInventory(inventory: InventoryBatch[], query: string, slotId?: string): InventoryBatch[] {
  const keyword = query.trim().toLocaleLowerCase()
  return inventory.filter(item => {
    if (slotId && item.storage_slot_id !== slotId) return false
    if (!keyword) return true
    return [item.item_name, item.subcategory_name, item.product_description, item.best_before]
      .some(value => Boolean(value?.toLocaleLowerCase().includes(keyword)))
  })
}
