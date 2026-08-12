/** 前端页面共享的导航、图标和配对提示组件。 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject, type TouchEvent } from 'react'
import type { Icon, InventoryBatch, RecipeIngredient, Refrigerator } from './appTypes'
import { SAFE_SWIPE_START_MAX_RATIO, SAFE_SWIPE_START_MIN_X, shouldTriggerSafeSwipeBack } from './edgeSwipeBack'
import { getRecipeIngredientIcon } from './recipeAction'
import { consumePageEnterTransition, getPageEnterClass, PAGE_TRANSITION_DURATION_MS, requestPageEnterTransition } from './pageTransition'
import { getHorizontalSwipeDirection, type HorizontalSwipeDirection } from './swipeGesture'
import { parseQuantity } from './quantity'

export type RefreshState = 'idle' | 'loading' | 'error'

export function PageShell({ className = '', header, bodyClassName = '', footer, children, onRefresh, refreshState = 'idle' }: {
  className?: string
  header: ReactNode
  bodyClassName?: string
  footer?: ReactNode
  children: ReactNode
  onRefresh?: () => void | Promise<void>
  refreshState?: RefreshState
}) {
  const [pageEnterClass] = useState(() => getPageEnterClass(consumePageEnterTransition()))
  return <main className={`mobile-page ${pageEnterClass} ${className}`.trim()}>
    {header}
    {onRefresh ? <PullToRefresh className={bodyClassName} onRefresh={onRefresh} refreshing={refreshState === 'loading'}>{children}</PullToRefresh> : <div className={`mobile-page-body ${bodyClassName}`.trim()}>{children}</div>}
    {footer}
  </main>
}

export function AppHeader({ left, right, title = '家常食橱' }: { left?: ReactNode; right?: ReactNode; title?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="app-header-title">{title}</span><span className="header-slot header-right">{right}</span></header>
}

export function HeaderTitle({ title, refreshState = 'idle', refreshError = '' }: { title: ReactNode; refreshState?: RefreshState; refreshError?: string }) {
  const [open, setOpen] = useState(false)
  return <span className="header-title-with-status"><span>{title}</span>{refreshState === 'error' && <><button className="header-refresh-warning" type="button" onClick={() => setOpen(true)} aria-label="查看刷新错误">!</button>{open && <NoticeDialog title="刷新失败" message={refreshError || '数据刷新失败，请下拉页面重试。'} onClose={() => setOpen(false)} />}</>}</span>
}

export function SaveIcon() {
  return <svg className="save-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 9a3 3 0 0 1 3-3h25.281L42 13.207V39a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" /><path d="M24.008 6 24 13.385c0 .34-.448.615-1 .615h-8c-.552 0-1-.275-1-.615V6" /><path d="M9 6h25.281M14 26h20m-20 8h10.008" /></svg>
}

/** 横向 `[-数字+]` 控件；库存、购物清单和编辑食谱食材统一使用此控件。 */
export function QuantityStepper({ value, min = 0, onChange, onBlur, onIncrement, onDecrement, disabled = false, ariaLabel, className = '', children }: {
  value: string
  min?: number
  onChange: (value: string) => void
  onBlur?: () => void
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
  ariaLabel: string
  className?: string
  children?: ReactNode
}) {
  return <span className={`p5-quantity-control ${className}`.trim()}>
    <button type="button" onClick={onDecrement} disabled={disabled || value === '' || parseQuantity(value) === null || Number(value) <= min} aria-label={`减少 ${ariaLabel}`}>−</button>
    <input className="p5-food-quantity-input" type="text" min={min} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} aria-label={ariaLabel} aria-invalid={value !== '' && (parseQuantity(value) === null || Number(value) < min)} />
    <button type="button" onClick={onIncrement} disabled={disabled} aria-label={`增加 ${ariaLabel}`}>+</button>
    {children}
  </span>
}

