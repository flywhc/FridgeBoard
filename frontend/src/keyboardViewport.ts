/** Android WebView 输入法打开时的可视区域和焦点滚动处理。 */

export const KEYBOARD_OPEN_ATTRIBUTE = 'data-keyboard-open'
export const KEYBOARD_INPUT_SELECTOR = [
  'textarea',
  '[contenteditable="true"]',
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="date"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"])',
].join(',')

const VIEWPORT_CLOSE_THRESHOLD = 80

function isKeyboardInput(element: Element | null): element is HTMLElement {
  return element?.matches(KEYBOARD_INPUT_SELECTOR) === true
}

function scrollFocusedInputIntoView(element: HTMLElement): void {
  if (!element.isConnected || document.activeElement !== element) return
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
}

/** Install APK-only input handling and return a function that removes its listeners. */
export function installKeyboardViewportHandling(): () => void {
  const root = document.documentElement
  const viewport = window.visualViewport
  let focusedInput: HTMLElement | null = null
  let keyboardExpected = false
  let baselineHeight = viewport?.height ?? window.innerHeight
  const timers: number[] = []

  const setKeyboardOpen = (open: boolean): void => {
    if (open) root.setAttribute(KEYBOARD_OPEN_ATTRIBUTE, 'true')
    else root.removeAttribute(KEYBOARD_OPEN_ATTRIBUTE)
  }

  const revealFocusedInput = (): void => {
    if (focusedInput) scrollFocusedInputIntoView(focusedInput)
  }

  const scheduleReveal = (): void => {
    timers.push(window.setTimeout(revealFocusedInput, 80))
    timers.push(window.setTimeout(revealFocusedInput, 280))
  }

  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target instanceof Element && isKeyboardInput(event.target) ? event.target : null
    if (!target) return
    focusedInput = target
    keyboardExpected = true
    baselineHeight = Math.max(baselineHeight, viewport?.height ?? window.innerHeight)
    setKeyboardOpen(true)
    scheduleReveal()
  }

  const onFocusOut = (): void => {
    window.setTimeout(() => {
      if (isKeyboardInput(document.activeElement)) return
      focusedInput = null
      keyboardExpected = false
      setKeyboardOpen(false)
    }, 100)
  }

  const onViewportResize = (): void => {
    const currentHeight = viewport?.height ?? window.innerHeight
    if (!keyboardExpected) {
      baselineHeight = currentHeight
      return
    }
    if (currentHeight >= baselineHeight - VIEWPORT_CLOSE_THRESHOLD) {
      keyboardExpected = false
      setKeyboardOpen(false)
      return
    }
    scheduleReveal()
  }

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  window.addEventListener('resize', onViewportResize)
  viewport?.addEventListener('resize', onViewportResize)

  return () => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    window.removeEventListener('resize', onViewportResize)
    viewport?.removeEventListener('resize', onViewportResize)
    timers.forEach(timer => window.clearTimeout(timer))
    setKeyboardOpen(false)
  }
}
