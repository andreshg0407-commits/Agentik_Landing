# COMMERCIAL-PRODUCT-SEARCH-STOCK-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Search results showed only `"12 var · $57,899"` — no stock visibility.
Matrix cells used availability as placeholder (confusing with quantity to order).
No auto-capping of stock, no keyboard navigation for fast entry.

---

## FASE 1 — Search results with stock

Before:
```
CJ-2026022B  CAMISETA OVERSIZE NIÑO BEBÉ     12 var · $57,899
```

After:
```
CJ-2026022B  CAMISETA OVERSIZE NIÑO BEBÉ     [Disponible]
148 uds disponibles · 12 variantes · $57,899 / ud
```

Stock badge using `inventoryStatus` from search result:
- **Disponible** (green) — stock > 10
- **Stock bajo** (amber) — 1-10
- **Sin stock** (red) — 0
- **sin datos de stock** (gray) — unsynced

All fields from existing `OrderProductSearchResult` type — no API changes needed.

---

## FASE 2 — Information order

Each search result card now has two lines:
1. **Reference + product name** (left) + **stock badge** (right)
2. **Stock count + variantes + unit price** (full width, below)

"var" → "variantes" (full word).

---

## FASE 3 — Matrix starts at zero

Cells already initialized at `quantity: 0` (confirmed in `selectProduct()`).

Changed placeholder from `{available}` to `"0"` — no confusion with stock.

Below each input: `disp. {N}` shows available stock.

States:
- `disp. 20` (green) — available > 10
- `disp. 5` (amber) — available 1-10
- `sin stock` (red) — available = 0

---

## FASE 4 — Direct quantity input

Updated input attributes:
- `inputMode="numeric"` — opens numeric keyboard on mobile/tablet
- `onFocus={e => e.target.select()}` — select all on focus for quick overwrite
- `max={cell.available}` — HTML5 hint (enforced via JS too)
- `placeholder="0"` — clear visual intent
- Blue border when quantity > 0 (active state)
- Disabled + gray background when stock = 0

---

## FASE 5 — Stock validation

Auto-capping implemented in `updateCellQty()`:

```typescript
if (c.available !== null && clamped > c.available) {
  clamped = c.available;
  setStockFeedback(`Maximo disponible: ${c.available}`);
}
```

- Input is clamped to available stock automatically
- Amber feedback bar shows "Maximo disponible: N" for 2 seconds
- Stock = 0 cells are `disabled` — cannot receive input
- "sin stock" label shown below disabled cells

Removed `matrixOverStock` badge — no longer possible to exceed stock.

---

## FASE 6 — Dynamic summary

Matrix footer now shows in real time:
- **N** combinaciones · **N** unidades · **$total**

Product subtotal calculated as `matrixTotal * unitPrice`.

Right sidebar (during productos step) now shows a "Digitando" section:
```
Digitando
CJ-2026022B
3 comb · 24 uds
$1,389,576
```

---

## FASE 7 — Add quantities

Button enabled when `matrixTotal > 0` (previously also required no overstock —
now impossible to exceed).

After adding:
- Lines created only for cells with quantity > 0
- Matrix + selectedProduct cleared
- Search input re-focused for next reference
- Feedback: "3 lineas agregadas · 24 unidades"

---

## FASE 8 — Keyboard navigation

| Shortcut | Action |
|----------|--------|
| Enter in search | Select first result (changed from "only if 1 result") |
| Tab in matrix | Navigate between cells (native browser behavior) |
| Enter in cell | Move to next cell in same row |
| Cmd/Ctrl + Enter | Add quantities (global handler via useEffect) |

---

## Files Modified

| File | Change |
|------|--------|
| `wholesale-order-wizard.tsx` | Search results: stock badge + total available + "variantes" + price/ud; Matrix: `inputMode="numeric"`, `onFocus` select all, auto-cap at available, disabled when 0, `disp. N` labels; `stockFeedback` state; Cmd+Enter global handler; Enter→next cell; sidebar "Digitando" preview; matrix footer subtotal |

---

## Pendientes moviles

- `inputMode="numeric"` opens numeric keypad on iOS/Android
- `onFocus` select-all works on mobile browsers
- Matrix horizontal scroll (`overflowX: auto`) handles narrow screens
- No touch-specific gestures implemented (swipe, long-press) — not requested
