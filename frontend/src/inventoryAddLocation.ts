/** 返回从指定分格进入新增流程时仍然有效的预选位置。 */
export function getPreselectedInventorySlotId(initialSlotId: string | undefined, slots: { id: string }[]): string | undefined {
  return initialSlotId && slots.some(slot => slot.id === initialSlotId) ? initialSlotId : undefined
}
