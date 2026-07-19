# VENDOR-SAMPLE-DRAWER-UX-01

**Sprint:** VENDOR-SAMPLE-DRAWER-UX-01
**Module:** Comercial > Maletas > Drawer de detalle
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Prerequisites:** ENGINE-02 (validated), RECONCILIATION-01 (forensics)

---

## Objective

Redesign the vendor maleta detail drawer from a technical data table into a commercial decision panel. Zero engine/data changes — purely UX/presentation.

## Business Context

The administrator confirmed:
- Maletas are commercial sample bags (mostrario)
- One reference per maleta max
- Traceability matters more than quantity
- Users need to answer in < 5 seconds: what's OK, what needs replacement, what's critical

## Changes Applied

### FASE 1: Drawer Structure Redesign

**Before:** Flat layout — KPIs, health badge, search, filters, table, actions at bottom.
**After:** Hierarchical commercial layout — Action Cards (highest priority) > KPIs > Search > Filters > Table.

### FASE 2: Advanced Search

**Before:** Search only matched `reference` and `description`.
**After:** Search matches across 5 fields:
- `reference` (e.g., "L-8462")
- `description` (e.g., "pijama")
- `category/subgrupo` (e.g., "NAUTICO", "BEBE")
- `line` (e.g., "LT", "CS")
- `state label` (e.g., "reemplazar", "critica")

### FASE 3: Action Cards (CTA)

New prominent action cards at top of drawer:

| Card | Color | Action |
|---|---|---|
| Reemplazar | C.blueDark | Jumps to reemplazar filter |
| Criticas | C.red | Jumps to critica filter |
| Saludables | C.green | Jumps to saludable filter |

Cards show count prominently. Inactive cards (count=0) are dimmed. Active filter highlights the card border.

### FASE 4: Simplified Table

**Columns removed:**
- Traslado (transfer date) — technical, not actionable
- Origen (source warehouse) — technical, not actionable

**New column structure:**

| Column | Width | Content |
|---|---|---|
| [Thumb] | 36px | Product line abbreviation placeholder |
| Ref | 88px | Reference code |
| Descripcion | 1fr | Product description + replacement arrow |
| Subgrupo | 80px | SAG category (PIJAMA, NAUTICO, etc.) |
| Linea | 56px | LT/CS/IMPORT |
| Disp. | 64px | Central availability ("Disponible") |
| Estado | 84px | State badge |

### FASE 5: Product Thumbnails

Added 32x32px thumbnail placeholder per row. Shows line abbreviation (LT, CS, IM) in a bordered box. Ready for future image integration without breaking layout.

### FASE 6: Subgrupo SAG Visible

`category` field (extracted from SAG description) now displayed in its own column. Examples: PIJAMA, NAUTICO, CONJUNTO, VESTIDO, BEBE, BODY, SHORT, ACCESORIO, etc.

### FASE 7: State Badges

**Before:** State shown as text in `ag-op-status` CSS classes.
**After:** Visual pill badges with:
- Background: state color at 14% opacity
- Text: state color at full weight (700)
- Border-radius: pill
- Font: 10px mono, uppercase feel

States: Saludable (green), Riesgo (amber), Critica (red), Sin inventario (red), Reemplazar (blue), Produccion (purple).

### FASE 8: Responsive + Overflow

- All text columns use `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- Grid columns use fixed widths for data + `1fr` for description
- Gap between columns prevents overlap
- Filter pills use `flexWrap: wrap` + `whiteSpace: nowrap`
- Search input uses `width: 100%` with `box-sizing: border-box`
- Table handles 200-400+ rows via pagination (50 per page)

### FASE 9: QA Visual

- Removed: `stateVariant()` helper (no longer needed — badges use inline styles)
- Removed: `ActionLine` component (replaced by Action Cards)
- Removed: `fmtNum()` helper (unused)
- Removed: `formatShortDate()` helper (Traslado column removed)
- Removed: `URGENCY_COLOR` — only used in main canvas production table (kept there)
- Filter order simplified to commercial priorities: All > Saludables > Reemplazar > Criticas > Produccion
- Drawer severity now reflects vendor health (critical/warning/info)
- Drawer subtitle shows ref count instead of warehouse name

## Terminology Changes

| Before | After | Reason |
|---|---|---|
| Central | Disp. (Disponible) | More commercial |
| Traslado | — (removed) | Technical, not actionable |
| Origen | — (removed) | Technical, not actionable |
| En maleta | Activas | More natural |
| Riesgo (KPI) | Reemplazar (KPI) | Clearer action |

## Visual Hierarchy (enforced)

1. **Action Cards** — largest, most visible, guide the user
2. **State badges** — visual pills with color
3. **Product info** — ref, description, subgrupo
4. **Inventory** — disponible column (supporting data)

## Files Modified

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | Complete drawer redesign |

## Files NOT Modified (by design)

| File | Reason |
|---|---|
| `vendor-sample-presence-engine.ts` | No engine changes |
| `vendor-sample-loader.ts` | No data changes |
| `vendor-sample-types.ts` | No type changes |
| Any SAG/F34/reconciliation file | No data layer changes |

## Verification

```bash
npx tsc --noEmit  # 160 errors (baseline maintained)
```

Zero regressions. Zero engine changes. Zero data layer changes.
