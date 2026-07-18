# FridgeBoard Design System

## Product context

FridgeBoard is a two-surface household food inventory product:

1. A refrigerator-mounted e-ink reader browser, such as a recent Kindle, used for passive status viewing, opening one compartment, and confirming that an item was removed.
2. A mobile PWA used for adding and correcting food records through manual entry, barcode scanning, camera capture, and optional user-triggered multimodal extraction.

The first release supports multiple refrigerators on one phone without user accounts. Each installed PWA instance receives per-refrigerator access through QR pairing. Architecture, planning, implementation, and test strategy are outside this design scope.

## Jobs to be done

- Understand what is in each refrigerator location in under three seconds.
- Notice expired and near-expiry food without reading a dense list.
- Open a compartment with one slow tap and adjust remaining quantity in a compact two-line row.
- Add a packaged or unpackaged food on a phone with minimal typing.
- Allow automation to prefill fields while keeping every inferred value reviewable and editable.
- Plan this and next week's meals, see dynamically missing ingredients, and consume exact-matched inventory when a meal is completed.

## Visual direction

Adapt the Superdesign “High Contrast Landing Page” Swiss monochrome direction into a functional appliance interface. Preserve its strong typography, strict neutral palette, hard geometry, and editorial hierarchy. Do not use its decorative text echoes, image reveals, hover-only behavior, blurred backgrounds, glass effects, gradients, or animations.

The interface should feel like looking into an actual refrigerator rendered as high-contrast black-and-white line art: calm, domestic, direct, and tactile. It must not resemble a generic SaaS dashboard, labeled floor plan, asset ledger, or list of storage locations.

## Color and contrast

- Paper: `#F2F2EE`
- White: `#FFFFFF`
- Ink: `#111111`
- Mid gray: `#777777`
- Light gray: `#D7D7D2`
- Mobile-only optional warning accent: `#B6402B`
- Mobile-only optional fresh accent: `#4F6653`

All status meaning must survive conversion to one-bit black and white. Use border weight, fill, icon shape, pattern, and text together. Color is progressive enhancement only.

## Typography

- Use system sans-serif only: `Arial`, `Helvetica Neue`, sans-serif. Avoid downloaded fonts on the e-ink surface.
- Refrigerator page title: 30–36px, weight 700.
- Refrigerator primary count/status: 24–32px, weight 700.
- Refrigerator labels: 18–22px, weight 700.
- Refrigerator metadata: 16–18px, weight 400–700.
- Mobile page title: 28px, weight 700.
- Mobile field and control text: at least 16px.
- Use tabular numerals for dates and counts.

## Geometry and spacing

- Base spacing unit: 8px.
- Refrigerator outer margin: 20–24px.
- Mobile outer margin: 16px.
- Refrigerator tap target: minimum 56px; preferred compartment height 72–110px.
- Mobile tap target: minimum 48px.
- Borders: 2px default; 3px for selected or warning; 4px for destructive/expired emphasis.
- Radius: 0–4px on the refrigerator; 8–12px on mobile controls only.
- No shadows. No transparency. No decorative textures except sparse deterministic status hatching.

## Status language

- Fresh: plain outline and open-circle status mark.
- Near expiry: 3px double border plus a small diagonal-hatched corner flag; label “临期”.
- Expired: black exclamation-mark badge; label “已过期” only in detail views.
- No BBD: ordinary inventory with no warning mark; BBD management is optional.
- Removed/pending sync: struck-through row displayed briefly with “已移除，可撤销”.

Never encode status through small food illustrations alone.

## Refrigerator creation and templates

- Refrigerator geometry is household-specific and configured on mobile during creation, never on the e-ink display.
- Offer seven recognizable starting templates: single-door with top freezer, single-door with bottom freezer, side-by-side double-door, French-door with bottom freezer, compact refrigerator, top/middle/bottom three-door with an adjustable middle zone, and a top-refrigerator/bottom-freezer template whose middle row is split into two unnamed special-function zones.
- Choosing a template immediately creates a usable refrigerator. Editing is optional and uses graphical preset structures, checkboxes, or segmented selections rather than numeric entry or freeform drawing.
- Use a live black-and-white miniature preview. Configuration labels belong only on mobile setup screens.
- Avoid a completely freeform layout editor in the first design; constrained templates plus counts are easier to understand and keep visual mapping stable.

## Refrigerator overview

