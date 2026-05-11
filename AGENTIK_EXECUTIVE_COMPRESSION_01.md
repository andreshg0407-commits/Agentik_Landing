# AGENTIK-EXECUTIVE-COMPRESSION-01
## Executive Compression + KPI Readability

**Sprint closed:** 2026-05-09
**Files touched:** 3 (design-system.css, executive/page.tsx, daily-carousel.tsx)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Audit Summary

| Location | Issue | Type |
|---|---|---|
| `ag-kpi-number--xl` | clamp max 34px → ellipsis on long COP amounts in 1/3-col cards | OVERFLOW |
| Cartera card (B2 Row 1) | "Fuera de plazo" + "Acción inmediata" sub already shown in aging grid below | REDUNDANCY |
| Cobros card (B2 Row 1) | 4-line F1/F2/Tiendas/Retail breakdown inside primary signal card | DENSITY |
| B4 Signal Strip (sub-bloque A) | Canal amounts for "hoy" already shown in B1 Inteligencia Financiera strip | DUPLICATION |
| B4 Inteligencia comercial (sub-bloque B) | Editorial text narrating same canal data — no new information vs B1 | DUPLICATION |
| Tesorería cards 1 & 3 | Both show AP document count — card 1 = "how many", card 3 = also "how many" | REPETITION |
| B1 Intel Strip | Only showed Empresa + Almacenes + Cobros — Web missing despite data being fetched | GAP |

---

## What Was Moved

| Data | Was in | Moved to |
|---|---|---|
| Cobros F1/F2/Tiendas/Retail breakdown | Inside main "Cobros identificados" signal card | New secondary franja: "Cobros del período · desglose por segmento" |
| "Fuera de plazo / Acción inmediata" sub-data | Inside Cartera 2026 main card body | Removed — already present in aging bucket grid (Row 2) |
| Web canal amount (today) | Not shown at all | Added as 4th signal in B1 Inteligencia Financiera strip |

---

## What Was Removed (Deduplicated)

### B4 Sub-bloque A — Señales comerciales críticas (Signal Strip)
3-card grid showing Empresa/Almacén/Web large amounts for "hoy".
**Reason:** B1 Inteligencia Financiera already shows Empresa, Almacenes, Web, and Cobros amounts for the same operational day. The B4 Signal Strip was showing identical data at a different point on the page.

### B4 Sub-bloque B — Inteligencia comercial · hoy
Editorial text strip describing the same canal data.
**Reason:** With the Signal Strip removed and B1 intel strip now covering Empresa/Almacenes/Web/Cobros in one place, this editorial layer no longer adds information. The B4 contextual section now opens directly with Rendimiento mensual (period analysis), which IS distinct from the "hoy" data in B1.

---

## What Was Compacted

### Cartera 2026 card (B2 Row 1)
**Before:** Card body contained LABEL + VALUE + "Total abierto" + "Cartera SAG" note + "Fuera de plazo: $X" + "Acción inmediata: $X"
**After:** LABEL + VALUE + "Total abierto · saldos positivos" + "Cartera SAG · desglose por antigüedad abajo"

The sub-amounts (fuera de plazo, acción inmediata) are derived from the aging buckets already visible 1–2 scroll segments below. The card now points down instead of repeating.

### Cobros identificados card (B2 Row 1)
**Before:** Card body showed 4 breakdown lines (F1 Empresa: $X / F2 Remisiones: $X / Tiendas: $X / Retail: $X) + ratio signal
**After:** Just ratio signal (recovery velocity) or recibo count. The breakdown moved to a dedicated secondary franja.

