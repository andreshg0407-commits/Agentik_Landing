# COMERCIAL_PEDIDOS_DAVID_STOCK_03.md

**Sprint:** COMERCIAL-PEDIDOS-DAVID-STOCK-03
**Date:** 2026-06-24
**Status:** IMPLEMENTADO

---

## Objetivo

Convertir el panel de pedido en una herramienta de cumplimiento comercial.
David evalua si un pedido puede ser despachado, linea por linea.

---

## 1. Phase 1 — Domain Types

Created `lib/comercial/pedidos/order-fulfillment.ts`:

| Type | Values |
|---|---|
| `LineFulfillmentStatus` | available, low_stock, partial, out_of_stock, inventory_unknown |
| `OrderFulfillmentGrade` | ready, partial, blocked, unknown |
| `LineFulfillment` | lineId, referenceCode, productName, size, color, status, requestedQty, availableQty, deficitQty |
| `OrderFulfillmentSummary` | status, totalLines, availableLines, lowStockLines, partialLines, blockedLines, unknownLines, completionPercent, lines[] |

---

## 2. Phase 2 — Line Evaluation Engine

`evaluateLineFulfillment(line)` rules:

| Condition | Status | DeficitQty |
|---|---|---|
| availableUnits === null | inventory_unknown | 0 |
| availableUnits <= 0 | out_of_stock | quantity |
| availableUnits < quantity | partial | quantity - availableUnits |
| availableUnits <= 10 | low_stock | 0 |
| else | available | 0 |

---

## 3. Phase 3 — Order Grade Derivation

`evaluateOrderFulfillment(draft)` rules:

| Condition | Grade |
|---|---|
| No lines OR all unknown | unknown |
| Any out_of_stock | blocked |
| Any partial | partial |
| All available/low_stock | ready |

Completion % = (available + low_stock) / total * 100

---

## 4. Phase 4 — David Signals

Updated `buildOrderDavidSignals()` in `order-validation.ts`:

| Grade | David Message |
|---|---|
| ready | "Pedido listo para despacho." |
| partial | "Algunas referencias requieren validacion de disponibilidad." |
| blocked | "Existen referencias agotadas que impiden el despacho completo." |
| unknown | "No hay suficiente informacion de inventario para evaluar el pedido." |

Secondary signals:
- Blocked: "{N} referencia(s) agotada(s)."
- Partial: "{N} linea(s) con disponibilidad parcial."
- SAG ready: "Pedido importado con lineas completas."

---

## 5. Phase 5 — FulfillmentStrip

Compact header widget in OrderDetailDrawer showing:
- Grade badge (color-coded: green/amber/red/gray)
- Line counts by status
- Coverage percentage

---

## 6. Phase 6 — FulfillmentPanel Rewrite

Full inventory fulfillment analysis view:
- Summary grid: Estado, Cobertura %, Lineas count, 5-column breakdown (Disponibles, Ultimas uds, Parcial, Agotadas, No validado)
- Line-by-line analysis sorted by priority (out_of_stock first)
- Expandable inline detail per line (producto, talla, color, solicitado, disponible, faltante, estado)
- Invoice/SAG section preserved (renamed: FULFILLMENT_LABEL → INVOICE_LABEL, FULFILLMENT_COLOR → INVOICE_COLOR)
- David fulfillment signal chip

---

## 7. Phase 7 — Clickable Lines

Each fulfillment line is clickable with expandable detail showing:
- Product name and reference
- Talla and color
- Requested vs available quantities
- Deficit (faltante)
- Status badge

---

## 8. Phase 8 — Validation with Real Data

**Script:** `scripts/_validate-fulfillment.ts`
**Command:** `npx tsx scripts/_validate-fulfillment.ts`

### Results (Castillitos, 2026-06-24)

| Metric | Value |
|---|---|
| Total pedidos | 285 |
| Con lineas | 283 |
| Sample validated | 10 |
| Lines per sample | 1 to 627 |

All CRMQuoteLine records have `availableUnits = null` (inventory not linked from CRM sync).
Engine correctly classifies:
- All lines → `inventory_unknown`
- All orders → `unknown` grade
- David → "No hay suficiente informacion de inventario para evaluar el pedido."

Real references visible: L-3442, C7-5328, CGJ-1792465, CR-2043225B, L-3519, etc.
Real colors: RS1, RS3, AZ3, AZ7, CF1, VE1, BE1, FC2, RJ1, LI1, LI2, KA1.
Real sizes: GEN, 2, 4, 6-9, 8, 10, 12, 14, 16, 18, 22, 12-18, 18-24, 9-12.

Sort priority verified: all lines at same priority (inventory_unknown = 3).

### Edge Cases Covered

| Case | Engine Behavior |
|---|---|
| availableUnits = null | inventory_unknown (correct) |
| availableUnits = 0 | out_of_stock (correct) |
| availableUnits < qty | partial with deficit (correct) |
| availableUnits <= 10 | low_stock (correct) |
| availableUnits > 10 & >= qty | available (correct) |
| No lines | unknown grade (correct) |
| All unknown | unknown grade (correct) |
| Mix blocked + partial | blocked wins (correct) |
| All available | ready grade (correct) |

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/pedidos/order-fulfillment.ts` | CREATED — fulfillment engine, types, sort, David messages |
| `lib/comercial/pedidos/order-validation.ts` | Updated buildOrderDavidSignals() to use fulfillment engine |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | FulfillmentStrip, FulfillmentPanel rewrite, visual maps, fulfillment import |
| `scripts/_validate-fulfillment.ts` | CREATED — Phase 8 validation script |

## Files NOT Modified

- No Prisma schema changes
- No SAG adapter changes
- No order-service.ts changes
- No inventory sync changes

---

## Acceptance Criteria

| Criteria | Status |
|---|---|
| Fulfillment engine pure domain (no Prisma) | PASS |
| Line-by-line evaluation | PASS |
| Order-level grade derivation | PASS |
| David signals fulfillment-aware | PASS |
| FulfillmentStrip in drawer header | PASS |
| FulfillmentPanel with sorted lines | PASS |
| Clickable expandable lines | PASS |
| Validated with real pedidos | PASS — 285 pedidos, 10 sampled |
| TSC baseline 160 | PASS |
