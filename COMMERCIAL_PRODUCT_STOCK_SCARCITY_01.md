# COMMERCIAL-PRODUCT-STOCK-SCARCITY-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Stock badges in search results were binary (available / out) with no commercial
intelligence. Zero-stock products cluttered results. No line-specific minimums.
No "last units" or "few variants" warnings. Unsynced stock showed same badge as
zero stock.

---

## FASE 1 -- Commercial stock state helper

New `getCommercialStockState()` in `order-product-types.ts`:

| State | Condition | Label | Severity | Visible? |
|-------|-----------|-------|----------|----------|
| `unknown` | `availableQty === null` | Stock no sincronizado | neutral | yes |
| `out` | `availableQty <= 0` | Sin stock | danger | **hidden** |
| `last_units` | `availableQty <= 10` | Ultimas unidades | danger | yes |
| `few_variants` | only 1 variant with stock | Pocas variantes | warning | yes |
| `line_low` | below line minimum (LT=30, CS=20) | Stock bajo {LINE} | warning | yes |
| `available` | everything else | Disponible | success | yes |

Line code resolved from `lineName`, `categoryName`, or reference prefix (LT/CS/CJ).

---

## FASE 2 -- Search results filtering

- Zero-stock products (`shouldShowInSearch === false`) hidden from results
- Exception: exact reference match shown but **disabled** (grayed out, not selectable)
- Stock badge now uses `getCommercialStockState()` severity colors
- Helper text shown as secondary line below product name

---

## FASE 3 -- Scarcity-aware labels

Search result cards now show business-language labels:

- "Stock bajo LT" (amber) -- below 30 units for Latin Kids line
- "Ultimas unidades" (red) -- 10 or fewer units total
- "Pocas variantes" (amber) -- only 1 variant has stock
- "Stock no sincronizado" (gray) -- null inventory data
- "Disponible" (green) -- healthy stock

---

## FASE 4 -- Matrix stock warning banner

When a product is selected and its stock state is not "available", a warning
banner appears between the product header and the matrix table:

- **danger** (red background): "Ultimas unidades -- 8 uds disponibles"
- **warning** (amber background): "Stock bajo LT -- 25 uds disponibles"
- **neutral** (gray background): "Stock no sincronizado -- Inventario no sincronizado"

Banner does not block input -- sales can proceed, it only warns.

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-product-types.ts` | `CommercialStockStateName`, `CommercialStockSeverity`, `CommercialStockState` types; `LINE_MINIMUMS` map; `resolveLineCode()` helper; `getCommercialStockState()` main function |
| `wholesale-order-wizard.tsx` | Search results: filtered by `shouldShowInSearch`, exact-match exception shown disabled; stock badges via helper severity; matrix: stock warning banner between header and table |
