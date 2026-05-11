# VISUAL-SYSTEM-01 — UI Refinement Sprint

## Summary

Visual layer refinement for the Torre de Control executive module.
No architectural, routing, workspace, or data-layer changes.

---

## What Was Visually Updated

### 1. Brand Color Canonicalization
- `--agentik-blue` updated from `#304f9d` → `#004AAD` (true Agentik brand primary)
- `--agentik-blue-hover` updated to `#003A8C`
- `C.blueDark` token updated from `#1e40af` → `#004AAD`
- All inline `"#1e40af"` strings in `executive/page.tsx` replaced with `"#004AAD"`

### 2. Enterprise Design System v2 (globals.css)
Added CSS custom properties:
- Brand family: `--ag-brand`, `--ag-brand-700/500/400/100/50`
- Gradients: `--ag-grad-brand`, `--ag-grad-brand-v`, `--ag-grad-card`, `--ag-grad-rail`
- Surfaces: `--ag-surface`, `--ag-line`, `--ag-line-sub`
- Elevation: `--ag-shadow-sm`, `--ag-shadow-md`, `--ag-shadow-hover`

Added component CSS classes:
- `.ag-kpi-card` — Enterprise KPI signal card (18px radius, gradient bg, shadow, hover lift)
- `.ag-kpi-bar` — Left 3px brand gradient accent bar for KPI cards
- `.ag-tcard` — Tesorería operational card (18px radius, gradient bg, shadow)
- `.ag-tcard-bar` — Top 3px brand gradient bar for Tesorería cards
- `.ag-ai-strip` — Dark navy AI intelligence strip
- `.ag-hero-title` — Gradient text for section H1 titles
- `.ag-chan-active` — Active channel selector button (brand gradient background)

Updated op-* hover states to use brand blue family:
- `.op-sig-card:hover` — uses `rgba(0,74,173,...)` shadow
- `.op-trea-card:hover` — uses `rgba(0,74,173,...)` shadow + `#EEF5FF` hover background
- `.op-radar-card:hover` — same pattern
- Focus outlines updated to `#004AAD`

### 3. Design Token Additions (tokens.ts)
- `R.card = 18` — enterprise card border-radius
- `C.blueDark` updated to `#004AAD`

### 4. DailyCarousel KPI Cards (daily-carousel.tsx)
- Removed outer panel wrapper, each card is now its own entity
- Cards use `.ag-kpi-card` CSS class (18px radius, gradient bg, shadow, hover lift)
- Left 3px brand gradient bar via `.ag-kpi-bar` child div
- Status indicator: small colored dot (absolute top-right) — no text
- Footer: "Abrir detalle →" CTA link replacing verbose status text
- Value uses `clamp(22px, 2.4vw, 34px)` for responsive scaling
- Removed `hoveredId` state — hover handled by CSS for better performance

### 5. Cartera Signal Cards (executive/page.tsx)
- `sigCard()` updated: radius `R.card` (18px), gradient background, brand-tinted shadows
- Border color uses brand alpha channel for neutral state

### 6. Aging Segment Grid (executive/page.tsx)
- Border radius 4px → 14px
- Background updated to `linear-gradient(180deg, #fff, #FAFBFF)`
- Added subtle brand shadow `rgba(0,74,173,.05)`
- Border alpha reduced for lighter look

### 7. Channel Selector (executive/page.tsx)
- Active tab: uses `.ag-chan-active` class (gradient blue background, white text, brand shadow)
- Inactive tabs: border-radius updated to 8px, added hover transition
- Removed per-view color map (consolidado/empresa/etc.) — all active tabs use unified brand gradient

### 8. SectionHeader function (executive/page.tsx)
- Font changed from `"monospace"` to `T.mono` (JetBrains Mono)
- Font size: `T.sz.sm` (11px) → `T.sz.md` (13px) for better hierarchy
- Letter-spacing refined: `0.06em` → `0.07em`
- `marginBottom` increased: `S[3]` → `S[4]` for more breathing room
- Badge pill: radius updated to `R.card` (18px), padding slightly enlarged

### 9. Tesorería Operational Cards (executive/page.tsx — TesoreriaOperativa function)
- Cards use `ag-tcard` CSS class (gradient bg, 18px radius)
- Top 3px brand gradient bar via `ag-tcard-bar` div
- Card header background updated to `var(--ag-brand-50, #EEF5FF)`
- `borderLeft` accent removed — replaced by top brand bar

### 10. AI Strip (executive/page.tsx — TesoreriaOperativa)
- Class `ag-ai-strip` applied (navy gradient via CSS variable)
- Padding slightly increased for better breathing

---

## What Was Intentionally Preserved

- All routing and navigation architecture
- All workspace state (UX-SYSTEM-01/02/03 fully intact)
- All financial logic, queries, Prisma models
- All component hierarchy and data flow
- All mobile shell (`mob-exec`) — untouched
- All operational workspace pages (cobros-hoy, consignaciones, etc.)
- All Radar Comercial block structure (only hover color updated)
- All Decisiones Agentik block structure
- All F2Toggle, cartera details, deudores list
- All TypeScript types and interfaces

---

## Visual System Decisions

**Why `#004AAD` instead of `#1e40af`?**
`#004AAD` is the Agentik brand primary as defined in the design mockup. It has more saturation and depth, closer to a true enterprise blue. `#1e40af` was Tailwind's `blue-700` used as a placeholder.

**Why left bar on KPI cards instead of top bar?**
The mockup pattern uses a left accent bar to signal "this card is brand-affiliated" without visual noise. Top borders compete with the card grid spacing. Left bars are more editorial and less table-like.

**Why CSS classes instead of inline styles for hover/shadows?**
Hover effects cannot be done with inline React styles. Moving to CSS classes keeps the JSX clean and enables smooth transitions.

**Why `clamp()` for KPI values?**
Prevents overflow when both sidebars are open. Responsive scaling without media queries.

---

## Remaining Visual Debt

| Area | Issue | Priority |
|------|-------|----------|
| Radar Comercial | Signal strip cards still use `borderTop: "3px solid #004AAD"` inline — should adopt `ag-kpi-card` class | Medium |
| Decisiones block | Could benefit from `ag-dec-block` dark gradient treatment | Low |
| Historical cartera table | Amber/yellow table style feels disconnected from brand | Low |
| Right rail (if present) | Not reviewed in this sprint | Low |
| Workspace pages (cobros-hoy, etc.) | May benefit from same card radius update | Future |

---

## Future Design-System Opportunities

1. **CSS Module extraction** — `ag-*` classes could move to a `design-system.css` module imported globally
2. **Token CSS properties** — expose `C.*` tokens as CSS custom properties for use in CSS classes without JS import
3. **Card component** — a shared `<AgCard>` React component accepting `variant`, `accent`, `leftBar`, `topBar`
4. **Consistent `R.card`** — audit all `borderRadius: R.sm/md` across the shell and upgrade to appropriate scale
5. **Type-safe CSS vars** — create a typed `cssVar()` helper to reference `--ag-*` from JS without magic strings
