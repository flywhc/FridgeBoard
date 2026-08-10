import { useEffect, useRef, type RefObject } from 'react'

/** 统一处理顶部栏弹出菜单的外部点击和 Escape 关闭行为。 */
export function useDismissibleMenu<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const menuRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const closeWhenOutside = (event: PointerEvent) => {
      if (isMenuPointerOutside(menuRef.current, event.target)) closeRef.current()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return menuRef
}

/** 判断指针事件目标是否位于菜单容器之外；菜单卸载时也视为应关闭。 */
export function isMenuPointerOutside(menuElement: Pick<HTMLElement, 'contains'> | null, target: EventTarget | null): boolean {
  return !menuElement || !target || !menuElement.contains(target as Node)
}