- Design for a portrait e-ink viewport around a 3:4 aspect ratio first; do not hard-code one Kindle resolution.
- Header contains “冰箱里有什么”, total item count, current date, last sync time, and a manual refresh button.
- A compact alert strip summarizes expired and near-expiry counts using large geometric status marks. It must not become a carousel or animated banner.
- When unfinished meals have missing ingredients, show a compact restock icon on the e-ink overview; hide it when there are no shortages.
- The main content is a visually recognizable open refrigerator interior, not a grid of generic cards, labeled floor plan, or location list.
- Render the user-selected refrigerator template with recognizable outer cabinet, open door geometry, inner door bins, glass shelf front edges, drawer fronts, freezer boundary, hinges, and door seals using strict black-and-white line art. Do not draw exterior door handles.
- Do not print compartment names such as 冷藏上层、冷藏中层、果蔬抽屉、冰箱门、冷冻室 on the e-ink overview. Physical position is the navigation label.
- Place many recognizable food pictograms directly where they are stored: milk carton, eggs, yogurt cups, leftovers container, leafy greens, carrots, apples, bottles, condiments, meat pack, and frozen bags. Prefer 12–20 visible objects across the whole refrigerator.
- When space permits, merge and display specific subcategory icons such as orange, apple, milk, or pork, with optional count badges. When crowded, collapse multiple subcategories into their parent category icon such as fruit or meat. Hide count badges before hiding icons.
- Status appears on the food object itself: near-expiry gets a hatched corner tag; expired gets a black exclamation-mark badge. A compact legend may use only the words “临期” and “过期”.
- Shelves, drawers, and door bins are large invisible hit areas; tapping anywhere in that physical region opens its contents.
- A single tap opens a compartment detail. Do not require hover and do not use nested tiny controls.
- Avoid periodic full-screen visual refresh. Keep refrigerator geometry completely stable and change only food objects, badges, counts, and sync status conceptually.

## Refrigerator compartment detail

- Preserve a fixed back control. The header may use a small thumbnail/outline of the selected physical region instead of a location name.
- List items as compact two-line rows with pictogram, food name, quantity, and optional expiry state.
- Dates use human language first (“明天到期”, “已过期 2 天”), exact date second.
- Quantity rows place `[−]`, `剩 N`, `[+]`, and `[全部拿走]` on the second line. `−` and `+` immediately adjust remaining quantity; quantity-one packages show a single “拿走” action.
- Every immediate quantity change provides undo feedback and temporarily blocks repeated taps while pending.

## E-ink restock view

- Tapping the overview restock icon opens a read-only shortage list grouped by weekday and meal.
- Show exact missing subcategory names and amounts with strong dividers and large text.
- Do not support copying, meal editing, or completing meals on e-ink; those actions remain mobile-only.
- Use the same 10-minute idle return to the refrigerator overview as compartment detail views.

## Mobile add-item flow

- Design for 390×844.
- The top camera preview occupies about 42–48% of the viewport, not the full screen. It includes framing guides and a clear close/camera toggle.
- A mode selector supports “扫码” and “拍包装”. Barcode scanning should include EAN/UPC and QR wording, not imply QR-only.
- The lower half is a persistent editable form with product name, parent category, exact subcategory, storage location, quantity, optional BBD, and one combined brand/specification/notes description.
- After category selection, prefill storage location from this refrigerator's last location used for that parent category. A user change replaces that parent category's remembered location.
- Barcode success prefills product identity when available but does not claim to know package-specific expiry.
- “AI 识别包装文字” captures only the current frame. It is a prominent user-triggered secondary action that may be repeated any number of times; each result fills only recognized fields and must not block manual editing.
- Every inferred value carries a source/confidence treatment: “扫码”, “AI 建议”, or “手动”; uncertain fields have a visible review mark.
- Primary action is “确认加入冰箱”. It remains available after the required minimum information is present.
- Provide manual-only and photo-upload fallbacks if live camera access fails.

## Iconography

- Use a curated built-in set of simple outline/solid pictograms designed on a 24×24 or 32×32 grid with 2–3px strokes.
- Each icon must remain legible at one-bit output and at 24px.
- Provide both parent-category icons and common subcategory icons. Different brands and varieties reuse the subcategory icon; missing subcategory icons fall back to the parent category.
- Creating a special subcategory can manually trigger AI icon generation. Generate exactly four candidates for card-style selection, then add the confirmed icon to the reusable refrigerator icon library.
- A spike compares direct SVG generation with raster text-to-image followed only by black/white conversion, transparent-edge cropping, and resizing. Raster output does not need SVG conversion.

## Weekly meal plan

- Provide separate this-week and next-week lists.
- Accept pasted multiline plain text, one meal per line, then convert it into individually editable rows.
- Parse dish name, exact ingredient subcategory names, and optional amounts; missing amounts default to one inventory unit.
- Missing-ingredient status recalculates whenever inventory or meal plans change. The mobile refrigerator home shows a restock icon only when something is missing.
- Ingredient matching is exact subcategory-name matching only. Never fall back to parent categories, synonyms, brands, or fuzzy matching; unmatched text remains missing until the user edits it.
- Completing a meal immediately consumes exact-matched inventory, earliest BBD first and then oldest entry. The completed row keeps an “撤销” action that restores the whole meal consumption.

## Interaction and motion

- Refrigerator: no animation, no hover dependency, no swipe dependency, no skeleton shimmer, and no auto-advancing content.
- Give immediate static pressed feedback where the browser supports it, then a clear loading label for slow operations.
- Mobile: transitions under 150ms and only when they clarify state. AI progress may use textual staged status, not an indeterminate decorative animation.
- Preserve focus and data when camera or AI operations fail.

## Content principles

- Use concise Chinese labels and real example foods.
- Prefer “明天到期” over raw dates in high-attention contexts.
- Distinguish “保质期/此日期前食用” from “最佳赏味期/此日期前风味最佳”.
- Never silently save AI-extracted dates. Require explicit confirmation of uncertain or conflicting dates.
