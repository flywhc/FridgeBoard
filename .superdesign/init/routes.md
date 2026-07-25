# Routes

This is a single-page React/Vite application. URL mode and local state select the rendered surface rather than a file-based router.

- `/` — `frontend/src/App.tsx`, owner PWA entry; state selects home, refrigerator setup, or layout editor.
- `/fridge` — `frontend/src/App.tsx`, display-device entry; renders eink home/detail/pairing.

The target layout editor is the `p7View === 'layout-editor'` branch and renders `ExistingLayoutEditor` / `LayoutPlanEditor`.
