import type { HorizontalSwipeDirection } from './swipeGesture'

/** 将周食谱中间区域的平扫方向映射为本周/下周选择值。 */
export function getRecipeWeekOffsetForSwipe(direction: HorizontalSwipeDirection): 0 | 7 {
  return direction === 'previous' ? 7 : 0
}
