/** 前端页面共享的导航、图标和配对提示组件。 */
import { useEffect, useId, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import type { Icon, RecipeIngredient, Refrigerator } from './appTypes'
import { shouldTriggerEdgeSwipeBack } from './edgeSwipeBack'
import { getRecipeIngredientIcon } from './recipeAction'

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
  return <main className={`mobile-page ${className}`.trim()}>
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

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  useEdgeSwipeBack(onBack)
  return <header className="page-header"><span className="header-slot">{onBack && <button className="header-button" onClick={onBack} aria-label="返回">‹</button>}</span><h1>{title}</h1><span className="header-slot header-right">{right}</span></header>
}

/** 为带返回按钮的页面安装左边缘右滑监听，并过滤控件点击和纵向滚动。 */
function useEdgeSwipeBack(onBack: (() => void) | undefined) {
  const backRef = useRef(onBack)
  useEffect(() => {
    backRef.current = onBack
  }, [onBack])
  useEffect(() => {
    if (!onBack) return
    let start: { x: number; y: number } | null = null
    let horizontalIntent = false
    const onTouchStart = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch || isInteractiveTouchTarget(event.target) || touch.clientX > 28) {
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
      const shouldGoBack = touch && horizontalIntent && shouldTriggerEdgeSwipeBack(start.x, start.y, touch.clientX, touch.clientY)
      start = null
      horizontalIntent = false
      if (shouldGoBack) backRef.current?.()
    }
    const onTouchCancel = () => {
      start = null
      horizontalIntent = false
    }
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    window.addEventListener('touchend', onTouchEnd, { capture: true, passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart, true)
      window.removeEventListener('touchmove', onTouchMove, true)
      window.removeEventListener('touchend', onTouchEnd, true)
      window.removeEventListener('touchcancel', onTouchCancel, true)
    }
  }, [onBack])
}

function isInteractiveTouchTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, [contenteditable="true"]'))
}

/** 统一呈现需要用户确认的流程错误或通知。 */
export function NoticeDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return <div className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-dialog-title"><section className="notice-dialog"><button className="notice-close" type="button" onClick={onClose} aria-label="关闭通知">×</button><h2 id="notice-dialog-title">{title}</h2><p>{message}</p><button className="notice-action" type="button" onClick={onClose}>知道了</button></section></div>
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

function NavigationIcon({ name }: { name: 'home' | 'recipes' | 'fridge' | 'me' }) {
  const common = { className: 'p7-nav-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'home') return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>
  if (name === 'recipes') return <svg {...common}><g transform="translate(0 3)"><path d="M6 10.5a3.5 3.5 0 0 1 .6-6.9 5 5 0 0 1 10.8 0A3.5 3.5 0 1 1 18 10.5" /><path d="M6 10.5h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M8 20.5h8" /></g></svg>
  if (name === 'fridge') return <svg {...common}><rect x="5" y="2" width="14" height="20" rx="1" /><path d="M5 10h14" /><path d="M8 6v2M8 13v3" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
}

export function P7Navigation({ active, onHome, onRecipes, onFridge, onMe }: { active: 'home' | 'recipes' | 'fridge' | 'me'; onHome: () => void; onRecipes?: () => void; onFridge: () => void; onMe: () => void }) {
  return <nav className="p7-nav" aria-label="主导航"><button className={active === 'home' ? 'is-active' : ''} onClick={onHome}><NavigationIcon name="home" /><small>首页</small></button><button className={active === 'recipes' ? 'is-active' : ''} onClick={onRecipes} disabled={!onRecipes}><NavigationIcon name="recipes" /><small>食谱</small></button><button className={active === 'fridge' ? 'is-active' : ''} onClick={onFridge}><NavigationIcon name="fridge" /><small>冰箱</small></button><button className={active === 'me' ? 'is-active' : ''} onClick={onMe}><NavigationIcon name="me" /><small>我的</small></button></nav>
}

export function RecipeCompletionIcon({ completed }: { completed: boolean }) {
  const clipPrefix = useId().replaceAll(':', '')
  return <span className={`p9-completion-icon ${completed ? 'is-complete' : ''}`}><svg viewBox="0 0 256 256" aria-hidden="true">{completed ? <path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /> : <><defs><clipPath id={`${clipPrefix}-body`} clipPathUnits="userSpaceOnUse"><rect x="0" y="72" width="256" height="184" /></clipPath></defs><g clipPath={`url(#${clipPrefix}-body)`}><path d="M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z" /></g><svg x="0" y="-12" width="256" height="256" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16" /><path d="M9 6l.623-2.057A1.5 1.5 0 0 1 11.016 3h1.969a1.5 1.5 0 0 1 1.392 0.943L15 6" /></svg></>}</svg></span>
}

export function RecipeIngredientList({ ingredients, icons, missing = [], className = '' }: { ingredients: RecipeIngredient[]; icons: Icon[]; missing?: RecipeIngredient[]; className?: string }) {
  const missingByName = missing.reduce((quantities, ingredient) => {
    quantities.set(ingredient.subcategory_name, (quantities.get(ingredient.subcategory_name) ?? 0) + ingredient.quantity)
    return quantities
  }, new Map<string, number>())
  return <span className={`p9-ingredient-list ${className}`}>{ingredients.map((ingredient, index) => {
    const icon = getRecipeIngredientIcon(ingredient.subcategory_name, icons)
    const missingQuantity = missingByName.get(ingredient.subcategory_name) ?? 0
    return <span className={`p9-ingredient-chip ${missingQuantity > 0 ? 'is-missing' : ''}`} key={`${ingredient.subcategory_name}-${index}`}>{icon && <img src={icon.asset_url} alt="" />}<span>{ingredient.subcategory_name}×{ingredient.quantity}{missingQuantity > 0 ? `-${missingQuantity}` : ''}</span></span>
  })}</span>
}

export function CategoryIcon({ iconKey, icons }: { iconKey: string | null; icons: Icon[]; label?: string }) {
  const icon = icons.find(item => item.key === iconKey) ?? icons[0]
  return icon ? <img className="food-icon" src={icon.asset_url} alt="" /> : <span className="food-icon-fallback" aria-hidden="true">●</span>
}
