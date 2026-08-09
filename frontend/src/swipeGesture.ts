export type HorizontalSwipeDirection = 'previous' | 'next'

const HORIZONTAL_SWIPE_MIN_DISTANCE = 64
const HORIZONTAL_SWIPE_DIRECTION_RATIO = 1.25

/**
 * 根据起止坐标判定水平横扫方向。
 *
 * 左扫对应浏览下一项，右扫对应上一项；速度不参与判定，避免慢速但意图明确的手势失败。
 */
export function getHorizontalSwipeDirection(startX: number, startY: number, endX: number, endY: number): HorizontalSwipeDirection | null {
  const deltaX = endX - startX
  const deltaY = Math.abs(endY - startY)
  if (Math.abs(deltaX) < HORIZONTAL_SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= deltaY * HORIZONTAL_SWIPE_DIRECTION_RATIO) return null
  return deltaX < 0 ? 'next' : 'previous'
}

/** 返回横扫后的循环索引；不足两项时不产生切换目标。 */
export function getCircularSwipeIndex(itemCount: number, currentIndex: number, direction: HorizontalSwipeDirection): number | null {
  if (itemCount < 2 || currentIndex < 0 || currentIndex >= itemCount) return null
  return direction === 'next'
    ? (currentIndex + 1) % itemCount
    : (currentIndex - 1 + itemCount) % itemCount
}
