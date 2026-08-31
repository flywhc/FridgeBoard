/** 前端页面共享的导航、图标和配对提示组件。 */
import { useCallback, useEffect, useId, useRef, useState, type AnimationEvent, type ReactNode, type RefObject, type TouchEvent } from 'react'
import type { Category, Icon, InventoryBatch, RecipeIngredient, Refrigerator } from './appTypes'
import { fetchRuntimeAsset } from './appApi'
import { SAFE_SWIPE_START_MAX_RATIO, SAFE_SWIPE_START_MIN_X, shouldTriggerSafeSwipeBack } from './edgeSwipeBack'
import { getRecipeIngredientIcon } from './recipeAction'
import type { HorizontalSwipeDirection } from './swipeGesture'
import { parseQuantity } from './quantity'
import { appRuntime, resolveRuntimeUrl } from './runtime'
import { getCachedRuntimeAssetUrl, getRuntimeAssetUrl } from './runtimeAssetCache'
import { getNetworkStatus, subscribeNativeBack, subscribeNetworkStatus } from './nativeBridge'
import { resolveIconVariant } from './iconVariants'
import { useTheme } from './theme'
import { useHorizontalSwipeHandlers } from './horizontalSwipe'
import { PageStackActiveContext, usePageStackActive, type PageStackTransition } from './pageStack'

export type RefreshState = 'idle' | 'loading' | 'error'

export type PageStackPage = {
  id: number
  element: ReactNode
}

/**
 * 保持应用内页面栈的各层挂载，并只把当前层暴露给用户交互。
 *
 * 页面出栈期间，上层和下层同时存在，转场不会露出应用根背景；页面组件
 * 的本地表单、滚动位置和流程状态也会随栈层保留。
 */
export function PageStack({ pages, transition }: { pages: PageStackPage[]; transition: PageStackTransition | null }) {
  return <div className="page-stack">
    {pages.map((page, index) => {
      const active = index === pages.length - 1
      const isTransitionPage = transition?.pageId === page.id
      const isIncomingPage = transition?.incomingPageId === page.id
      const transitionClass = transition?.type === 'push' && isTransitionPage && transition.incomingAnimation === 'from-right'
        ? 'page-stack-enter-from-right'
        : transition?.type === 'pop' && isTransitionPage
          ? 'page-stack-exit-to-right'
          : transition?.type === 'pop' && isIncomingPage && transition.incomingAnimation !== 'none'
            ? 'page-stack-enter-from-left'
            : ''
      const completeTransition = (event: AnimationEvent<HTMLDivElement>) => {
        if (event.currentTarget !== event.target || !event.animationName.startsWith('page-stack-')) return
        transition?.complete?.(page.id)
      }
      // 入场页在动画完成前必须保持 inert，避免自动聚焦离屏控件并水平滚动整个文档。
      const interactive = active && !isTransitionPage
      return <div key={page.id} className={`page-stack-layer ${active ? 'is-active' : 'is-underlay'} ${transitionClass}`.trim()} inert={!interactive} onAnimationEnd={isTransitionPage ? completeTransition : undefined}>
        <PageStackActivityProvider active={interactive}>{page.element}</PageStackActivityProvider>
      </div>
    })}
  </div>
}

function PageStackActivityProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = usePageStackActive()
  return <PageStackActiveContext.Provider value={parentActive && active}>{children}</PageStackActiveContext.Provider>
}


export function PageShell({ className = '', header, bodyClassName = '', footer, children, onRefresh, refreshState = 'idle' }: {
  className?: string
  header: ReactNode
  bodyClassName?: string
  footer?: ReactNode
  children: ReactNode
  onRefresh?: () => void | Promise<void>
  refreshState?: RefreshState
}) {
  return <main className={`mobile-page ${className}`.trim()}>
    <SkeuomorphicFilterDefs />
    <NetworkStatusNotice />
    {header}
    {onRefresh ? <PullToRefresh className={bodyClassName} onRefresh={onRefresh} refreshing={refreshState === 'loading'}>{children}</PullToRefresh> : <div className={`mobile-page-body ${bodyClassName}`.trim()}>{children}</div>}
    {footer}
  </main>
}

