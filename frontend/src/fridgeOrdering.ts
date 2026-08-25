export type RefrigeratorDropPosition = 'before' | 'after'
export type RefrigeratorDropTarget = { id: string; top: number; bottom: number }

/** 按服务端返回的顺序展示冰箱；显式顺序仅用于兼容旧缓存的合并。 */
export function applyRefrigeratorOrder<T extends { id: string }>(fridges: T[], preferredIds: string[] = []): T[] {
  const byId = new Map(fridges.map(fridge => [fridge.id, fridge]))
  const ordered = preferredIds.flatMap(id => {
    const fridge = byId.get(id)
    if (!fridge) return []
    byId.delete(id)
    return [fridge]
  })
  return [...ordered, ...fridges.filter(fridge => byId.has(fridge.id))]
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
