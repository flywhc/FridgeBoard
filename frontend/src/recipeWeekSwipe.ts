/** 在本周和下周之间切换周食谱当前选择。 */
export function toggleRecipeWeekOffset(currentOffset: 0 | 7): 0 | 7 {
  return currentOffset === 0 ? 7 : 0
}