function SkeuomorphicFilterDefs() {
  return <svg className="skeuomorphic-filter-defs" aria-hidden="true" focusable="false"><defs>
    <filter id="skeuomorphic-emboss" x="-65%" y="-65%" width="250%" height="260%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".62" result="height-map" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.65" result="shadow-blur" />
      <feOffset in="shadow-blur" dx="1.8" dy="3" result="shadow-offset" />
      <feFlood floodColor="#A88F76" floodOpacity=".38" result="shadow-color" />
      <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="contact-shadow" />
      <feDiffuseLighting in="height-map" surfaceScale="4.1" diffuseConstant=".9" lightingColor="#FFF0D7" result="diffuse-light">
        <feDistantLight azimuth="225" elevation="42" />
      </feDiffuseLighting>
      <feComposite in="diffuse-light" in2="SourceAlpha" operator="in" result="diffuse-mask" />
      <feComponentTransfer in="diffuse-mask" result="diffuse-tone">
        <feFuncR type="linear" slope=".34" intercept=".68" />
        <feFuncG type="linear" slope=".34" intercept=".68" />
        <feFuncB type="linear" slope=".34" intercept=".68" />
        <feFuncA type="table" tableValues="0 1" />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="diffuse-tone" mode="multiply" result="diffuse-face" />
      <feSpecularLighting in="height-map" surfaceScale="4.5" specularConstant=".5" specularExponent="16" lightingColor="#FFF5E6" result="specular-light">
        <feDistantLight azimuth="225" elevation="42" />
      </feSpecularLighting>
      <feComposite in="specular-light" in2="SourceAlpha" operator="in" result="specular-mask" />
      <feBlend in="diffuse-face" in2="specular-mask" mode="screen" result="lit-face" />
      <feMerge><feMergeNode in="contact-shadow" /><feMergeNode in="lit-face" /></feMerge>
    </filter>
    <filter id="skeuomorphic-nav-emboss" x="-65%" y="-65%" width="250%" height="260%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".62" result="height-map" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.65" result="shadow-blur" />
      <feOffset in="shadow-blur" dx="1.8" dy="3" result="shadow-offset" />
      <feFlood floodColor="#A88F76" floodOpacity=".38" result="shadow-color" />
      <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="contact-shadow" />
      <feDiffuseLighting in="height-map" surfaceScale="4.1" diffuseConstant=".9" lightingColor="#FFF0D7" result="diffuse-light">
        <feDistantLight azimuth="225" elevation="42" />
      </feDiffuseLighting>
      <feComposite in="diffuse-light" in2="SourceAlpha" operator="in" result="diffuse-mask" />
      <feComponentTransfer in="diffuse-mask" result="diffuse-tone">
        <feFuncR type="linear" slope=".34" intercept=".68" />
        <feFuncG type="linear" slope=".34" intercept=".68" />
        <feFuncB type="linear" slope=".34" intercept=".68" />
        <feFuncA type="table" tableValues="0 1" />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="diffuse-tone" mode="multiply" result="diffuse-face" />
      <feMerge><feMergeNode in="contact-shadow" /><feMergeNode in="diffuse-face" /></feMerge>
    </filter>
  </defs></svg>
}

function NetworkStatusNotice() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const pageActive = usePageStackActive()
  useEffect(() => {
    if (!pageActive) return undefined
    let active = true
    void getNetworkStatus().then(status => {
      if (active) setConnected(status.connected)
    }).catch(() => undefined)
    const cleanup = subscribeNetworkStatus(status => {
      if (active) setConnected(status.connected)
    })
    return () => {
      active = false
      cleanup()
    }
  }, [pageActive])
  if (!pageActive || connected !== false) return null
  return <p className="network-status-notice" role="status">当前处于离线状态，已缓存内容仍可查看；网络恢复后会自动重试。</p>
}