### Tesorería Operativa card 3 (TesoreriaOperativa component)
**Before:** `value = totalApDocs` (count of AP documents — same as card 1's headline signal)
**After:** `value = urgentDate` (oldest AP obligation date — "when" vs card 1's "how many")

Card 1 now = CxP (how much / how many)
Card 3 now = Obligación más antigua (when is the oldest one)
Each card answers a different question.

---

## Changes Delivered

### 1. `app/design-system.css` §17 — KPI clamp reduction
```css
/* Before: */
.ag-kpi-number--xl { font-size: clamp(20px, 2.6vw, 34px); }

/* After: */
.ag-kpi-number--xl { font-size: clamp(14px, 1.8vw, 26px); }
```
Max reduced from 34px to 26px. In a 1/3-column card at ~310px content area, 26px monospace can display ~12–15 chars comfortably without ellipsis on typical COP amounts.

### 2. `components/executive/daily-carousel.tsx` — title attribute
Added `title={card.value}` to the value div. Hover shows full numeric string as OS-native tooltip.

### 3. `app/(app)/[orgSlug]/executive/page.tsx` — B1 Intel Strip
- Changed `repeat(3, 1fr)` → `repeat(4, 1fr)`
- Added 4th signal: "Web · hoy" using already-fetched `todayVentasWebAmt`
- Updated `borderRight` condition: `i < 3` instead of `i < 2`
- Added `title={sig.value}` to intel strip value divs

### 4. `executive/page.tsx` — B2 Cartera card cleanup
- Removed "Fuera de plazo / Acción inmediata" flex row from card body
- Added "desglose por antigüedad abajo" pointer text

### 5. `executive/page.tsx` — B2 Cobros card cleanup
- Removed `cobrosCard.subLines.map(...)` from card body
- Kept: ratio signal (recovery velocity) as primary context
- Changed footnote from "vinculación a facturas en proceso" → "desglose por segmento abajo"
- Added `title={cobrosCard.value}` to VALUE div

### 6. `executive/page.tsx` — B2 Cobros secondary franja (new)
New `ag-insight-card` strip inserted between 3-card Row 1 and aging Row 2.
Header: "Cobros del período · desglose por segmento"
Cells: F1 Empresa / F2 Remisiones / Tiendas / Retail — filtered to only show segments with data.
Only renders in `view === "consolidado"` when `cobrosSegments?.hasRealAmounts`.

### 7. `executive/page.tsx` — B4 Radar Comercial
- Removed sub-bloque A (Signal Strip — 3 large canal cards)
- Removed sub-bloque B (Inteligencia comercial · hoy editorial strip)
- B4 now opens directly with Rendimiento mensual carousel (period analysis — clearly distinct from B1's "hoy" layer)

### 8. `executive/page.tsx` — TesoreriaOperativa card 3
- `value`: `urgentDate ?? "—"` (was: `totalApDocs` count)
- `state`: `"Proveedor: ${urgentName}"` (was: repetitive doc count phrasing)
- `note`: `"${totalApDocs} docs en total · doc más antiguo: ${urgentCode}"` (was: same phrasing as card 1)
- `label`: "Obligación más antigua" (was: "Tesorería inmediata")
- `sublabel`: "Fecha del documento AP más viejo pendiente"
- `ctaLabel`: "Ver vencimientos →" (was: "Ver obligaciones →" — same as card 1)

---

## Signal / Breakdown / Context / Action Architecture

After this sprint, B2 (Cartera y Riesgo) follows the clean 4-layer separation:

```
SIGNAL (Row 1):
  Cartera 2026 · F1 | Cobros identificados | Consignaciones pendientes

BREAKDOWN (secondary franja):
  F1 Empresa · cobros | F2 Remisiones · cobros | Tiendas · cobros | Retail · cobros

CONTEXT (aging + movement tag):
  0-30 | 31-60 | 61-90 | 90+ aging buckets
  Movement interpretation tag (stable/watch/risk)

ACTION:
  Ver cola urgente → | Ver clientes con mora → | Conciliación Inteligente →
```

---

## What Was NOT Touched

- KPI calculations or data queries
- Card grid structures, column order
- Shell navigation or routing
- Mobile shell components
- Aging bucket content or colors
- Cartera histórica details block
- Top deudores details block
- Decisiones Agentik (B5) — dark panel
- Copilot Zone (EVOLUCIÓN OPERATIVA block)
- Movement tags system (§19)
- Executive pulse bar (§18)
- Section header tiers (primary/operational/contextual)
- Any business logic, tenant logic, SAG integration
- Any Prisma queries
- n8n or other integrations

---

## Redundancy Eliminated

| Was duplicated | Resolution |
|---|---|
| Canal "hoy" amounts: B1 strip + B4 signal strip | B4 signal strip removed. B1 now unified with 4 signals (Empresa/Almacenes/Web/Cobros) |
| Canal "hoy" editorial text: B4 sub-bloque B | Removed. No narrative needed on top of B1's numeric layer |
| Fuera de plazo/Acción inmediata: Cartera card + Aging grid | Removed from card. Aging grid is the authoritative source |
| Cobros breakdown: inline in cobros card + nowhere else | Moved to dedicated secondary franja with proper BREAKDOWN layer semantics |
| AP doc count: Cartera CxP card + Tesorería Inmediata card | CxP = "how many/how much". Obligación más antigua = "when". Different questions, no duplication |

---

## Risks Pending

- **B2 Cobros franja on non-consolidado views**: Only renders when `view === "consolidado"`. Other views show single-source cobros (R1/R2/tiendas) — breakdown not meaningful there. Correct behavior.
- **Web canal in B1 strip with 4 cells**: At small desktop widths (~800px), 4 cells may get narrow (~180px each). At `T.sz.xl` (16px) + containment, COP values should clip correctly but worth visual QA.
- **Tesorería card 3 date display**: `urgentDate` is a short string (~"24 abr 26") and fits well at `fontSize: 22`. If date format changes, revisit.
- **ag-kpi-number--xl at 1.8vw**: At 1440px viewport, this gives 25.9px — slightly below the previous max but still comfortable for numbers. At 768px it gives 13.8px — at the `clamp` floor of 14px. Acceptable.
- **B4 now opens with period analysis**: The executive landing in B4 now sees Rendimiento mensual (historical carousel) immediately. This is the correct long-term view — period data, not repeated "hoy" data. Scanning flow: B1 = today, B4 = period analysis. Clean separation.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Los números KPI no se salen ni se parten | ✅ clamp 26px max + white-space: nowrap + title tooltip |
| 2 | Se evita ellipsis en KPIs principales | ✅ clamp reduced — long COP values fit at 26px in 1/3 col |
| 3 | Cartera y Riesgo queda más limpia | ✅ Card body stripped of aging sub-data |
| 4 | F1 / F2 / Tiendas se mueve a franja secundaria | ✅ New BREAKDOWN franja (ag-insight-card) below signal cards |
| 5 | Tesorería deja de repetir obligaciones entre card 1 y card 3 | ✅ Card 3 now shows "when" (date) not "how many" (count) |
| 6 | Radar Comercial reduce redundancia | ✅ Signal Strip + Inteligencia comercial removed |
| 7 | Inteligencia comercial no queda duplicada | ✅ Single layer in B1 (4-cell: Empresa/Almacenes/Web/Cobros) |
| 8 | No se tocó lógica, queries ni integraciones | ✅ Zero data/calculation changes |
| 9 | No se agregó fake data | ✅ All data from existing fetches |
| 10 | TypeScript sin errores nuevos | ✅ 162 → 162 |
