import { useRef, type HTMLAttributes, type TouchEvent } from 'react'
import { getHorizontalSwipeDirection, type HorizontalSwipeDirection } from './swipeGesture'

export type HorizontalSwipeHandlers = Pick<HTMLAttributes<HTMLElement>, 'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel' | 'onClickCapture'>

/**
 * 为单个页面元素提供横向切换手势，同时保留纵向滚动和点击抑制边界。
 */
export function useHorizontalSwipeHandlers(onSwipe: (direction: HorizontalSwipeDirection) => void): HorizontalSwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null)
  const horizontalIntent = useRef(false)
  const suppressClickUntil = useRef(0)
  const reset = () => {
    start.current = null
    horizontalIntent.current = false
  }
  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    start.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null
    horizontalIntent.current = false
  }
  const onTouchMove = (event: TouchEvent<HTMLElement>) => {
    const origin = start.current
    const touch = event.touches[0]
    if (!origin || event.touches.length !== 1 || !touch) return
    const deltaX = Math.abs(touch.clientX - origin.x)
    const deltaY = Math.abs(touch.clientY - origin.y)
    if (deltaY > 24 && deltaY > deltaX) { reset(); return }
    if (deltaX > 8 && deltaX > deltaY * 1.1) {
      horizontalIntent.current = true
      if (event.cancelable) event.preventDefault()
    }
  }
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const origin = start.current
    const touch = event.changedTouches[0]
    const direction = origin && touch ? getHorizontalSwipeDirection(origin.x, origin.y, touch.clientX, touch.clientY) : null
    const shouldSuppressClick = horizontalIntent.current
    reset()
    if (shouldSuppressClick) {
      suppressClickUntil.current = Date.now() + 500
    }
    if (direction) onSwipe(direction)
  }
  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: reset,
    onClickCapture: event => {
      if (Date.now() > suppressClickUntil.current) return
      event.preventDefault()
      event.stopPropagation()
      suppressClickUntil.current = 0
    },
  }
}
