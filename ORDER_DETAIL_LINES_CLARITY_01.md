# ORDER-DETAIL-LINES-CLARITY-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

The "Lineas" tab in the order detail drawer showed a flat list of line items with
expandable detail rows. For orders with many variants of the same reference, the
layout was hard to scan -- users could not quickly see how many units per reference,
total value per product, or stock availability.

---

## Solution

Redesigned `DrawerLinesTab` with a **grouped-by-reference** layout:

### Data model

```typescript
interface RefGroup {
  referenceCode: string;
  productName: string;
  thumbnailUrl: string | null;
  lines: OrderLine[];
  totalUnits: number;
  totalValue: number;
}
```

`groupLinesByReference(lines)` aggregates lines by `referenceCode`, computing
per-group totals.

### Layout

```
+-- Reference group (collapsible) ----------------------+
| [thumb] REF-001 · Producto X    12 uds · $1,200,000   |
+--------------------------------------------------------+
| Talla | Color   | Cant. | P. unit.  | Total    | Stock |
| 38    | Negro   | 4     | $100,000  | $400,000 | OK    |
| 40    | Azul    | 8     | $100,000  | $800,000 | Bajo  |
+--------------------------------------------------------+

+-- Totals strip -------------------------------------------+
| 3 referencias · 8 variantes · 24 uds · $2,400,000        |
+-----------------------------------------------------------+
```

### Stock status helper

```typescript
function stockLabel(line: OrderLine): { text: string; color: string }
```

Returns "Disponible" (green), "Stock bajo" (amber), or "Sin stock" (red)
based on `availableStock` vs `quantity`.

### UX details

- Groups default to expanded; click header to collapse
- Chevron rotates on toggle
- Thumbnail placeholder shows package icon when no image
- Currency formatted with `Intl.NumberFormat("es-CO")`
- All data uses `T.mono` per design system rules
- Totals strip uses `ag-op-status ag-op-status--ok` styling

---

## Files Modified

| File | Change |
|------|--------|
| `pedidos-client.tsx` | `RefGroup` interface; `groupLinesByReference()` helper; `stockLabel()` helper; full `DrawerLinesTab` rewrite with grouped layout, variant grid, totals strip |
