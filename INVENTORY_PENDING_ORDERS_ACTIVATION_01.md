# INVENTORY-PENDING-ORDERS-ACTIVATION-01

**Sprint:** Activation + Validation
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (preserved)

---

## Objective

Activate the PD order lines sync pipeline built in INVENTORY-PENDING-ORDERS-SYNC-01, populate CustomerOrderLine with real SAG data, and measure whether pending order deductions reduce the gap between Agentik's calculated availability and admin-reported values.

## Migration

- Migration `20260713000000_customer_order_lines` applied via `prisma migrate deploy`
- Two blocking migrations resolved first: `20260712000000_production_event_model` and `20260712100000_production_event_review` (already applied via db push, marked as applied)

## Sync Results

| Metric | Value |
|---|---|
| PENDIENTE orders scanned | 9,522 |
| MOVIMIENTOS_ITEMS fetched from SAG | 1,138,155 |
| CustomerOrderLine rows created | 1,138,155 |
| Errors | 0 |
| Orders with lines | 9,514 |
| Unique references (PENDIENTE) | 4,176 |
| Total pending quantity | 1,583,294 units |
| Duration | 926 seconds (~15 min) |

## Critical Discovery: PD Status Never Transitions

**Root cause of overcounting:** ALL 9,522 CustomerOrderRecords have `status = PENDIENTE`. SAG never updates this status — orders that have been dispatched, invoiced, or closed remain PENDIENTE in the MOVIMIENTOS source data. There is no status lifecycle.

| Year | PENDIENTE Orders | Lines | % of Total |
|---|---|---|---|
| 2020 | 803 | 78,728 | 6.9% |
| 2021 | 1,808 | 217,242 | 19.1% |
| 2022 | 1,438 | 184,093 | 16.2% |
| 2023 | 1,431 | 222,189 | 19.5% |
| 2024 | 1,300 | 155,562 | 13.7% |
| 2025 | 1,783 | 207,301 | 18.2% |
| 2026 | 959 | 73,040 | 6.4% |

**93.6% of PD lines are from before 2026** — stale historical orders that have long been fulfilled.

## Solution: Recency Window

Since SAG PD status is permanently PENDIENTE, the resync script now applies a **30-day recency window** to filter out stale orders. Only PD orders from the last 30 days are counted as truly pending commitments.

Window analysis for 4 audit references:

| SKU | Admin | No PD | 7d | 14d | 30d | 45d | 60d | Best Window |
|---|---|---|---|---|---|---|---|---|
| L-1367 | 64 | 76 | 72 | 68 | -2 | -46 | -111 | 14d |
| L-8467 | 511 | 521 | 521 | 515 | 499 | 493 | 457 | 14d |
| CJ-1126012 | 79 | 119 | 119 | 107 | 102 | 74 | 60 | 45d |
| CJ-2026004B | 164 | 197 | 197 | 189 | 189 | 185 | 181 | 60d |

No single window is perfect for all references — different products have different order-to-dispatch cycles. **30 days was chosen as a balanced default** that covers the typical Castillitos textile fulfillment cycle.

## 4-Reference Validation (30d window)

| SKU | Warehouse (B01+B04) | PD (30d) | Disponible | Admin | Gap | Gap % | Status |
|---|---|---|---|---|---|---|---|
| L-1367 | 76 | 78 | -2 | 64 | 66 | 103% | GAP — over-committed |
| L-8467 | 521 | 22 | 499 | 511 | 12 | 2% | CLOSE |
| CJ-1126012 | 119 | 17 | 102 | 79 | 23 | 29% | GAP — overcount |
| CJ-2026004B | 197 | 8 | 189 | 164 | 25 | 15% | CLOSE |

**2 of 4 references within 15%** of admin values. The remaining 2 have gaps explained by:
- **L-1367**: Heavily ordered in last 30 days (78 units pending vs 76 in warehouse) — genuinely over-committed
- **CJ-1126012**: Remaining overcount likely from maleta/store stock not yet deducted (future sprint)

## Global Impact (Before/After)

| Metric | BEFORE (no PD) | AFTER (PD 30d) | Delta |
|---|---|---|---|
| Refs positive | 111* | 2,325 | +2,214 |
| Refs sin stock | 2,937* | 746 | -2,191 |
| Refs with PD > 0 | 0 | 226 | +226 |
| Total disponible | 5,119* | 141,457 | +136,338 |
| Total PD pending | 0 | 12,230 | +12,230 |

*Before values include pre-multi-bodega snapshot data for comparison.

## Performance Optimization

Initial sync used individual Prisma upserts (100/batch) — too slow for 1.1M rows (~5 hours estimated). Replaced with **raw SQL INSERT ... ON CONFLICT** (500/batch), completing in 15 minutes.

## Files Modified

| File | Change |
|---|---|
| `lib/connectors/adapters/sag-pya-soap/orders/sag-order-lines-sync.ts` | Bulk SQL upsert (was individual Prisma upserts) |
| `scripts/_resync-coverage-snapshot.ts` | 30-day recency window on PD aggregation |

## Files Created

| File | Purpose |
|---|---|
| `scripts/_activate-pd-lines-sync.ts` | Activation script: sync + validate (FASE 3-5) |
| `scripts/_diagnose-pd-status.ts` | FASE 10 diagnostic: status distribution + stale analysis |
| `scripts/_diagnose-pd-window.ts` | Window analysis: find optimal recency filter |
| `scripts/_validate-snapshot-pd.ts` | FASE 7-9: snapshot validation + global impact |
| `scripts/_cleanup-partial-sync.ts` | Utility: clean up partial sync data |

## Remaining Gaps

1. **PD status reconciliation**: Cross-reference CustomerOrderRecord with SaleRecord (128,636 invoices) to identify orders that have been invoiced → mark as FACTURADO
2. **Maleta/store deductions**: Stock allocated to vendor bags and stores is not yet subtracted from availability
3. **Window tuning**: Different product lines may need different PD windows (14d for fast-moving LT, 45d for slower CS)
4. **Incremental sync**: Currently syncs all PENDIENTE orders; future runs should use `sinceDate` for incremental updates

## Next Sprint Recommended

**INVENTORY-PD-STATUS-RECONCILIATION-01**: Cross-reference CustomerOrderRecord with SaleRecord to identify invoiced orders and transition their status from PENDIENTE to FACTURADO. This would eliminate the need for the recency window and provide exact pending quantities.
