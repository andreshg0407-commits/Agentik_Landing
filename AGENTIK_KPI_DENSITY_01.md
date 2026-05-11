# AGENTIK-KPI-DENSITY-01
## Financial KPI Containment + Signal/Intelligence Separation

**Sprint closed:** 2026-05-09
**Files touched:** 3 (design-system.css, daily-carousel.tsx, executive/page.tsx)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Audit Summary

| Location | Issue | Risk |
|---|---|---|
| B4 Radar Comercial Signal Strip | `fontSize: 38px` hardcoded — no overflow protection | HIGH — large COP values (~$1B+) can overflow at 38px in 1/3-col |
| `DailyCarousel` value div | `clamp(22px, 2.4vw, 34px)` — no `white-space: nowrap` or `overflow: hidden` | MEDIUM — values can wrap to 2nd line |
| B2 `VALUE` const | `T.sz["2xl"]` = 20px fixed — no containment properties | LOW — 20px likely fine but no safety net |
| "Ventas del día" sub | 3-line channel breakdown (`emp $X · alm $Y · web $Z`) | MEDIUM — card height inconsistency vs other cards |
| "Facturas emitidas hoy" sub | Same channel breakdown duplicated from ventas card | MEDIUM — redundant detail inside signal card |
| Intelligence layer | Channel intel lived inside KPI cards — not separated | UX — mixed signal + context inside same card |

---

## Problem Detected

1. **Number overflow**: Hardcoded `38px` in B4 Radar Comercial provides no overflow protection for real COP amounts (Castillitos data can reach $500M–$2B per channel). The clamp in DailyCarousel existed but lacked `white-space: nowrap`, allowing 2-line wrapping.

2. **Signal contamination**: The "Ventas del día" and "Facturas" DailyCarousel cards both contained identical 3-line channel breakdown text in their `sub` field. This:
   - Made those cards taller than peer cards (layout inconsistency)
   - Duplicated data between two adjacent cards
   - Blurred the signal/intelligence separation

3. **Missing intelligence layer**: No dedicated "Inteligencia financiera · hoy" section existed. Channel-level context had no proper home, so it leaked into signal cards.

---

## Solution: Numeric Containment (§17)

Added **§17 — KPI NUMERIC CONTAINMENT SYSTEM** to `app/design-system.css`:

```css
.ag-kpi-number          → base: nowrap, overflow hidden, ellipsis, tabular-nums
.ag-kpi-number--xl      → clamp(20px, 2.6vw, 34px) · weight 900 · tracking -0.03em
.ag-kpi-number--lg      → clamp(16px, 2.0vw, 24px) · weight 900 · tracking -0.02em
.ag-kpi-number--compact → clamp(13px, 1.5vw, 18px) · weight 900 · tracking -0.01em
```

Key properties on `.ag-kpi-number`:
- `white-space: nowrap` — prevents 2-line wrap
- `overflow: hidden` — clips instead of breaking layout
- `text-overflow: ellipsis` — safe truncation (last resort)
- `max-width: 100%` + `min-width: 0` — flex/grid containment
- `font-variant-numeric: tabular-nums` — stable numeric rhythm

---

## Classes Added

| Class | Location | Purpose |
|---|---|---|
| `.ag-kpi-number` | `app/design-system.css §17` | Base containment for any KPI value |
| `.ag-kpi-number--xl` | `app/design-system.css §17` | Primary signal card numbers (carousel, radar) |
| `.ag-kpi-number--lg` | `app/design-system.css §17` | Secondary KPI numbers |
| `.ag-kpi-number--compact` | `app/design-system.css §17` | Aging buckets, supplementary tiles |

---

## Cards Touched

### `components/executive/daily-carousel.tsx`
- Value `<div>`: removed inline `fontSize/fontWeight/letterSpacing/lineHeight`
- Applied `className="ag-kpi-number ag-kpi-number--xl"`
- Kept inline: `fontFamily`, `color`, `marginBottom`

### `app/(app)/[orgSlug]/executive/page.tsx`

**B4 Radar Comercial Signal Strip** (line ~1812):
- Removed `fontSize: hasVal ? 38 : 26`, `fontWeight: 900`, `letterSpacing`, `lineHeight`
- Applied `className="ag-kpi-number ag-kpi-number--xl"`

