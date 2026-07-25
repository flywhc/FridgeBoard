# Extractable components

## PageHeader

- Source: `frontend/src/App.tsx`
- Category: layout
- Description: Three-column secondary flow header with centered title.
- Extractable props: `title`, `onBack`, `right`
- Hardcoded: button labels and shared CSS classes.

## OpenFridge

- Source: `frontend/src/App.tsx`
- Category: basic
- Description: Reusable fridge layout renderer with optional interactive zone selection.
- Extractable props: `layout`, `activeZoneKey`, `onSelect`, `renderSlot`
- Hardcoded: geometry-derived markup and shared CSS classes.

## P7Navigation

- Source: `frontend/src/App.tsx`
- Category: layout
- Description: Four-item owner mobile bottom navigation.
- Extractable props: `active`, navigation callbacks.
