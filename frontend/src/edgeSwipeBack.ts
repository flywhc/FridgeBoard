export const SAFE_SWIPE_START_MIN_X = 56
export const SAFE_SWIPE_START_MAX_X = 128
const SAFE_SWIPE_TRIGGER_DISTANCE = 72
const SAFE_SWIPE_MAX_VERTICAL_DISTANCE = 96

/**
 * 判断一次触摸是否符合页面级安全区域右滑返回手势。
 *
 * 起点刻意避开屏幕最左侧系统手势区域，避免 Android 浏览器接管该手势。
 */
export function shouldTriggerSafeSwipeBack(startX: number, startY: number, endX: number, endY: number): boolean {
  const deltaX = endX - startX
  const deltaY = Math.abs(endY - startY)
  return startX >= SAFE_SWIPE_START_MIN_X
    && startX <= SAFE_SWIPE_START_MAX_X
    && deltaX >= SAFE_SWIPE_TRIGGER_DISTANCE
    && deltaX > deltaY * 1.25
    && deltaY <= SAFE_SWIPE_MAX_VERTICAL_DISTANCE
}
