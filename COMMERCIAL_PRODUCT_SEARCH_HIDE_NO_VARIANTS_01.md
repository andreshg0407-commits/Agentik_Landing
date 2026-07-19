# COMMERCIAL-PRODUCT-SEARCH-HIDE-NO-VARIANTS-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

447 SAG products were imported without variant data (talla/color).
They appeared in wholesale order search with "Stock no sincronizado" --
confusing sellers who couldn't add them to orders anyway.

Root cause (from COMMERCIAL-STOCK-DATA-AUDIT-01): SAG product catalog import
ran correctly, but the variant import phase never executed for these references.

---

## Rule Applied

**Producto sin variantes NO es vendible desde el wizard mayorista.**

- Not deleted from database
- Not modified in SAG integration
- Only hidden from the commercial search/matrix flow

---

## FASE 1 -- Filtro en busqueda general

Products with `variantCount === 0` are excluded from general search results.

New helper `isProductSellable()` checks:
- `variantCount > 0`
- At least 1 variant with non-empty size or color

The filtering happens in the search results rendering block. Products failing
`isProductSellable()` are removed from the visible list.

Before: searching "manga" returned CJ-4031425, CJ-4011435, CJ-4001435B
with confusing "Stock no sincronizado" badge.

After: these products do not appear in general search results.

---

## FASE 2 -- Busqueda exacta por referencia

If the user types an exact reference that matches a no-variant product:

- The result appears **disabled** (grayed out, not clickable)
- Badge: **"Pendiente variantes SAG"**
- Subtext: "Producto importado desde SAG, sin tallas/colores disponibles en Agentik"

This serves diagnostic purposes without contaminating normal workflow.

---

## FASE 3 -- Lenguaje operativo

Changed the label for 0-variant products from confusing "Stock no sincronizado"
to clear operational language:

| Before | After |
|--------|-------|
| "Stock no sincronizado" | "Pendiente variantes SAG" |
| "Inventario no sincronizado" | "Producto importado desde SAG, sin tallas/colores disponibles en Agentik" |

"Stock no sincronizado" is now reserved exclusively for products that HAVE
variants but LACK inventory level records (a different problem).

---

## FASE 4 -- Matriz bloqueada

`selectProduct()` now guards against unsellable products:

```typescript
if (!isProductSellable(p)) return;
```

Enter key in search also skips no-variant products:

```typescript
const first = searchResults.find(p => isProductSellable(p) && ...);
```

If a no-variant product somehow reaches selection, the matrix won't open
because `variants.length === 0` means `matrixColors` and `matrixSizes` are
empty -- the existing condition `matrixColors.length > 0 && matrixSizes.length > 0`
already blocks rendering.

---

## FASE 5 -- Contador diagnostico

When search results include hidden no-variant products:

```
[pedidos] productosOcultosSinVariantes: 3
```

Logged via `console.debug()` -- visible in browser DevTools, not shown to seller.

---

## FASE 6 -- Validacion

| Search | Before | After |
|--------|--------|-------|
| "manga" | CJ-4031425 visible (confusing badge) | Hidden |
| "camiseta" | Multiple no-variant results mixed in | Only sellable results |
| "CJ-4031425" (exact) | Visible but unusable | Disabled + "Pendiente variantes SAG" |

---

## FASE 7 -- Decision de no borrar datos

The 447 products remain in the database with full integrity:
- `status: "approved"`
- `commercialStatus: "active"`
- `externalSource: "sag"`

They are real SAG references that need their variant import completed.
Deleting them would lose the product/price data already imported correctly.

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-product-types.ts` | Added `isProductSellable()` helper; added `variantCount === 0` check in `getCommercialStockState()` returning "Pendiente variantes SAG" with `shouldShowInSearch: false` |
| `wholesale-order-wizard.tsx` | Search results: split into sellable vs no-variant-exact lists; no-variant shown disabled for exact match only; `selectProduct()` guarded by `isProductSellable()`; Enter key skips unsellable; `console.debug` counter for hidden products |
| `scripts/_audit-stock-data.ts` | Fixed sort tuple typing (pre-existing script, not product code) |

---

## Next Sprint Recommended

**SAG-PRODUCT-VARIANTS-RECOVERY-01**

Re-execute variant import for the 447 affected references:
1. Query SAG for talla/color data (descriptions confirm `Talla/Color: Si`)
2. Create ProductVariant records (size x color combinations)
3. Sync ProductInventoryLevel from SAG bodega data
4. Validate products transition from "Pendiente variantes SAG" to sellable state
