/** 前端页面共享的导航、图标和配对提示组件。 */
import type { ReactNode } from 'react'
import type { Icon, RecipeIngredient, Refrigerator } from './appTypes'
import { getRecipeIngredientIcon } from './recipeAction'

export function PageShell({ className = '', header, bodyClassName = '', footer, children }: {
  className?: string
  header: ReactNode
  bodyClassName?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return <main className={`mobile-page ${className}`.trim()}>
    {header}
    <div className={`mobile-page-body ${bodyClassName}`.trim()}>{children}</div>
    {footer}
  </main>
}

export function AppHeader({ left, right, title = '家常食橱' }: { left?: ReactNode; right?: ReactNode; title?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="app-header-title">{title}</span><span className="header-slot header-right">{right}</span></header>
}

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className="page-header"><span className="header-slot">{onBack && <button className="header-button" onClick={onBack} aria-label="返回">‹</button>}</span><h1>{title}</h1><span className="header-slot header-right">{right}</span></header>
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
      <ol className="install-steps">{apple ? <><li><b>1</b><span>点击 Safari 底部的<strong>分享</strong>按钮。</span></li><li><b>2</b><span>在菜单中选择<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>从主屏幕打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></> : <><li><b>1</b><span>打开浏览器菜单。</span></li><li><b>2</b><span>选择<strong>安装应用</strong>或<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></>}</ol>
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
  return <span className={`p9-completion-icon ${completed ? 'is-complete' : ''}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v5M8 3v5M11 3v5" /><path d="M5 8a3 3 0 0 0 6 0M8 11v10" /><path d="M16 3v8c0 2 1 3 3 3V3M19 14v7" /></svg></span>
}

export function RecipeIngredientList({ ingredients, icons, className = '' }: { ingredients: RecipeIngredient[]; icons: Icon[]; className?: string }) {
  return <span className={`p9-ingredient-list ${className}`}>{ingredients.map((ingredient, index) => {
    const icon = getRecipeIngredientIcon(ingredient.subcategory_name, icons)
    return <span className="p9-ingredient-chip" key={`${ingredient.subcategory_name}-${index}`}>{icon && <img src={icon.asset_url} alt="" />}<span>{ingredient.subcategory_name}×{ingredient.quantity}</span></span>
  })}</span>
}

export function CategoryIcon({ iconKey, icons }: { iconKey: string | null; icons: Icon[]; label?: string }) {
  const icon = icons.find(item => item.key === iconKey) ?? icons[0]
  return icon ? <img className="food-icon" src={icon.asset_url} alt="" /> : <span className="food-icon-fallback" aria-hidden="true">●</span>
}
