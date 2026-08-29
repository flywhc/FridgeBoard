import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { PAGE_TRANSITION_WATCHDOG_MS } from './pageTransition'

export type PageStackTransition = {
  type: 'push' | 'pop'
  pageId: number
  incomingPageId?: number
  incomingAnimation?: 'from-left' | 'from-right' | 'none'
  complete?: (pageId: number) => void
}

type PageStackPopOptions = {
  incomingAnimation?: 'from-left' | 'none'
}

type PageStackPushOptions = {
  incomingAnimation?: 'from-right'
}

export type PageStackEntry<T> = {
  id: number
  value: T
}

export const PageStackActiveContext = createContext(true)

/** 返回当前页面层是否处于用户可见、可交互状态。隐藏栈层应暂停高成本副作用。 */
export function usePageStackActive(): boolean {
  return useContext(PageStackActiveContext)
}

/**
 * 为应用页和局部业务流程提供统一的入栈、出栈、替换和转场生命周期。
 * 页面值由调用方定义，页面组件通过 `PageStack` 映射渲染，从而保留下层实例。
 */
export function usePageStack<T>(initialValue: T) {
  const [entries, setEntries] = useState<PageStackEntry<T>[]>(() => [{ id: 0, value: initialValue }])
  const entriesRef = useRef(entries)
  const nextIdRef = useRef(1)
  const [transition, setTransition] = useState<PageStackTransition | null>(null)
  const transitionRef = useRef<PageStackTransition | null>(null)
  const transitionTimerRef = useRef<number | null>(null)
  const navigationLockedRef = useRef(false)
  const clearTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)
    transitionRef.current = null
    transitionTimerRef.current = null
    navigationLockedRef.current = false
    setTransition(null)
  }, [])
  const completeTransition = useCallback((pageId: number) => {
    const currentTransition = transitionRef.current
    if (!currentTransition || currentTransition.pageId !== pageId) return
    if (currentTransition.type === 'pop') {
      const next = entriesRef.current.slice(0, -1)
      entriesRef.current = next
      setEntries(next)
    }
    clearTransition()
  }, [clearTransition])
  const startTransition = useCallback((nextTransition: Omit<PageStackTransition, 'complete'>) => {
    const transitionWithCompletion = { ...nextTransition, complete: completeTransition }
    transitionRef.current = transitionWithCompletion
    navigationLockedRef.current = true
    setTransition(transitionWithCompletion)
    // 必须等待渲染时间轴发出 animationend；此定时器只兜底动画事件丢失，禁止用它截断正常转场。
    transitionTimerRef.current = window.setTimeout(
      () => completeTransition(nextTransition.pageId),
      PAGE_TRANSITION_WATCHDOG_MS,
    )
  }, [completeTransition])
  const replace = useCallback((value: T) => {
    clearTransition()
    const next = [{ id: nextIdRef.current++, value }]
    entriesRef.current = next
    setEntries(next)
  }, [clearTransition])
  const push = useCallback((value: T, options: PageStackPushOptions = {}) => {
    if (navigationLockedRef.current) return
    const current = entriesRef.current
    if (Object.is(current[current.length - 1]?.value, value)) return
    const nextEntry = { id: nextIdRef.current++, value }
    const next = [...current, nextEntry]
    entriesRef.current = next
    setEntries(next)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    startTransition({ type: 'push', pageId: nextEntry.id, incomingPageId: nextEntry.id, incomingAnimation: options.incomingAnimation ?? 'from-right' })
  }, [startTransition])
  const pop = useCallback((fallback?: T, options: PageStackPopOptions = {}) => {
    if (navigationLockedRef.current) return
    const current = entriesRef.current
    if (current.length < 2) {
      if (fallback !== undefined) replace(fallback)
      return
    }
    const outgoing = current[current.length - 1]
    const incoming = current[current.length - 2]
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const next = current.slice(0, -1)
      entriesRef.current = next
      setEntries(next)
      return
    }
    startTransition({ type: 'pop', pageId: outgoing.id, incomingPageId: incoming.id, incomingAnimation: options.incomingAnimation })
  }, [replace, startTransition])
  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)
  }, [])
  return { entries, current: entries[entries.length - 1]?.value ?? initialValue, transition, push, replace, pop }
}