export function AppHeader({ left, right, title = '家常食橱' }: { left?: ReactNode; right?: ReactNode; title?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="app-header-title shared-header-title-text"><span className="shared-header-title-content">{title}</span></span><span className="header-slot header-right">{right}</span></header>
}

export function HeaderTitle({ title, refreshState = 'idle', refreshError = '', onTitleClick }: { title: ReactNode; refreshState?: RefreshState; refreshError?: string; onTitleClick?: () => void }) {
  const [open, setOpen] = useState(false)
  const titleContent = onTitleClick
    ? <button className="header-title-trigger" type="button" onClick={onTitleClick} aria-label="打开我的冰箱"><span>{title}</span><svg className="header-title-chevron" data-icon="lucide:chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    : <span>{title}</span>
  return <span className="header-title-with-status">{titleContent}{refreshState === 'error' && <><button className="header-refresh-warning" type="button" onClick={() => setOpen(true)} aria-label="查看刷新错误">!</button>{open && <NoticeDialog title="刷新失败" message={refreshError || '数据刷新失败，请下拉页面重试。'} onClose={() => setOpen(false)} />}</>}</span>
}

export function SaveIcon() {
  return <svg className="save-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 9a3 3 0 0 1 3-3h25.281L42 13.207V39a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" /><path d="M24.008 6 24 13.385c0 .34-.448.615-1 .615h-8c-.552 0-1-.275-1-.615V6" /><path d="M9 6h25.281M14 26h20m-20 8h10.008" /></svg>
}

export type PickerOption = { value: string; label: string }

/** 使用应用内弹窗呈现有限选项，避免 Android WebView 原生选择弹层重绘底层页面。 */
export function OptionPickerField({ label, value, options, onChange, disabled = false, className = '' }: {
  label: string
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)
  return <>
    <label className={`p9-option-picker-field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      <button className="p9-option-picker-input" type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span>{selected?.label ?? value}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </label>
    {open && <Dialog title={label} onClose={() => setOpen(false)} closeLabel={`关闭${label}选择`} dialogClassName="p9-option-picker-dialog">
      <div className="p9-option-picker-options" role="listbox" aria-label={label}>
        {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'is-selected' : ''} onClick={() => { onChange(option.value); setOpen(false) }}>
          <span>{option.label}</span>
          {option.value === value && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
        </button>)}
      </div>
    </Dialog>}
  </>
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
  const active = usePageStackActive()
  const navigateBack = useCallback(() => {
    if (!onBack || !active) return
    onBack()
  }, [active, onBack])
  useEffect(() => {
    if (!onBack || !active) return undefined
    return subscribeNativeBack(navigateBack)
  }, [active, navigateBack, onBack])
  useEdgeSwipeBack(onBack && active ? navigateBack : undefined, headerRef)
  return <header ref={headerRef} className="page-header"><span className="header-slot">{onBack && <button className="header-button" onClick={navigateBack} aria-label="返回"><span className="header-button-glyph" aria-hidden="true">‹</span></button>}</span><h1 className="shared-header-title-text"><span className="shared-header-title-content">{title}</span></h1><span className="header-slot header-right">{right}</span></header>
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
      if (event.touches.length !== 1 || !touch || isEdgeSwipeIgnoredTarget(event.target) || touch.clientX < SAFE_SWIPE_START_MIN_X || touch.clientX > window.innerWidth * SAFE_SWIPE_START_MAX_RATIO) {
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

function isEdgeSwipeIgnoredTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-edge-swipe-ignore="true"]'))
}

/** 在保留纵向滚动的容器内识别左右横扫，并阻止横扫结束后误触子控件。 */
export function HorizontalSwipeArea({ className = '', ariaLabel, onSwipe, children }: {
  className?: string
  ariaLabel: string
  onSwipe: (direction: HorizontalSwipeDirection) => void
  children: ReactNode
}) {
  const handlers = useHorizontalSwipeHandlers(onSwipe)
  return <section className={`horizontal-swipe-area ${className}`.trim()} aria-label={ariaLabel} {...handlers}>{children}</section>
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
        {onClose && <button className="modal-close" type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel}><span className="header-button-glyph" aria-hidden="true">×</span></button>}
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
    if (event.target instanceof Element && event.target.closest('[data-pull-refresh-ignore="true"]')) {
      startY.current = null
      setDistance(0)
      return
    }
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

const NAV_ICON_DATA = {
  recipes: { dataIcon: 'fluent:spatula-spoon-32-regular', viewBox: '0 0 32 32', path: 'M10.172 4.586a2 2 0 0 0-2.829 0L3.586 8.343a2 2 0 0 0 0 2.829l3.242 3.242a2 2 0 0 0 1.414.585H12c.462 0 1.009.164 1.4.617l10.21 11.82a2 2 0 0 0 2.828-2.827l-11.821-10.21c-.453-.391-.617-.938-.617-1.4V9.243a2 2 0 0 0-.585-1.414zM5.929 3.172a4 4 0 0 1 5.657 0l3.242 3.242A4 4 0 0 1 16 9.242v3.71l.099.085l1.15-1.046c.237-.216.4-.604.425-1.131c.06-1.302.47-2.705 1.023-3.94c.55-1.231 1.284-2.385 2.061-3.163a6 6 0 0 1 8.485 8.486c-.777.777-1.931 1.51-3.163 2.061c-1.235.553-2.638.962-3.94 1.023c-.528.024-.915.188-1.131.425l-.778.854l7.571 6.54l.026.025a4 4 0 0 1-5.657 5.657l-.026-.026l-6.336-7.336l-6.802 7.475l-.032.034a3.5 3.5 0 1 1-4.916-4.982L11.744 17H8.242a4 4 0 0 1-2.828-1.172l-3.242-3.242a4 4 0 0 1 0-5.657zm12.788 12.127l.812-.893c.701-.77 1.685-1.038 2.518-1.077c.981-.046 2.134-.366 3.216-.85c1.086-.486 2.012-1.096 2.566-1.65a4 4 0 1 0-5.657-5.657c-.554.554-1.164 1.48-1.65 2.565c-.484 1.082-.804 2.235-.85 3.216c-.04.833-.307 1.816-1.077 2.517l-.972.884zm-5.549 3.109l-7.743 7.046a1.5 1.5 0 0 0 2.121 2.121l6.946-7.634zM9.708 6.293a1 1 0 0 0-1.415 1.414l2.25 2.25a1 1 0 0 0 1.414-1.414zm-4.415 3a1 1 0 0 1 1.414 0l2.25 2.25a1 1 0 1 1-1.414 1.414l-2.25-2.25a1 1 0 0 1 0-1.414M23 9a1 1 0 1 0-2 0a3 3 0 0 0 3 3a1 1 0 1 0 0-2a1 1 0 0 1-1-1' },
  shopping: { dataIcon: 'material-symbols:shopping-cart-outline', viewBox: '0 0 24 24', path: 'M5.588 21.413Q5 20.825 5 20t.588-1.412T7 18t1.413.588T9 20t-.587 1.413T7 22t-1.412-.587m10 0Q15 20.825 15 20t.588-1.412T17 18t1.413.588T19 20t-.587 1.413T17 22t-1.412-.587M6.15 6l2.4 5h7l2.75-5zM5.2 4h14.75q.575 0 .875.513t.025 1.037l-3.55 6.4q-.275.5-.737.775T15.55 13H8.1L7 15h12v2H7q-1.125 0-1.7-.987t-.05-1.963L6.6 11.6L3 4H1V2h3.25zm3.35 7h7z' },
  me: { dataIcon: 'boxicons:user', viewBox: '0 0 24 24', path: 'M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5s-5 2.24-5 5s2.24 5 5 5m0-8c1.65 0 3 1.35 3 3s-1.35 3-3 3s-3-1.35-3-3s1.35-3 3-3M4 22h16c.55 0 1-.45 1-1v-1c0-3.86-3.14-7-7-7h-4c-3.86 0-7 3.14-7 7v1c0 .55.45 1 1 1m6-7h4c2.76 0 5 2.24 5 5H5c0-2.76 2.24-5 5-5' },
} as const

const NAV_ICON_ENCLOSED = {
  home: ['M5.5 9.6 12 4.5l6.5 5.1v9.7H5.5zM9 19.3V14h6v5.3z'],
  recipes: [
    'M6.2 8.2 9 5.4a1.3 1.3 0 0 1 1.8 0l3.2 3.2a1.3 1.3 0 0 1 .4.9v2.4h-2.2a2.3 2.3 0 0 0-1.7.7l-.5.6-3.8-3.4z',
    'M22.2 4.1a4.9 4.9 0 1 1 0 9.8a4.9 4.9 0 0 1 0-9.8z',
    'M14.5 14.8 25.4 24.7a1 1 0 0 1-1.4 1.4L13.1 16.2z',
    'M11.1 17.2 4.5 24.2a1.5 1.5 0 0 0 2.1 2.1l6.9-7.6z',
  ],
  shopping: ['M7.35 6.8h10.7l-2.25 4H9.25z', 'M8.4 15.4h10.4v.8H8.1z'],
  me: ['M12 4a3 3 0 1 1 0 6a3 3 0 0 1 0-6z', 'M5 20a7 7 0 0 1 14 0z'],
} as const

function InkNavigationIcon({ name, visible }: { name: 'home' | 'recipes' | 'shopping' | 'me'; visible: boolean }) {
  const common = { className: 'p7-nav-icon p7-nav-icon--ink', style: { display: visible ? 'block' : 'none' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'home') return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>
  if (name === 'recipes') return <svg {...common}><g transform="translate(0 3)"><path d="M6 10.5a3.5 3.5 0 0 1 .6-6.9 5 5 0 0 1 10.8 0A3.5 3.5 0 1 1 18 10.5" /><path d="M6 10.5h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M8 20.5h8" /></g></svg>
  if (name === 'shopping') return <svg {...common}><path d="M3 4h2l2.2 11h10.6l3-8H6.1" /><circle cx="9" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
}

function NavigationIcon({ name }: { name: 'home' | 'recipes' | 'shopping' | 'me' }) {
  const theme = useTheme()
  const skeuomorphicIconStyle = { display: theme === 'ink' ? 'none' : 'block' }
  const common = { className: 'p7-nav-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'home') return <><InkNavigationIcon name={name} visible={theme === 'ink'} /><svg {...common} className="p7-nav-icon p7-nav-icon--home p7-nav-icon--skeuomorphic" style={skeuomorphicIconStyle}><path className="p7-nav-icon-fill" d={NAV_ICON_ENCLOSED.home[0]} fill="transparent" fillRule="evenodd" stroke="none" /><g className="p7-nav-icon-outline"><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></g></svg></>
  const icon = NAV_ICON_DATA[name]
  return <><InkNavigationIcon name={name} visible={theme === 'ink'} /><svg className="p7-nav-icon p7-nav-icon--filled p7-nav-icon--skeuomorphic" style={skeuomorphicIconStyle} data-icon={icon.dataIcon} viewBox={icon.viewBox} fill="none" aria-hidden="true">
    <g className="p7-nav-icon-fill" fill="transparent" stroke="none">{NAV_ICON_ENCLOSED[name].map(path => <path key={path} d={path} />)}</g>
    <path className="p7-nav-icon-line" d={icon.path} fill="currentColor" stroke="none" />
  </svg></>
}

export function P7Navigation({ active, onHome, onRecipes, onShopping, onMe, notificationCount = 0 }: { active: 'home' | 'recipes' | 'shopping' | 'me'; onHome: () => void; onRecipes?: () => void; onShopping: () => void; onMe: () => void; notificationCount?: number }) {
  const meLabel = notificationCount > 0 ? `我的，有 ${notificationCount} 条通知` : '我的'
  return <nav className="p7-nav" aria-label="主导航"><span className="p7-nav-skin" aria-hidden="true" style={{ display: 'none' }}><img src="/assets/theme/navigation/bottom-left.webp" alt="" /><span className="p7-nav-center" /><img src="/assets/theme/navigation/bottom-right.webp" alt="" /></span><span className="p7-nav-content" style={{ display: 'contents' }}><button className={active === 'home' ? 'is-active' : ''} onClick={onHome}><NavigationIcon name="home" /><small>首页</small></button><button className={active === 'recipes' ? 'is-active' : ''} onClick={onRecipes} disabled={!onRecipes}><NavigationIcon name="recipes" /><small>食谱</small></button><button className={active === 'shopping' ? 'is-active' : ''} onClick={onShopping}><NavigationIcon name="shopping" /><small>购物</small></button><button className={`p7-nav-me ${active === 'me' ? 'is-active' : ''}`} onClick={onMe} aria-label={meLabel}><span className="p7-nav-me-icon"><NavigationIcon name="me" />{notificationCount > 0 && <b className="p7-nav-badge" aria-hidden="true">{notificationCount}</b>}</span><small>我的</small></button></span></nav>
}

export function RecipeCompletionIcon({ completed }: { completed: boolean }) {
  const clipPrefix = useId().replaceAll(':', '')
  return <span className={`p9-completion-icon ${completed ? 'is-complete' : ''}`}><svg viewBox="0 0 256 256" aria-hidden="true">{completed ? <path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /> : <><defs><clipPath id={`${clipPrefix}-body`} clipPathUnits="userSpaceOnUse"><rect x="0" y="72" width="256" height="184" /></clipPath></defs><g clipPath={`url(#${clipPrefix}-body)`}><path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /></g><svg x="0" y="-12" width="256" height="256" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16" /><path d="M9 6l.623-2.057A1.5 1.5 0 0 1 11.016 3h1.969a1.5 1.5 0 0 1 1.392 0.943L15 6" /></svg></>}</svg></span>
}

export function RecipeIngredientList({ ingredients, inventory, icons, categories = [], missing = [], className = '', completed = false }: { ingredients: RecipeIngredient[]; inventory: Pick<InventoryBatch, 'item_name' | 'icon_key'>[]; icons: Icon[]; categories?: Pick<Category, 'id' | 'icon_key'>[]; missing?: RecipeIngredient[]; className?: string; completed?: boolean }) {
  const theme = useTheme()
  const missingByName = missing.reduce((quantities, ingredient) => {
    quantities.set(ingredient.subcategory_name, (quantities.get(ingredient.subcategory_name) ?? 0) + ingredient.quantity)
    return quantities
  }, new Map<string, number>())
  const orderedIngredients = [
    ...ingredients.filter(ingredient => (missingByName.get(ingredient.subcategory_name) ?? 0) > 0),
    ...ingredients.filter(ingredient => (missingByName.get(ingredient.subcategory_name) ?? 0) <= 0),
  ]
  return <span className={`p9-ingredient-list${completed ? ' is-complete' : ''}${className ? ` ${className}` : ''}`}>{orderedIngredients.map((ingredient, index) => {
    const categoryIconKey = ingredient.subcategory_id ? categories.find(category => category.id === ingredient.subcategory_id)?.icon_key : null
    const icon = icons.find(candidate => candidate.key === categoryIconKey) ?? getRecipeIngredientIcon(ingredient.subcategory_name, inventory, icons)
    const resolved = icon ? resolveIconVariant(icon, theme) : null
    const missingQuantity = missingByName.get(ingredient.subcategory_name) ?? 0
    const quantityLabel = ingredient.quantity > 1 ? `×${ingredient.quantity}` : ''
    return <span className={`p9-ingredient-chip${missingQuantity > 0 ? ' is-missing' : ''}`} key={`${ingredient.subcategory_name}-${index}`}>{resolved && <RuntimeImage src={resolved.assetUrl} alt="" />}<span>{ingredient.subcategory_name}{quantityLabel}{missingQuantity > 0 ? `-${missingQuantity}` : ''}</span></span>
  })}</span>
}

export function RuntimeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const initialObjectUrl = appRuntime.kind === 'capacitor' ? getRuntimeAssetUrl(src) : null
  const [loadedAsset, setLoadedAsset] = useState<{ source: string; objectUrl: string } | null>(() => (
    initialObjectUrl ? { source: src, objectUrl: initialObjectUrl } : null
  ))
  const [imageState, setImageState] = useState<{ source: string; loaded: boolean } | null>(() => (
    initialObjectUrl ? { source: src, loaded: true } : null
  ))

  useEffect(() => {
    if (appRuntime.kind !== 'capacitor') return
    let active = true
    void getCachedRuntimeAssetUrl(src, () => fetchRuntimeAsset(src)).then(objectUrl => {
      if (active) setLoadedAsset({ source: src, objectUrl })
    }).catch(() => undefined)
    return () => { active = false }
  }, [src])

  const imageSrc = appRuntime.kind === 'capacitor'
    ? loadedAsset?.source === src ? loadedAsset.objectUrl : undefined
    : resolveRuntimeUrl(src)
  const imageLoaded = imageState?.source === src && imageState.loaded
  const loading = !imageSrc || !imageLoaded
  return <span className={`runtime-image-shell${className ? ` ${className}` : ''}${loading ? ' is-loading' : ''}`} aria-busy={loading}>
    {loading && <span className="runtime-image-placeholder" aria-hidden="true"><span className="p5-loading-ring" /></span>}
    {imageSrc && <img className={className} src={imageSrc} alt={alt} onLoad={() => setImageState({ source: src, loaded: true })} onError={() => setImageState({ source: src, loaded: false })} />}
  </span>
}

export function CategoryIcon({ iconKey, icons }: { iconKey: string | null; icons: Icon[]; label?: string }) {
  const icon = icons.find(item => item.key === iconKey) ?? icons[0]
  const theme = useTheme()
  if (!icon) return <span className="food-icon-fallback" aria-hidden="true">●</span>
  const resolved = resolveIconVariant(icon, theme)
  return <RuntimeImage className="food-icon" src={resolved.assetUrl} alt="" />
}
