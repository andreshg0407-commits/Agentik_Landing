# ORDER-CREATION-POLISH-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Order drafts lacked commercial conditions: no delivery mode, no discount,
no customer-facing observations, no internal notes. The wizard jumped from
products to a bare summary with only lines and totals.

---

## FASE 1 — Extended order model

New optional fields on `OrderHeader` (backward compatible):

| Field | Type | Default |
|-------|------|---------|
| `deliveryMode` | `"immediate" \| "scheduled"` | `undefined` (treated as immediate) |
| `deliveryDate` | `string \| null` | `undefined` |
| `discountType` | `"percentage" \| "fixed"` | `undefined` |
| `discountValue` | `number` | `undefined` |
| `customerNotes` | `string` | `undefined` |
| `internalNotes` | `string` | `undefined` |

New optional fields on `OrderSummary`:

| Field | Type |
|-------|------|
| `discountAmount` | `number` |
| `totalFinal` | `number` |

All optional — existing orders load without errors.

---

## FASE 2 — Wizard "Resumen" step

New "Condiciones comerciales" panel in the summary step:

1. **Tipo de entrega** — radio: Inmediata / Programada
   - If programada: date picker for "Fecha compromiso"

2. **Descuento** — radio: Porcentaje / Valor fijo
   - Numeric input for value
   - Live preview: Subtotal / Descuento / Total final

3. **Observaciones para cliente** — textarea
   - Placeholder: "Informacion visible para el cliente"

4. **Notas internas** — textarea with amber border
   - Labeled: "Solo visible dentro de Agentik"
   - Placeholder: "Solo visible dentro de Agentik"

---

## FASE 3 — Discount calculation

`computeOrderSummary()` now accepts optional discount parameter:

```typescript
computeOrderSummary(lines, { type?: DiscountType, value?: number })
```

Rules:
- **Percentage:** `Math.round(totalValue * (value / 100))`
- **Fixed:** `Math.round(value)`
- **Total final:** `Math.max(0, totalValue - discountAmount)` — never negative

Updated in all callers:
- `createOrderDraft()`
- `createOrderDraftDeduped()`
- `updateOrderDraft()`
- `updateOrderLine()`
- `WholesaleOrderWizard`
- `PedidosClient` preview

---

## FASE 4 — Drawer detail

New `DrawerCommercialConditions` component, shown below lines in the Lineas tab:

```
Condiciones comerciales
────────────────────────
Entrega:          Programada
Fecha compromiso: 2026-07-15
Descuento:        10%
Valor descuento:  $240,000

Observaciones
[customer notes in alt surface]

Notas internas (solo Agentik)
[internal notes in amber surface]
```

Only renders when at least one condition is present. Backward compatible —
old orders without conditions show nothing.

---

## FASE 5 — PDF

Added "Condiciones comerciales" section after totals, before QR:
- Entrega (Inmediata / Programada)
- Fecha compromiso (if scheduled)
- Descuento (percentage or fixed label)
- Observaciones (customer notes)

**Internal notes are NOT included in PDF.**

Totals section now handles order-level discount (`order.summary.discountAmount`)
in addition to the external `discount` prop.

---

## FASE 6 — WhatsApp

Commercial conditions block added after totals summary:

```
Condiciones comerciales:
Entrega: Programada
Fecha compromiso: 2026-07-15
Descuento: 10%

Observaciones: Entregar despues del 15 de julio
```

Discount breakdown shown when active:
```
Subtotal: $2,400,000
Descuento: -$240,000
Valor total: $2,160,000
```

**Internal notes NOT included.**

---

## FASE 7 — Correo

Same commercial conditions block as WhatsApp:
- Condiciones comerciales section
- Discount breakdown in totals
- Customer notes visible
- **Internal notes NOT included**

---

## FASE 8 — Backward compatibility

All new fields are optional (`?` suffix on interface).
- `deliveryMode` defaults to `undefined` → treated as "Inmediata"
- `discountValue` defaults to `undefined` → treated as 0
- `customerNotes` defaults to `undefined` → no display
- `internalNotes` defaults to `undefined` → no display
- `summary.discountAmount` defaults to `undefined` → treated as 0
- `summary.totalFinal` defaults to `undefined` → falls back to `totalValue`

No migration needed. JSON stored in `metadataJson.header` accepts any shape.
Old orders open normally, show empty conditions section (hidden).

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-types.ts` | `DeliveryMode`, `DiscountType` types; extended `OrderHeader` with 6 new optional fields; extended `OrderSummary` with `discountAmount` + `totalFinal` |
| `lib/comercial/pedidos/order-validation.ts` | `computeOrderSummary()` accepts optional discount param; calculates `discountAmount` + `totalFinal` |
| `lib/comercial/pedidos/order-service.ts` | All `computeOrderSummary()` calls pass header discount info |
| `lib/comercial/pedidos/order-share.ts` | `buildConditionsBlock()` for shared WA/email conditions; discount breakdown in totals; customer notes visible, internal notes excluded |
| `lib/comercial/pedidos/order-pdf-renderer.tsx` | "Condiciones comerciales" section; order-level discount handling; internal notes excluded |
| `wholesale-order-wizard.tsx` | Commercial conditions panel in resumen step; discount-aware summary computation |
| `pedidos-client.tsx` | `DrawerCommercialConditions` component; discount-aware summary in preview |
