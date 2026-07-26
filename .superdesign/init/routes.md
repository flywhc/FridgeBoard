# Routes

The Vite React app uses state-driven views in `frontend/src/App.tsx` rather than a client router.

- `/` — owner PWA; renders sign-in, refrigerator switcher, `FridgeHome`, recipes, settings, and setup views according to application state.
- `/fridge` — refrigerator display gate and e-ink home/detail views.
- `/fridge/pair` — refrigerator pairing QR view.

The current-home render branch is `FridgeHome` in `frontend/src/App.tsx`; it uses `AppHeader`, `PwaInstallPrompt`, `OpenFridge`, `CategoryIcon`, and `P7Navigation`.
