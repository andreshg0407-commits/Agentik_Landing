# INVENTORY-CRM-RESERVATION-LAYER-01

**Sprint:** CRM DRAFT Reservation Layer
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (preserved)

---

## Objective

Incorporate CRM DRAFT quote reservations into the inventory availability formula.
Closes 100% of CJ-1126012 gap (36 units).

---

## Formula Change

```
BEFORE: disponible = B01 + B04 - PD_PENDIENTE
AFTER:  disponible = max(0, B01 + B04 - PD_PENDIENTE - CRM_RESERVATIONS)
```

Where CRM_RESERVATIONS = CRM DRAFT quotes with `warehouseName = 'PRODUCTO EN PROCESO'` only.

---

## Reservation Policy

| warehouseName | Policy | Rationale |
|---|---|---|
| PRODUCTO EN PROCESO | **DEDUCT** | Production commitments — admin treats as reserved |
| BODEGA PRINCIPAL | IGNORE | Regular quotes — admin does NOT deduct |
| IMPORTACIÓN | IGNORE | Import quotes — separate inventory pool |

**Evidence:** CJ-1126012 has CRM=36 in PRODUCTO EN PROCESO → admin=79 = B01+B04-CRM = EXACT MATCH.
L-1367 has CRM=75 in BODEGA PRINCIPAL → admin=64, NOT deducted by admin.

---

## Audit Results

### Phase 1 — CRM Status Distribution

- 1 CRM status: DRAFT (285 quotes, 27,064 lines, 35,903 units)
- 3 warehouse names: BODEGA PRINCIPAL (29,888), IMPORTACIÓN (5,280), PRODUCTO EN PROCESO (735)
- All lines have estado_pedido_c = "Esperando_validacion"

### Phase 7 — 4-Reference Validation

| Ref | Physical | PD | CRM* | Disp | Admin | Gap | Verdict |
|---|---|---|---|---|---|---|---|
| L-1367 | 68 | 0 | 0 | 68 | 64 | 4 | sync freshness |
| L-8467 | 515 | 0 | 0 | 515 | 511 | 4 | sync freshness |
| CJ-1126012 | 115 | 0 | 36 | **79** | **79** | **0** | **EXACT MATCH** |
| CJ-2026004B | 189 | 0 | 0 | 189 | 164 | 25 | B04 staleness |

*CRM = PRODUCTO EN PROCESO only

### Phase 8 — Global Impact

| Metric | Value |
|---|---|
| Total products | 3,360 |
| Products with CRM reservations | 32 |
| Total CRM deduction (units) | 735 |
| Old disponible (no CRM) | 161,982 |
| New disponible (with CRM + max(0)) | 165,019 |

### Phase 9 — Double-Deduction Safety

- 1 ref (L-7111) overlaps CRM PRODUCTO EN PROCESO + PENDIENTE PD
- L-7111: physical=11, PD=12, CRM=7 → clamped to 0 regardless
- **Risk: NEGLIGIBLE** — 1 of 3,360 products, already at 0

---

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `physicalQty Int?` and `crmReservedQty Int?` to CommercialCoverageSnapshot |
| `prisma/migrations/20260630100000_crm_reservation_layer/` | Migration SQL |
| `lib/integrations/sag/sag-inventory-contract.ts` | Added `physicalQty?` and `crmReservedQty?` to SagInventoryNormalizedRow |
| `lib/integrations/sag/sag-inventory-storage.ts` | Persist physicalQty + crmReservedQty to snapshot |
| `lib/integrations/sag/inventory-refresh-pipeline.ts` | Added CRM aggregation query + updated formula |
| `scripts/_resync-coverage-snapshot.ts` | Added CRM aggregation query + updated formula |

## Files Created

| File | Purpose |
|---|---|
| `scripts/_forensic-crm-reservation-audit.ts` | Phase 1 audit script |

---

## TSC Baseline

```
npx tsc --noEmit -> 160 errors (baseline preserved, 0 new errors)
```