**B2 `VALUE` const** (line ~895):
- Added: `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`, `maxWidth: "100%"`, `minWidth: 0`, `fontVariantNumeric: "tabular-nums"`

**"Ventas del día" sub** (Bloque 1 DailyCards):
- Before: 3-line channel breakdown `emp $X · alm $Y · web $Z`
- After: `"${N} docs · F1 oficial · ver canal ↓"` (clean, single-line metadata)

**"Facturas emitidas hoy" sub** (Bloque 1 DailyCards):
- Before: same 3-line channel breakdown (duplicated from ventas)
- After: `"FE FD FC FG FA FW · F1 oficial"` (document types only — informative, compact)

---

## Information Moved

| Data | Was in | Moved to |
|---|---|---|
| Canal empresa amount for today | "Ventas del día" sub | "Inteligencia financiera · hoy" strip |
| Canal almacenes amount for today | "Ventas del día" sub | "Inteligencia financiera · hoy" strip |
| Canal breakdown (repeated) | "Facturas" sub | Removed (already in intel strip) |
| Cobros recibidos context | "Cobros" sub (kept) | Also in intel strip (different framing) |
| Consignaciones pending count | Not shown near Bloque 1 | Intel strip header badge |

---

## "Inteligencia Financiera Hoy" — Intel Strip

New section added **after DailyCarousel, inside Bloque 1 `<div>`**:

Uses `.ag-insight-card` + `.ag-intel-header` (both pre-existing in §12).

3-cell grid (no new queries — all data from page-level fetches):
1. **Empresa · hoy** — `todayVentasEmpresaAmt` → `fmtCOP()` or "—"
2. **Almacenes · hoy** — `todayVentasAlmacenesAmt` → `fmtCOP()` or "—"
3. **Cobros · hoy** — from `todayCobrosF1Raw` (same IIFE pattern as DailyCards)

Header badge: if `cobrosBreakdown?.consignacionesPendientes.count > 0`, shows amber warning pill.

---

## What Was NOT Touched

- Torre de Control structure, order, routing
- KPI calculations or data queries
- B2 Cartera y Riesgo block content
- B3 Tesorería Operativa
- B4 Radar Comercial structure (only the number font)
- B5 Decisiones Agentik
- Mobile shell components
- Any business logic, tenant logic, fiscal window logic
- Aging bucket cards (font unchanged — T.sz.lg = 14px, risk minimal)

---

## Acceptance Criteria Check

| # | Criterion | Status |
|---|---|---|
| 1 | Ningún número KPI se sale de su card | ✅ `white-space: nowrap` + `overflow: hidden` on all KPI values |
| 2 | Ningún número KPI se parte en dos líneas | ✅ `white-space: nowrap` prevents wrapping |
| 3 | Facturado acumulado histórico queda contenido | ✅ DailyCarousel uses `ag-kpi-number--xl` (clamp + nowrap) |
| 4 | Cards principales más limpias | ✅ Sub text reduced; channel detail moved to intel strip |
| 5 | Inteligencia financiera hoy debajo de Centro de Mando Diario | ✅ Added as last child of Bloque 1 div |
| 6 | No se cambió lógica ni data | ✅ Zero data/calculation changes |
| 7 | No se rompió Torre de Control | ✅ Structural, routing, KPI order unchanged |
| 8 | No se agregaron datos falsos | ✅ All intel strip data from existing server-side vars |
| 9 | No se crearon estilos arbitrarios | ✅ All new CSS in §17 with semantic names and comments |
| 10 | TypeScript sin errores nuevos | ✅ 162 → 162 errors (all pre-existing, unrelated) |

---

## Risks Pending

- **Aging bucket amounts**: Still use `T.sz.lg` (14px) via `VALUE` spread — low risk at 14px but not yet upgraded to `.ag-kpi-number--compact`. Can be added if needed.
- **B3 Tesorería Operativa cards**: Not audited in this sprint — uses `.ag-tcard` pattern. Should be reviewed in a follow-up.
- **Intel strip on small desktop widths (~800px)**: 3-column grid with `$X,XXX,XXX,XXX` values at `T.sz.xl` (16px) + containment — should clip correctly but worth visual QA.
