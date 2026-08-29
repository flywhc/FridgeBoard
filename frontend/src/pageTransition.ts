import type { HorizontalSwipeDirection } from './swipeGesture'

export const PAGE_TRANSITION_DURATION_MS = 220
export const PAGE_TRANSITION_WATCHDOG_MS = 2_000
export type FridgeSwipeTransitionPhase = 'exit' | 'enter'

/** 返回横扫方向和阶段对应的冰箱布局动画类名。 */
export function getFridgeSwipeTransitionClass(direction: HorizontalSwipeDirection, phase: FridgeSwipeTransitionPhase): string {
  return `p7-fridge-swipe-${phase}-${direction}`
}
