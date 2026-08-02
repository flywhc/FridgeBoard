/** 布局编辑器统一提供“不可用”和 1–8 个存放位置。 */
export const LAYOUT_SLOT_OPTIONS = Array.from({ length: 9 }, (_, count) => count)

/** 将分格数量转换为布局编辑器和无障碍名称共用的用户文案。 */
export function formatLayoutSlotOption(count: number): string {
  return count === 0 ? '不可用' : `${count} 格`
}
