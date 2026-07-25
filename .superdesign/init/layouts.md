# Layouts

## Mobile flow shell

`frontend/src/App.tsx` renders flow pages with `.p4-flow`, a normal-flow `PageHeader`, a scrollable `.p4-content`, and a fixed `.bottom-action-bar`. Shared CSS is in `frontend/src/styles.css`.

## `PageHeader`

The three-column header is defined in `frontend/src/App.tsx` and styled by `.page-header` / `.header-button` in `frontend/src/styles.css`. It keeps the title geometrically centered regardless of left/right actions.

## Owner app shell

`OwnerApp` in `frontend/src/App.tsx` switches between home, refrigerator management, setup, layout editor, inventory, recipes, and settings views. The mobile primary navigation is `P7Navigation`; secondary pages use `PageHeader`.