/** 仅用于“添加物品”页的纵向上下箭头数量控件，不与横向步进框互换。 */
export function QuantityArrowControl({ value, min = 0, onChange, onBlur, onIncrement, onDecrement, disabled = false, ariaLabel }: {
  value: string
  min?: number
  onChange: (value: string) => void
  onBlur?: () => void
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return <span className="p5-quantity-arrows">
    <button type="button" onClick={onIncrement} disabled={disabled} aria-label={`增加 ${ariaLabel}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
    <input className="p5-food-quantity-input" type="text" min={min} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} aria-label={ariaLabel} aria-invalid={value !== '' && (parseQuantity(value) === null || Number(value) < min)} />
    <button type="button" onClick={onDecrement} disabled={disabled || value === '' || parseQuantity(value) === null || Number(value) <= min} aria-label={`减少 ${ariaLabel}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
  </span>
}

export function PageHeader({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  const headerRef = useRef<HTMLElement | null>(null)
  const exitStarted = useRef(false)
  useEffect(() => {
    exitStarted.current = false
  }, [title])
  const navigateBack = useCallback(() => {
    if (!onBack || exitStarted.current) return
    const page = headerRef.current?.closest('.mobile-page')
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!page || reducedMotion) { onBack(); return }
    exitStarted.current = true
    page.classList.add('page-exit-to-right')
    requestPageEnterTransition('back')
    window.setTimeout(onBack, PAGE_TRANSITION_DURATION_MS)
  }, [onBack])
  useEdgeSwipeBack(onBack ? navigateBack : undefined, headerRef)
  return <header ref={headerRef} className="page-header"><span className="header-slot">{onBack && <button className="header-button" onClick={navigateBack} aria-label="返回">‹</button>}</span><h1>{title}</h1><span className="header-slot header-right">{right}</span></header>
}

/** 为带返回按钮的页面安装安全区域右滑监听，并过滤控件点击和纵向滚动。 */
function useEdgeSwipeBack(onBack: (() => void) | undefined, headerRef: RefObject<HTMLElement | null>) {
  const backRef = useRef(onBack)
  useEffect(() => {
    backRef.current = onBack
  }, [onBack])
  useEffect(() => {
    if (!onBack) return
    const page = headerRef.current?.closest('.mobile-page')
    page?.classList.add('edge-swipe-back-enabled')
    let start: { x: number; y: number } | null = null
    let horizontalIntent = false
    let suppressClickUntil = 0
    const onTouchStart = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch || isFormTouchTarget(event.target) || touch.clientX < SAFE_SWIPE_START_MIN_X || touch.clientX > window.innerWidth * SAFE_SWIPE_START_MAX_RATIO) {
        start = null
        return
      }
      start = { x: touch.clientX, y: touch.clientY }
      horizontalIntent = false
    }
    const onTouchMove = (event: globalThis.TouchEvent) => {
      if (!start || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (!touch) return
      const deltaX = touch.clientX - start.x
      const deltaY = Math.abs(touch.clientY - start.y)
      if (deltaX < 0 || (deltaY > 24 && deltaY > deltaX)) {
        start = null
        return
      }
      if (deltaX > 8 && deltaX > deltaY * 1.1) {
        horizontalIntent = true
        if (event.cancelable) event.preventDefault()
      }
    }
    const onTouchEnd = (event: globalThis.TouchEvent) => {
      if (!start) return
      const touch = event.changedTouches[0]
      const shouldGoBack = touch && horizontalIntent && shouldTriggerSafeSwipeBack(start.x, start.y, touch.clientX, touch.clientY, window.innerWidth)
      start = null
      horizontalIntent = false
      if (shouldGoBack) {
        suppressClickUntil = Date.now() + 500
        backRef.current?.()
      }
    }
    const onTouchCancel = () => {
      start = null
      horizontalIntent = false
    }
    const onClick = (event: MouseEvent) => {
      if (Date.now() > suppressClickUntil) return
      event.preventDefault()
      event.stopPropagation()
      suppressClickUntil = 0
    }
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    window.addEventListener('touchend', onTouchEnd, { capture: true, passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true })
    window.addEventListener('click', onClick, true)
    return () => {
      page?.classList.remove('edge-swipe-back-enabled')
      window.removeEventListener('touchstart', onTouchStart, true)
      window.removeEventListener('touchmove', onTouchMove, true)
      window.removeEventListener('touchend', onTouchEnd, true)
      window.removeEventListener('touchcancel', onTouchCancel, true)
      window.removeEventListener('click', onClick, true)
    }
  }, [headerRef, onBack])
}

function isFormTouchTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

/** 在保留纵向滚动的容器内识别左右横扫，并阻止横扫结束后误触子控件。 */
export function HorizontalSwipeArea({ className = '', ariaLabel, onSwipe, children }: {
  className?: string
  ariaLabel: string
  onSwipe: (direction: HorizontalSwipeDirection) => void
  children: ReactNode
}) {
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
  return <section className={`horizontal-swipe-area ${className}`.trim()} aria-label={ariaLabel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={reset} onClickCapture={event => {
    if (Date.now() > suppressClickUntil.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickUntil.current = 0
  }}>{children}</section>
}

export type DialogProps = {
  title: string
  children: ReactNode
  onClose?: () => void
  closeLabel?: string
  closeDisabled?: boolean
  className?: string
  dialogClassName?: string
  role?: 'dialog' | 'status'
  ariaLive?: 'polite' | 'assertive'
}

/**
 * 手机端共享居中模态框基础组件。
 *
 * 页面通过 className 扩展遮罩层、通过 dialogClassName 扩展内容面；标题、关闭热区、
 * 安全区和可滚动内容面由组件统一提供。复杂流程应使用 PageShell，而不是嵌套在此组件中。
 */
export function Dialog({ title, children, onClose, closeLabel = '关闭弹窗', closeDisabled = false, className = '', dialogClassName = '', role = 'dialog', ariaLive }: DialogProps) {
  const titleId = useId()
  const modalClassName = ['modal-backdrop', className].filter(Boolean).join(' ')
  const contentClassName = ['modal-dialog', dialogClassName].filter(Boolean).join(' ')
  return <div className={modalClassName}>
    <section className={contentClassName} role={role} {...(role === 'dialog' ? { 'aria-modal': true } : {})} aria-labelledby={titleId} aria-live={ariaLive}>
      <div className={`modal-dialog-header${onClose ? ' has-close' : ''}`}>
        <h2 id={titleId}>{title}</h2>
        {onClose && <button className="modal-close" type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel}>×</button>}
      </div>
      <div className="modal-dialog-body">{children}</div>
    </section>
  </div>
}

/** 统一呈现需要用户知晓的流程错误或通知。 */
export function NoticeDialog({ title, message, onClose }: { title: string; message: ReactNode; onClose: () => void }) {
  return <Dialog title={title} onClose={onClose} closeLabel="关闭通知">
    {typeof message === 'string' ? <p>{message}</p> : message}
    <div className="modal-actions"><button className="modal-secondary" type="button" onClick={onClose}>知道了</button></div>
  </Dialog>
}

/** 统一呈现需要用户在两个明确操作之间做选择的确认弹窗。 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = '取消', onConfirm, onCancel }: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return <Dialog title={title}>
    {typeof message === 'string' ? <p>{message}</p> : message}
    <div className="modal-actions"><button className="modal-primary" type="button" onClick={onConfirm}>{confirmLabel}</button><button className="modal-secondary" type="button" onClick={onCancel}>{cancelLabel}</button></div>
  </Dialog>
}

/** 三个顶级页面共用的移动端下拉刷新容器；只在滚动到顶部后响应向下拖动。 */
export function PullToRefresh({ className = '', onRefresh, refreshing = false, children }: { className?: string; onRefresh?: () => void | Promise<void>; refreshing?: boolean; children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const [distance, setDistance] = useState(0)
  const threshold = 64
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!onRefresh || refreshing || (containerRef.current?.scrollTop ?? 0) > 0) return
    startY.current = event.touches[0]?.clientY ?? null
  }
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startY.current === null || !containerRef.current || containerRef.current.scrollTop > 0) return
    const touch = event.touches[0]
    if (!touch) return
    const delta = touch.clientY - startY.current
    if (delta <= 0) { setDistance(0); return }
    if (delta >= threshold && event.cancelable) event.preventDefault()
    setDistance(Math.min(96, delta * 0.55))
  }
  const onTouchEnd = () => {
    const shouldRefresh = distance >= threshold * 0.55
    startY.current = null
    setDistance(0)
    if (shouldRefresh && onRefresh) void Promise.resolve(onRefresh()).catch(() => undefined)
  }
  const indicatorHeight = refreshing ? 40 : distance
  return <div ref={containerRef} className={`mobile-page-body pull-refresh-container ${className}`.trim()} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
    <div className="pull-refresh-indicator" style={{ height: indicatorHeight }} aria-live="polite">{refreshing ? <span className="header-refresh-spinner" aria-label="正在刷新" /> : distance >= threshold * 0.55 ? '松开刷新' : distance > 0 ? '下拉刷新' : ''}</div>
    {children}
  </div>
}

