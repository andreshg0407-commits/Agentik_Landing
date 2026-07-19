# COMERCIAL_PEDIDOS_LINE_INVENTORY_LINK_04.md

**Sprint:** COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
**Date:** 2026-06-24
**Status:** IMPLEMENTADO

---

## Objetivo

Conectar lineas reales de pedidos (CRMQuoteLine) con ProductVariant y ProductInventoryLevel
para que David evalúe disponibilidad real por referencia, talla y color.

---

## 1. Arquitectura

```
CRMQuoteLine.reference ──┐
CRMQuoteLine.size ────────┤──→ buildVariantCompositeKey("{REF}|{SIZE}|{COLOR}")
CRMQuoteLine.color ───────┘              │
                                         ▼
                              ProductVariant.sku (exact match)
                                         │
                                         ▼
                              ProductInventoryLevel (SUM quantity WHERE qty > 0)
                                         │
                                         ▼
                              OrderLine.availableUnits (enriched)
                                         │
                                         ▼
                              evaluateOrderFulfillment() → David signals
```

---

## 2. Algoritmo de Matching

### Composite Key Strategy

ProductVariant.sku format in Castillitos: `{productSku}|{talla}|{color}`

Example: `C7-5328|GEN|RS3`

CRMQuoteLine provides: `reference`, `size`, `color`

Match: `buildVariantCompositeKey(reference, size, color)` → lookup in ProductVariant.sku

### Normalization

- `normalizeReference()`: trim, uppercase, collapse whitespace
- `normalizeSize()`: trim, uppercase, collapse whitespace
- `normalizeColor()`: trim, uppercase, collapse whitespace

### Fallback Strategy

1. **Exact composite** (99.3% of lines): `{ref}|{size}|{color}` → ProductVariant.sku
2. **Reference-only**: ProductEntity.sku → first variant (0% needed)
3. **Not found**: `inventory_unknown` (0.7%)

---

## 3. Batch Optimization

`enrichOrderLinesWithInventory()` uses 3 batch queries instead of N+1:

1. `ProductVariant.findMany({ sku: { in: uniqueKeys } })` — one query for all composite keys
2. `ProductInventoryLevel.findMany({ variantId: { in: matchedIds } })` — one query for all inventory
3. `ProductEntity.findMany({ sku: { in: unmatchedRefs } })` — fallback for unmatched (only if needed)

No N+1 queries. No per-line DB calls.

---

## 4. Evidencia — Datos Reales (Castillitos, 2026-06-24)

### Phase 1 Audit (27,064 lines)

| Metric | Value |
|---|---|
| CRMQuoteLines | 27,064 |
| ProductVariants | 53,331 |
| ProductInventoryLevels | 156,832 |
| Match via product SKU | 26,940 (99.5%) |
| Match with size+color | 26,919 (99.5%) |
| No match | 124 (0.5%) |
| Unmatched refs | 10 unique |

### Phase 8 Validation (50 pedidos, 4,370 lines)

| Metric | Value |
|---|---|
| Total lines | 4,370 |
| Matched | 4,339 (99.3%) |
| Available (qty > 0) | 4,337 (99.2%) |
| Partial | 2 (0.0%) |
| Out of stock | 0 (0.0%) |
| Unknown | 31 (0.7%) |
| Match rate target >90% | PASS |

### Sample Matches

| Reference | Size | Color | Available | Warehouses | Status |
|---|---|---|---|---|---|
| C8-S-3931-5 | GEN | VE9 | 160 | 1 | OK |
| C7-BR-8839 | GEN | BE1 | 200 | 1 | OK |
| C8-838-4 | GEN | RS3 | 201 | 2 | OK |
| C7-6181 | GEN | LI1 | 50 | 1 | OK |
| C8-NFG-3 | GEN | NA1 | 90 | 1 | OK |

### Unmatched References (10 total)

C7-548-6, C8-S-3931-4, 34831-2, C8-S-3931-2, CGJ-2762225,
C7-8947, C8-YSB-2014, C6-A-101, C8-S-3931-1, C8-PY130

These are products that exist in CRM orders but don't have a matching ProductEntity.sku in the catalog.

---

## 5. David Messages (Updated)

| Grade | Message |
|---|---|
| ready | "Pedido despachable al {N}%." |
| partial | "Pedido despachable al {N}%. {M} referencias con inventario parcial." |
| blocked | "{M} referencias agotadas. Pedido despachable al {N}%." |
| unknown | "No hay suficiente informacion de inventario para evaluar el pedido." |

---

## 6. Files Created

| File | Purpose |
|---|---|
| `lib/comercial/pedidos/inventory-link-normalizer.ts` | Pure normalization functions (client+server) |
| `lib/comercial/pedidos/inventory-link-service.ts` | Server-only: resolveVariant, getAvailability, enrichOrderLines |
| `scripts/_pedido_inventory_match_audit.ts` | Phase 1 audit script |
| `scripts/_validate_order_inventory_link.ts` | Phase 8 validation script |

## 7. Files Modified

| File | Change |
|---|---|
| `lib/comercial/pedidos/order-service.ts` | `getOrder()` now calls `enrichDraftWithInventory()` |
| `lib/comercial/pedidos/order-fulfillment.ts` | David messages now include coverage % |
| `lib/comercial/pedidos/order-validation.ts` | David signals updated (low stock secondary signal) |

## 8. Files NOT Modified

- No Prisma schema changes
- No ProductVariant modifications
- No ProductInventoryLevel modifications
- No SAG adapter changes
- No inventory sync changes
- READ-ONLY resolution and enrichment

---

## 9. Limitaciones

1. **10 unmatched references** (0.5%): products in CRM orders but not in catalog
2. **No reserved quantity deduction**: `reservedQty` not subtracted yet
3. **No cross-order reservation**: same inventory shown to multiple orders
4. **Warehouse breakdown not shown in drawer**: available for future sprint
5. **Enrichment on `getOrder()` only**: `listOrders()` cards don't include inventory

---

## 10. Acceptance Criteria

| Criteria | Status |
|---|---|
| availableUnits no longer null for majority | PASS — 99.3% enriched |
| David produces real analysis | PASS — coverage %, line counts |
| Drawer shows real availability | PASS — per-line available/requested |
| Match superior to 90% | PASS — 99.3% |
| TSC baseline preserved | PASS — 160 |
| No inventory modified | PASS — read-only |
| No variants modified | PASS — read-only |
| Only read and resolve | PASS |
