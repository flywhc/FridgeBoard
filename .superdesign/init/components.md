# Shared UI components

The app uses custom React components in `frontend/src/App.tsx` and vanilla CSS in `frontend/src/styles.css`.

## `PageHeader`

Shared secondary-page header with a 48px left action, centered title, and optional right action.

```tsx
function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className="page-header"><button className="header-button" onClick={onBack} aria-label="返回">‹</button><h1>{title}</h1><div className="header-right">{right}</div></header>
}
```

## `OpenFridge`

Shared interactive fridge layout renderer used by setup, layout editing, home, and location selection. It receives a persisted `Layout` and optional active zone callback.

Source: `frontend/src/App.tsx` (the full render implementation is kept in the source file; the layout-editor branch is documented in `pages.md`).
