import type { InventoryBatch } from './appTypes'

export function formatInventoryScopeTitle(zoneLabel: string, slotKey: string): string {
  const slotNumber = slotKey.match(/(\d+)$/)?.[1]
  return slotNumber ? `${zoneLabel}-${slotNumber}` : zoneLabel
}

export function filterInventory(inventory: InventoryBatch[], query: string, slotId?: string): InventoryBatch[] {
  const keyword = query.trim().toLocaleLowerCase()
  return inventory.filter(item => {
    if (slotId && item.storage_slot_id !== slotId) return false
    if (!keyword) return true
    return [item.food_name, item.subcategory_name, item.category_name, item.product_description, item.best_before]
      .some(value => Boolean(value?.toLocaleLowerCase().includes(keyword)))
  })
}