export function PairingSuccess({ refrigerator }: { refrigerator: Refrigerator }) {
  return <PageShell className="pair-success" header={<AppHeader />} bodyClassName="success-center">
      <div className="connection-art" aria-hidden="true"><span className="art-fridge" /><span className="art-link">✓</span><span className="art-phone" /></div>
      <h1>已连接到家常食橱</h1><p>这台手机现在可以管理冰箱。</p>
      <div className="fridge-identity"><span className="mini-fridge" /><span><strong>{refrigerator.name}</strong><small>智能存储单元</small></span><b>已同步</b></div>
      <p className="transition-note">正在打开食材…</p>
  </PageShell>
}

export function InstallationGuide() {
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return <PageShell className="install-guide" header={<AppHeader />} bodyClassName="install-content"><h1>请先安装到手机</h1><p>首次连接需要在家常食橱应用内扫码。安装完成后，打开应用并再次扫描冰箱端二维码。</p>
      <h2>{apple ? '在 Safari 中安装' : '在浏览器中安装'}</h2>
      <ol className="install-steps">{apple ? <><li><b>1</b><span>点击 Safari 底部的<strong>分享</strong>按钮。</span></li><li><b>2</b><span>在菜单中选择<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>从主屏幕打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></> : <><li><b>1</b><span>打开浏览器菜单。</span></li><li><b>2</b><span>选择<strong>安装并创建快捷方式</strong>或<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></>}</ol>
  </PageShell>
}

