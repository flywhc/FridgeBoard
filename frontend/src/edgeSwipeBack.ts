const EDGE_SWIPE_START_MAX_X = 28
const EDGE_SWIPE_TRIGGER_DISTANCE = 72
const EDGE_SWIPE_MAX_VERTICAL_DISTANCE = 96

/**
 * 判断一次触摸是否符合页面级左边缘右滑返回手势。
 *
 * 仅接受从屏幕左侧窄边缘开始、明显向右且不是纵向滚动的触摸，避免误触发返回。
 */
export function shouldTriggerEdgeSwipeBack(startX: number, startY: number, endX: number, endY: number): boolean {
  const deltaX = endX - startX
  const deltaY = Math.abs(endY - startY)
  return startX <= EDGE_SWIPE_START_MAX_X
    && deltaX >= EDGE_SWIPE_TRIGGER_DISTANCE
    && deltaX > deltaY * 1.25
    && deltaY <= EDGE_SWIPE_MAX_VERTICAL_DISTANCE
}
