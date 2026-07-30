export type FoodIconPosition = {
  x: number
  verticalOffset: number
}

/**
 * 计算首页分格内食材图标的位置。
 *
 * 横向位置使用分格内的等分点，避免少量食材贴在边缘；三件及以上时，
 * 相邻图标上下错开 6px，使 18px 图标保留约三分之一高度的重叠。
 */
export function getFoodIconPosition(index: number, count: number): FoodIconPosition {
  if (count < 1 || index < 0 || index >= count) {
    throw new RangeError('食材图标位置索引超出范围')
  }

  return {
    x: (index + 1) / (count + 1),
    verticalOffset: count >= 3 ? (index % 2 === 0 ? 6 : -6) : 0,
  }
}
