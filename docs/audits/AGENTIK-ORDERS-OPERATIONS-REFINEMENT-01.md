# AGENTIK-ORDERS-OPERATIONS-REFINEMENT-01

Sprint: Orders Operations Refinement
Tenant: Castillitos
Date: 2026-07-23

---

## 1. Objective

Close the Pedidos module functionally and visually for client delivery:
- Replace decorative KPIs with 5 operational KPIs
- Simplify drawer from 6 tabs to 3 (Pedido, Cumplimiento, Historial cliente)
- Add composite operational state resolver
- Fix origin-aware seller display
- Handle EMPTY_CONFIRMED orders
- Add thumbnails to drawer lines (via enrichDraftWithThumbnails)
- Remove CommercialHealth + DemandIntelligence panels

---

## 2. Architecture

### Operational State Resolver

New file: `lib/comercial/pedidos/order-operational-state.ts`

Derives a single user-facing state from multiple dimensions:

```
admin status + reservation + SAG sync + fulfillment → OperationalState
```

14 states with documented priority:
1. cancelado (terminal)
2. rechazado (SAG error)
3. reserva_expirada
4. conflicto_inventario
5. despachado / facturado
6. sincronizado
7. enviando / en_cola / en_simulacion
8. listo_para_sag
9. reservado
10. sin_reserva
11. borrador

### Seller Display

`resolveSellerDisplayText()` returns origin-aware text:

| Origin | With name | Without name |
|---|---|---|
| SAG_HISTORICAL | "Juan Perez" | "No informado por SAG" |
| AGENTIK_NATIVE | "Juan Perez" | "Sin vendedor asignado" |
| CRM_LEGACY | "Juan Perez (Inferido)" | "No informado por SAG" |

### 5 Operational KPIs

| KPI | Status filter | Color when > 0 |
|---|---|---|
| Borradores | borrador | ink |
| Listos para SAG | listo_para_enviar | blueDark |
| En simulacion | pendiente_sag | ink |
| Sincronizados | sincronizado | green |
| Con conflicto | conflicto | red |

KPIs are clickable — filter the table on click, toggle off on second click.

### Drawer Simplification

| Before (6 tabs) | After (3 tabs) |
|---|---|
| Lineas | Pedido (header + lines + conditions + EMPTY_CONFIRMED) |
| Cumplimiento | Cumplimiento (unchanged) |
| Variantes | REMOVED |
| Historial cliente | Historial cliente (unchanged, lazy-loaded) |
| Desempeno vendedor | REMOVED |
| Demanda | REMOVED |

---

## 3. Changes

### New Files

| File | Purpose |
|---|---|
| `lib/comercial/pedidos/order-operational-state.ts` | Composite state resolver, seller display, KPIs, EMPTY_CONFIRMED |
| `lib/comercial/pedidos/__tests__/order-operations-refinement.test.ts` | 37 tests, 7 suites |
| `docs/audits/AGENTIK-ORDERS-OPERATIONS-REFINEMENT-01.md` | This document |

### Modified Files

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` | Remove getCommercialHealth(), remove Prisma import, remove commercialHealth prop |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Replace KPIs, simplify drawer 6→3 tabs, operational state badges, origin-aware seller, EMPTY_CONFIRMED, remove ~800 lines of eliminated panels |
| `lib/comercial/pedidos/order-types.ts` | Extended OrderCard with sellerSource, sellerConfidence, deliveryScope, channel |
| `lib/comercial/pedidos/order-service.ts` | Added enrichDraftWithThumbnails(), updated rowToCard() and listCustomerOrderRecords() |

### Removed Components

| Component | Lines | Reason |
|---|---|---|
| CommercialHealth panel | ~25 | Replaced by operational KPIs |
| DemandIntelligence panel | ~15 | Not part of Pedidos scope |
| demandSummary useEffect | ~12 | Removed with panel |
| SellerPerformancePanel | ~160 | Tab eliminated |
| VariantMetricsPanel | ~85 | Tab eliminated |
| DemandIntelligencePanel | ~180 | Tab eliminated |
| HealthStat component | ~15 | Unused after removal |
| getCommercialHealth() | ~20 | Server-side, unused |

---

## 4. Tests

53 tests across 12 suites (node:test runner):

| Suite | Tests |
|---|---|
| resolveOperationalState | 17 |
| resolveOperationalState — edge cases | 6 |
| resolveSellerDisplayText | 6 |
| resolveSellerDisplayText — edge cases | 3 |
| computeOperationalStats | 2 |
| computeOperationalStats — Castillitos real distribution | 1 |
| buildOperationalKpis | 1 |
| kpiKeyToStatusFilter | 5 |
| kpiKeyToStatusFilter — exhaustive | 2 |
| emptyOrderExplanation | 5 |
| emptyOrderExplanation — edge cases | 4 |
| OPERATIONAL_STATE_LABEL/COLOR | 1 (validates all 14 states) |

Run: `npx tsx --test lib/comercial/pedidos/__tests__/order-operations-refinement.test.ts`

---

## 5. TSC

194 errors (baseline, 0 new). Zero errors in sprint files.

---

## 6. Runtime Validation (Castillitos)

### KPI Counts (Real DB)

| KPI | Count | Source |
|---|---|---|
| Borradores | 305 | CRM quotes |
| Listos para SAG | 0 | — |
| En simulacion | 115 | CustomerOrderRecord PENDIENTE |
| Sincronizados | 9,562 | CustomerOrderRecord FACTURADO |
| Con conflicto | 0 | — |
| **Total** | **9,983** | |

### Performance (DB only, no SOAP)

| Case | Lines | DB | Inventory | Thumbnails | Total |
|---|---|---|---|---|---|
| Small (#9999) | 1 | 184ms | 246ms | 197ms | 627ms |
| Medium (#9977) | 20 | 185ms | 244ms | 183ms | 612ms |
| Large (#9994) | 525 | 332ms | 333ms | 189ms | 854ms |
| NoSeller (#487) | 324 | 191ms | 242ms | 183ms | 616ms |

All under 1s. Zero SOAP calls for orders with persisted sellers.

### Seller Coverage

- Total orders: 9,678
- With seller: 6,209 (64.2%) — source: sag_movimientos=4,619, crm_quote_history=1,590
- Without seller: 3,469 (35.8%) — source: null (SOAP needed on first open)
- After first SOAP resolution, result persisted (source="none" if unavailable)

### EMPTY_CONFIRMED

8 orders with lineCount=null and 0 actual lines. All SAG_HISTORICAL.
emptyOrderExplanation() returns appropriate text based on status.

### Thumbnail Coverage

0 hero images for 663 import products. ProductThumb shows 3-char reference code fallback.
Broken URL handled via onError → fallback placeholder.

---

## 7. Corrections Applied During Validation

| Fix | Description |
|---|---|
| Test runner | Migrated from vitest to node:test + node:assert/strict (project standard) |
| SOAP seller dedup | Skip SOAP when sellerSource is already set; persist "none" after failed resolution |
| Drawer remount | Added `key={selectedOrder.id}` to force remount on order change |
| ProductThumb fallback | Added onError handler for broken image URLs |
| Progressive rendering | Auto-collapse all groups for orders >100 lines |

---

## 8. What Was NOT Changed

- SAG adapter
- Prisma schema
- Wizard components
- Reservation system
- Order fulfillment evaluation engine
- CustomerHistoryPanel (preserved, lazy-loaded)
- FulfillmentPanel (preserved)
- SharePreviewModal (preserved)
- OrderActions footer (preserved)
