import type { Category, RecognitionOrderItem } from './appTypes'

/** 只返回已勾选且小类仍属于当前冰箱的订单商品。 */
export function getSelectedOrderItems(
  items: RecognitionOrderItem[],
  selection: Record<number, boolean>,
  categories: Category[],
): RecognitionOrderItem[] {
  const validSubcategoryIds = new Set(
    categories.filter(category => category.parent_id).map(category => category.id),
  )
  return items.filter((item, index) => (
    selection[index]
    && Boolean(item.subcategory_id)
    && validSubcategoryIds.has(item.subcategory_id!)
  ))
}
