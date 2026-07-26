# Shared layouts

## Mobile PWA shell

`frontend/src/App.tsx` renders each mobile page as a `.p7-shell` main element. `AppHeader` is the shared top brand bar and `P7Navigation` is the shared fixed bottom navigation. Layout and tokens are in `frontend/src/styles.css`.

```tsx
function AppHeader({ left, right, title = '家常食橱' }: { left?: ReactNode; right?: ReactNode; title?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="app-header-title">{title}</span><span className="header-slot header-right">{right}</span></header>
}
```