function NavigationIcon({ name }: { name: 'home' | 'recipes' | 'shopping' | 'me' }) {
  const common = { className: 'p7-nav-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'home') return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>
  if (name === 'recipes') return <svg {...common}><g transform="translate(0 3)"><path d="M6 10.5a3.5 3.5 0 0 1 .6-6.9 5 5 0 0 1 10.8 0A3.5 3.5 0 1 1 18 10.5" /><path d="M6 10.5h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M8 20.5h8" /></g></svg>
  if (name === 'shopping') return <svg {...common}><path d="M3 4h2l2.2 11h10.6l3-8H6.1" /><circle cx="9" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
}

export function P7Navigation({ active, onHome, onRecipes, onShopping, onMe }: { active: 'home' | 'recipes' | 'shopping' | 'me'; onHome: () => void; onRecipes?: () => void; onShopping: () => void; onMe: () => void }) {
  return <nav className="p7-nav" aria-label="主导航"><button className={active === 'home' ? 'is-active' : ''} onClick={onHome}><NavigationIcon name="home" /><small>首页</small></button><button className={active === 'recipes' ? 'is-active' : ''} onClick={onRecipes} disabled={!onRecipes}><NavigationIcon name="recipes" /><small>食谱</small></button><button className={active === 'shopping' ? 'is-active' : ''} onClick={onShopping}><NavigationIcon name="shopping" /><small>购物</small></button><button className={active === 'me' ? 'is-active' : ''} onClick={onMe}><NavigationIcon name="me" /><small>我的</small></button></nav>
}

export function RecipeCompletionIcon({ completed }: { completed: boolean }) {
  const clipPrefix = useId().replaceAll(':', '')
  return <span className={`p9-completion-icon ${completed ? 'is-complete' : ''}`}><svg viewBox="0 0 256 256" aria-hidden="true">{completed ? <path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /> : <><defs><clipPath id={`${clipPrefix}-body`} clipPathUnits="userSpaceOnUse"><rect x="0" y="72" width="256" height="184" /></clipPath></defs><g clipPath={`url(#${clipPrefix}-body)`}><path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /></g><svg x="0" y="-12" width="256" height="256" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16" /><path d="M9 6l.623-2.057A1.5 1.5 0 0 1 11.016 3h1.969a1.5 1.5 0 0 1 1.392 0.943L15 6" /></svg></>}</svg></span>
}

export function RecipeIngredientList({ ingredients, inventory, icons, missing = [], className = '' }: { ingredients: RecipeIngredient[]; inventory: Pick<InventoryBatch, 'item_name' | 'icon_key'>[]; icons: Icon[]; missing?: RecipeIngredient[]; className?: string }) {
  const missingByName = missing.reduce((quantities, ingredient) => {
    quantities.set(ingredient.subcategory_name, (quantities.get(ingredient.subcategory_name) ?? 0) + ingredient.quantity)
    return quantities
  }, new Map<string, number>())
  const orderedIngredients = [
    ...ingredients.filter(ingredient => (missingByName.get(ingredient.subcategory_name) ?? 0) > 0),
    ...ingredients.filter(ingredient => (missingByName.get(ingredient.subcategory_name) ?? 0) <= 0),
  ]
  return <span className={`p9-ingredient-list ${className}`}>{orderedIngredients.map((ingredient, index) => {
    const icon = getRecipeIngredientIcon(ingredient.subcategory_name, inventory, icons)
    const missingQuantity = missingByName.get(ingredient.subcategory_name) ?? 0
    const quantityLabel = ingredient.quantity > 1 ? `×${ingredient.quantity}` : ''
    return <span className={`p9-ingredient-chip ${missingQuantity > 0 ? 'is-missing' : ''}`} key={`${ingredient.subcategory_name}-${index}`}>{icon && <img src={icon.asset_url} alt="" />}<span>{ingredient.subcategory_name}{quantityLabel}{missingQuantity > 0 ? `-${missingQuantity}` : ''}</span></span>
  })}</span>
}

export function CategoryIcon({ iconKey, icons }: { iconKey: string | null; icons: Icon[]; label?: string }) {
  const icon = icons.find(item => item.key === iconKey) ?? icons[0]
  return icon ? <img className="food-icon" src={icon.asset_url} alt="" /> : <span className="food-icon-fallback" aria-hidden="true">●</span>
}
