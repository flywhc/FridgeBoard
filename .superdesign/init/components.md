# Shared UI components

The project uses React with custom JSX components and one global vanilla CSS file. There is no external component library.

## `frontend/src/App.tsx`

### `AppHeader`

Three-column mobile brand bar with fixed 48px side slots.

```tsx
function AppHeader({ left, right, title = '家常食橱' }: { left?: ReactNode; right?: ReactNode; title?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="app-header-title">{title}</span><span className="header-slot header-right">{right}</span></header>
}
```

### `P7Navigation`

Fixed four-item mobile bottom navigation. The active item is controlled by `active`.

```tsx
function P7Navigation({ active, onHome, onRecipes, onFridge, onMe }: { active: string; onHome: () => void; onRecipes?: () => void; onFridge: () => void; onMe: () => void }) {
  return <nav className="p7-nav" aria-label="主导航"><button className={active === 'home' ? 'is-active' : ''} onClick={onHome}><NavigationIcon name="home" /><small>首页</small></button><button className={active === 'recipes' ? 'is-active' : ''} onClick={onRecipes} disabled={!onRecipes}><NavigationIcon name="recipes" /><small>食谱</small></button><button className={active === 'fridge' ? 'is-active' : ''} onClick={onFridge}><NavigationIcon name="fridge" /><small>冰箱</small></button><button className={active === 'me' ? 'is-active' : ''} onClick={onMe}><NavigationIcon name="me" /><small>我的</small></button></nav>
}
```
