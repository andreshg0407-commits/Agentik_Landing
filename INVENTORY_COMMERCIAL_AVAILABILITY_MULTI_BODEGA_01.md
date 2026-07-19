# INVENTORY-COMMERCIAL-AVAILABILITY-MULTI-BODEGA-01

**Sprint:** P0 Implementation
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (preserved)

---

## Problem

Textile commercial availability showed 96.4% of products as `sin_stock` because:
1. The resync script queried only Bodega 01 (dispatch warehouse)
2. B01 goes negative when sales/dispatch precede production transfers from B04
3. `Math.max(0, warehouseQty)` clamped negative B01 values to zero
4. Result: 2,937 of 3,048 textile SKUs showed as out of stock

## Root Cause

Castillitos textile flow: B04 (production) -> B01 (dispatch) -> sales.
B01 reflects net signed movements. When dispatch outpaces transfers, B01 goes negative.
B04 holds the production buffer. Real commercial availability = B01 + B04.

Forensic evidence (INVENTORY-BODEGA-FLOW-FORENSICS-01):
- 2,941 of 2,943 products with negative B01 are fully compensated by B04 (99.9%)
- B01+B04 reduces negatives from 96% to near 0%

## Solution

### Phase 1-2: Tenant-Aware Warehouse Topology

Created `lib/inventory/inventory-warehouse-topology.ts`:
- `WarehouseSegment` model with `dispatchWarehouses` + `supportWarehouses`
- Castillitos textile: dispatch=["01"], support=["04"]
- IMPORTACION excluded (future sprint INVENTORY-IMPORTACION-PIPELINE-01)

### Phase 3-4: Resync Script Fix

Updated `scripts/_resync-coverage-snapshot.ts`:
- Query: `WHERE externalRef = '01'` -> `WHERE externalRef = ANY(['01','04'])`
- Removed early `Math.max(0, ...)` clamping — negatives flow through to engine layer
- Bodega label: `"01"` -> `"01+04"` to reflect multi-bodega source

### Phase 5-6: Pipeline Propagation

Updated downstream readers to match new bodega label:
- `lib/commercial-intelligence/report-loader.ts` — bodega: "01+04"
- `lib/commercial-intelligence/availability-engine.ts` — default sourceBodega: "01+04"
- `lib/inventory/inventory-control-service.ts` — source metadata updated
- `lib/inventory/inventory-control-types.ts` — doc comments updated
- `lib/commercial-intelligence/availability-types.ts` — doc comments updated

## Validation Results

### FASE 7 — 4 Textile Reference Audit

| SKU | B01 | B04 | B01+B04 | Admin | Status |
|---|---|---|---|---|---|
| L-1367 | -428 | 504 | 76 | 64 | Recovered (+12 over admin) |
| L-8467 | -79 | 600 | 521 | 511 | PASS (+10 over admin) |
| CJ-1126012 | -81 | 200 | 119 | 79 | Recovered (+40 over admin) |
| CJ-2026004B | -3 | 200 | 197 | 164 | Recovered (+33 over admin) |

All 4 references went from `sin_stock` to positive stock.
Overcount vs admin is explained by pending order deductions not yet wired (`pdAgg` is empty).

### FASE 8 — Global Textile Impact

| Metric | OLD (B01 only) | NEW (B01+B04) |
|---|---|---|
| Total textile SKUs | 3,048 | 3,048 |
| sin_stock | 2,937 (96.4%) | 725 (23.8%) |
| Recovered | — | 2,212 (75.3%) |

## Files Modified

| File | Change |
|---|---|
| `lib/inventory/inventory-warehouse-topology.ts` | NEW — tenant-aware topology config |
| `scripts/_resync-coverage-snapshot.ts` | Multi-bodega query + no-clamp |
| `lib/commercial-intelligence/report-loader.ts` | bodega label "01+04" |
| `lib/commercial-intelligence/availability-engine.ts` | default sourceBodega "01+04" |
| `lib/commercial-intelligence/availability-types.ts` | doc comment update |
| `lib/inventory/inventory-control-service.ts` | source metadata + doc comment |
| `lib/inventory/inventory-control-types.ts` | doc comment update |
| `scripts/_validate-multi-bodega.ts` | NEW — validation script |

## Future Work

- **INVENTORY-IMPORTACION-PIPELINE-01**: B24 + multi-bodega for import products (line 5/AC)
- **Order lines deduction**: Wire `pdAgg` with real pending order quantities to close the gap between B01+B04 and admin-reported values
- **Topology from DB**: Move warehouse topology config to Prisma model for runtime configuration
