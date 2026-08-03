import type { InventoryBatch, Refrigerator } from './appTypes'

export type InventorySearchResult = {
  refrigerator: Refrigerator
  item: InventoryBatch
}

/** 在所有可访问冰箱的库存中按名称、分类和备注做包含匹配。 */
export function filterInventoryAcrossRefrigerators(
  inventories: InventorySearchResult[],
  query: string,
): InventorySearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return inventories
  return inventories.filter(({ refrigerator, item }) => [
    refrigerator.name,
    item.item_name,
    item.subcategory_name,
    item.product_description ?? '',
  ].some(value => value.toLocaleLowerCase().includes(normalizedQuery)))
}
