import type { HorizontalSwipeDirection } from './swipeGesture'

export const PAGE_TRANSITION_DURATION_MS = 220
export type PageTransitionEnter = 'back' | null
export type FridgeSwipeTransitionPhase = 'exit' | 'enter'

let pendingPageEnter: PageTransitionEnter = null

/** 在返回操作更换页面前记录上级页的入场方向。 */
export function requestPageEnterTransition(transition: Exclude<PageTransitionEnter, null>): void {
  pendingPageEnter = transition
}

/** 只消费一次页面入场标记，避免后续普通渲染重复播放动画。 */
export function consumePageEnterTransition(): PageTransitionEnter {
  const transition = pendingPageEnter
  pendingPageEnter = null
  return transition
}

/** 返回横扫方向和阶段对应的冰箱布局动画类名。 */
export function getFridgeSwipeTransitionClass(direction: HorizontalSwipeDirection, phase: FridgeSwipeTransitionPhase): string {
  return `p7-fridge-swipe-${phase}-${direction}`
}

/** 返回二级页返回后上级页的进入动画类名。 */
export function getPageEnterClass(transition: PageTransitionEnter): string {
  return transition === 'back' ? 'page-enter-from-left' : ''
}
