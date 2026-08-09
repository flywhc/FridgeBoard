import { getHorizontalSwipeDirection } from './swipeGesture'

export const SAFE_SWIPE_START_MIN_X = 24
export const SAFE_SWIPE_START_MAX_RATIO = 0.66

/**
 * 判断一次触摸是否符合页面级安全区域右滑返回手势。
 *
 * 起点避开屏幕最左侧系统手势区域，同时允许从页面中部起手。
 */
export function shouldTriggerSafeSwipeBack(startX: number, startY: number, endX: number, endY: number, viewportWidth: number): boolean {
  return startX >= SAFE_SWIPE_START_MIN_X
    && startX <= viewportWidth * SAFE_SWIPE_START_MAX_RATIO
    && getHorizontalSwipeDirection(startX, startY, endX, endY) === 'previous'
}
