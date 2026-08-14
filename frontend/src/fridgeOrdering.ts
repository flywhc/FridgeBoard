const REFRIGERATOR_ORDER_STORAGE_KEY = 'fb-refrigerator-order'

export type RefrigeratorDropPosition = 'before' | 'after'
export type RefrigeratorDropTarget = { id: string; top: number; bottom: number }

/** 读取当前设备保存的冰箱顺序；损坏的本地值按未保存处理。 */
export function readRefrigeratorOrder(storage: Pick<Storage, 'getItem'> = window.localStorage): string[] {
  try {
    const raw = storage.getItem(REFRIGERATOR_ORDER_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/** 将服务端返回的冰箱合并到本机顺序，新增冰箱追加到列表末尾。 */
export function applyRefrigeratorOrder<T extends { id: string }>(fridges: T[], preferredIds = readRefrigeratorOrder()): T[] {
  const byId = new Map(fridges.map(fridge => [fridge.id, fridge]))
  const ordered = preferredIds.flatMap(id => {
    const fridge = byId.get(id)
    if (!fridge) return []
    byId.delete(id)
    return [fridge]
  })
  return [...ordered, ...fridges.filter(fridge => byId.has(fridge.id))]
}

/** 保存当前设备的冰箱顺序；存储失败不影响当前页面内的排序。 */
export function saveRefrigeratorOrder(ids: string[], storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    storage.setItem(REFRIGERATOR_ORDER_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // 本地存储不可用时仍保留当前内存中的排序结果。
  }
}

/** 按目标条目的前/后位置移动一个冰箱 ID。 */
export function reorderRefrigeratorIds(ids: string[], draggedId: string, targetId: string, position: RefrigeratorDropPosition): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids
  const remaining = ids.filter(id => id !== draggedId)
  const targetIndex = remaining.indexOf(targetId)
  if (targetIndex < 0) return ids
  remaining.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, draggedId)
  return remaining
}

/** 仅当指针位于其他冰箱条目的上下半区时返回插入位置。 */
export function getRefrigeratorDropPosition(pointerY: number, targets: RefrigeratorDropTarget[], draggedId: string): { targetId: string; position: RefrigeratorDropPosition } | null {
  const target = targets.find(item => item.id !== draggedId && pointerY >= item.top && pointerY <= item.bottom)
  if (!target) return null
  return { targetId: target.id, position: pointerY < (target.top + target.bottom) / 2 ? 'before' : 'after' }
}
