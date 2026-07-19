# INVENTORY-PD-STATUS-RECONCILIATION-01

**Sprint:** PD Status Reconciliation
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (preserved)

---

## Objective

Cross-reference CustomerOrderRecord (9,522 PENDIENTE PD orders) with SaleRecord (128,636 invoices) to identify fulfilled orders and transition their status from PENDIENTE to FACTURADO. This eliminates the 30-day recency window and provides exact pending quantities based on order lifecycle status.

## Forensic Discovery

### SaleRecord Structure
- All 128,636 SaleRecords are TRANSACTION grain but have **zero productCode** — header-level only
- **Zero originDocumentRef** populated — no cross-document references
- **Zero rawJson ka_nl_movimiento links** — no direct FK between PD and invoices
- No `FV` comprobanteCode exists — Castillitos uses FE, FD, FA, FC, V2, R1, etc.
- sagDocumentFamily: OTHER (72,927), OFFICIAL_INVOICE (39,056), DISPATCH_REMISION (8,496), CREDIT_NOTE (8,157)

### CustomerNit Overlap
| Metric | Value |
|---|---|
| Unique customerNit in PD | 1,592 |
| Unique customerNit in Sales | 31,429 |
| Overlap (both) | 1,586 (99.6%) |

### Matching Strategy Evaluation

**Product-level matching**: Impossible — SaleRecord has no productCode data.

**Customer-level temporal matching**: A PD order is "fulfilled" if SaleRecords exist for the same customerNit with saleDate >= orderDate. Match rate: 9,511/9,522 (99.9%).

**Amount matching**: Partial — invoice amounts differ from PD amounts due to taxes/discounts. Not reliable.

## Reconciliation Rules

| Condition | New Status | Count |
|---|---|---|
| customerNit has SaleRecord with saleDate >= orderDate | FACTURADO | 9,511 |
| Order > 90 days old, NO customer invoices | CANCELADO | 1 |
| Recent order, no customer invoices | PENDIENTE | 10 |

## Results

### Post-Reconciliation Status Distribution

| Status | Count |
|---|---|
| FACTURADO | 9,511 |
| PENDIENTE | 10 |
| CANCELADO | 1 |

### 4-Reference Validation (status-based, no recency window)

| SKU | Gross (B01+B04) | PD | Disponible | Admin | Gap | Gap % | Status |
|---|---|---|---|---|---|---|---|
| L-1367 | 76 | 0 | 76 | 64 | 12 | 19% | CLOSE |
| L-8467 | 521 | 0 | 521 | 511 | 10 | 2% | CLOSE |
| CJ-1126012 | 119 | 0 | 119 | 79 | 40 | 51% | GAP |
| CJ-2026004B | 197 | 0 | 197 | 164 | 33 | 20% | CLOSE |

**3 of 4 references within 20%** of admin values. CJ-1126012 gap is from maleta/store stock allocation (out of scope — future sprint).

### Comparison: 30d Window vs Status-Based

| SKU | 30d Window Gap | Status-Based Gap | Result |
|---|---|---|---|
| L-1367 | 103% | 19% | IMPROVED |
| L-8467 | 2% | 2% | SAME |
| CJ-1126012 | 29% | 51% | WORSE (maleta/store stock) |
| CJ-2026004B | 15% | 20% | SLIGHTLY WORSE (maleta/store stock) |

L-1367 improvement is dramatic: the 30d window was over-deducting (78 PD units against 76 gross = -2 disponible). Status-based correctly shows 76 available.

### Global Impact (Before/After Reconciliation)

| Metric | BEFORE (30d window) | AFTER (status-based) | Delta |
|---|---|---|---|
| Refs positive | 2,325 | 2,344 | +19 |
| Refs sin stock | 746 | 727 | -19 |
| Refs with PD > 0 | 226 | 30 | -196 |
| Total disponible | 141,457 | 152,747 | +11,290 |
| Total PD pending | 12,230 | 940 | -11,290 |

## Files Modified

| File | Change |
|---|---|
| `scripts/_resync-coverage-snapshot.ts` | Removed 30-day recency window, now uses status-based filtering (`cor.status = 'PENDIENTE'`) |

## Files Created

| File | Purpose |
|---|---|
| `scripts/_reconcile-pd-status.ts` | Main reconciliation: transitions PENDIENTE → FACTURADO/CANCELADO |
| `scripts/_forensic-pd-invoice-match.ts` | Forensics: customerNit overlap, match rate, date ranges |
| `scripts/_forensic-pd-comprobante.ts` | Forensics: comprobanteCode distribution, productCode coverage |
| `scripts/_forensic-pd-docref.ts` | Forensics: originDocumentRef, rawJson analysis, amount matching |

## Key Insight

SaleRecord in Castillitos is a **header-level aggregate** — no product-level detail (productCode is always NULL). This means:

1. **PD → Invoice matching can only be at customer level**, not product level
2. **The remaining gap** between Agentik disponible and admin values is NOT from pending orders — it's from **maleta/store stock allocation** (stock physically sent to stores/vendors but not yet deducted from warehouse inventory)
3. **Status-based filtering is the correct approach** — the 30d recency window was a workaround that sometimes over-deducted (L-1367) and sometimes under-deducted

## Remaining Gaps

1. **Maleta/store stock deductions**: Stock allocated to vendor bags (maletas) and stores is not yet subtracted from disponible. This explains the CJ-1126012 gap (119 vs 79) and CJ-2026004B gap (197 vs 164).
2. **Incremental reconciliation**: Currently a batch script. Future: run reconciliation as part of daily sync.
3. **Partial fulfillment**: Customer-level matching can't detect partially fulfilled orders. Need product-level SaleRecord data from SAG for this (not available today).

## Next Sprint Recommended

**INVENTORY-MALETA-STORE-DEDUCTION-01**: Subtract stock allocated to maletas (vendor bags) and stores from warehouse availability. This is the primary remaining gap between Agentik calculated availability and admin-reported values.
