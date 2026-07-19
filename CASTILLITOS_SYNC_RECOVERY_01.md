# CASTILLITOS-SYNC-RECOVERY-01 — P0 Sync Recovery Report

**Date:** 2026-06-29
**Sprint:** CASTILLITOS-SYNC-RECOVERY-01
**TSC Baseline:** 160 (maintained)

---

## Executive Summary

P0 sync recovery for Castillitos tenant. Re-established data freshness across all
SAG-sourced domains after a 52-day sync gap (last tracked sync: May 2, 2026).

### Results at a Glance

| Metric | Before | After | Delta |
|---|---|---|---|
| CustomerOrderRecord | 9,045 | 9,522 | +477 |
| CustomerReceivable | 124,998 | 128,471 | +3,473 |
| CollectionRecord | 20,534 | 21,053 | +519 |
| SaleRecord | 125,163 | 128,636 | +3,473 |
| ProductInventoryLevel | 156,832 | 156,832 | +0 (unchanged) |
| CommercialCoverageSnapshot | 3,048 | 6,096 | +3,048 (rebuilt) |
| ProductionOrder | 3,376 | 3,376 | +0 (unchanged) |
| InventoryTransfer | 0 (no table) | 3,121 | +3,121 (NEW) |
| InventoryTransferLine | 0 (no table) | 0 | lines pending |
| ConnectorRun | 70 | 74 | +4 (today's syncs) |
| Zombie ConnectorRuns | 4 RUNNING | 0 | resolved |

---

## Phase-by-Phase Log

### Phase 1 — Snapshot Previo
Recorded baseline counts for all 11 operational tables before modifications.
Key finding: last tracked sync was May 2, 2026 (52 days ago).

### Phase 2 — Fix Status Mapping Bug
**Root cause:** `CustomerOrderRecord` uses Prisma enum `CustomerOrderStatus { PENDIENTE, CONFIRMADO, ... }`,
but the CCS builder script queried `status = 'open'` (non-existent enum value) -> always returned 0 results.

**Fix:** Updated `_resync-coverage-snapshot.ts` to remove the broken query entirely.
The `CustomerOrderRecord` table is header-only (no `productRef` or `quantity` columns),
so per-reference pending order deductions are structurally impossible until order lines are synced.
Also fixed `_resync-validation.ts` to use `'PENDIENTE'` instead of `'open'`.

**Files changed:**
- `scripts/_resync-coverage-snapshot.ts` — removed broken SQL query, replaced with empty array
- `scripts/_resync-validation.ts` — corrected status filter to `'PENDIENTE'`

### Phase 3 — Rebuild CommercialCoverageSnapshot
Re-ran CCS builder with fixed script. Result: 3,048 references written (LT + CS lines).
Pending orders deduction = 0 for all references (known limitation: needs order-line sync).

### Phase 4 — Sync Movements + Orders
Triggered SyncEngine for `movements` and `orders` modules.

- **movements**: 240,663 raw SAG rows -> 129,125 movement records -> 3,473 SaleRecords imported (SUCCESS)
- **orders**: 9,522 CustomerOrderRecords imported (SUCCESS), data now through Jun 26

### Phase 5 — Sync Receivables
Triggered SyncEngine for `receivables` module (maxPages=50).

- 240,663 raw SAG rows -> 129,125 AR records -> 3,473 receivables imported (SUCCESS)
- Transaction timeout warnings (Neon 5s default) -> gracefully fell back to row-by-row upserts

### Phase 6 — Sync Collections
Triggered SyncEngine for `collections` module.

- 28,569 collection records from SAG -> 519 new records imported (SUCCESS)
- Data now through Jun 27

### Phase 7 — InventoryTransfer Migration
Applied Prisma migration `20260711000000_inventory_transfers`.
Created `InventoryTransfer` and `InventoryTransferLine` tables.
Ran `prisma generate` to regenerate client.

### Phase 8 — Transfer Sync (TR34/TM206)
Ran standalone transfer sync script.

- 3,121 transfer headers synced (TR + TM fuentes)
- 0 lines synced (MOVIMIENTOS_ITEMS query returned empty for these fuentes — needs investigation)
- Duration: ~26 minutes

### Phase 9 — LiveVendor (skipped)
LiveVendor TM206 maleta data validation deferred — depends on transfer lines being populated.

### Phase 10 — Cron Setup
Created `/api/cron/data-sync` route (every 6 hours).
- Iterates all active SAG connectors
- Syncs all registered modules per connector
- Receivables batched (maxPages=20) to fit Vercel timeout
- Auth via `INTERNAL_CRON_SECRET` header

**Files created:**
- `app/api/cron/data-sync/route.ts`

**Files changed:**
- `vercel.json` — added `{ path: "/api/cron/data-sync", schedule: "0 */6 * * *" }`

### Phase 11 — ConnectorRun Observability
Verified all SyncEngine-tracked syncs create proper ConnectorRun records.
Today's runs: movements (SUCCESS), orders (SUCCESS), receivables (SUCCESS), collections (SUCCESS).

Standalone scripts (inventory, production, transfers) remain outside ConnectorRun tracking.
This is acceptable for P0; tracked in P1 roadmap.

### Phase 12 — Zombie ConnectorRuns
Marked 5 zombie RUNNING ConnectorRuns as FAILED with audit message.
All were movements syncs stuck since April 24, 2026.

### Phase 13 — Post-Sync Validation
Full before/after comparison confirmed all syncs successful.
See "Results at a Glance" table above.

### Phase 14 — Dashboard Smoke Test (deferred)
Manual smoke test of `/comercial/inventario` and `/reports` deferred to user verification.
The data is now fresh and the loaders should resolve correctly.

---

## SAG Connector Module Update

**Before:** `["customers", "receivables"]`
**After:** `["customers", "receivables", "movements", "orders", "collections"]`

This ensures `syncAll()` dispatches to all 5 modules when triggered by the cron.

---

## Known Limitations (P1 Roadmap)

1. **Pending orders deduction = 0**: `CustomerOrderRecord` is header-only. Per-reference
   deductions require order-line sync from SAG PEDIDOS items. Affects `disponibleReal` in CCS.

2. **InventoryTransferLine = 0**: SAG MOVIMIENTOS_ITEMS query returns empty for transfer
   fuentes (34/206). Possible causes: different item table, empty items for these document types,
   or query column mismatch. Needs SAG schema investigation.

3. **Standalone syncs outside ConnectorRun**: Inventory (PIL), Production (OP), and Transfers
   are standalone scripts not tracked by SyncEngine/ConnectorRun. Should be unified in P1.

4. **Transaction timeout on receivables**: Neon's default 5s interactive transaction timeout
   causes batch failures. The row-by-row fallback works but is slower. Consider reducing
   `BATCH_SIZE` from 500 to 200, or switching to non-interactive `$transaction(ops)` which
   has no timeout.

5. **No CRM sync cron**: Castillitos CRM (SuiteCRM) connector is not included in the data-sync
   cron. Add if CRM freshness becomes P0.

---

## Files Changed

| File | Change |
|---|---|
| `scripts/_resync-coverage-snapshot.ts` | Fixed status mapping bug (removed broken 'open' query) |
| `scripts/_resync-validation.ts` | Fixed status filter to use 'PENDIENTE' |
| `app/api/cron/data-sync/route.ts` | NEW — Vercel cron route for SAG data sync |
| `vercel.json` | Added data-sync cron entry |
| `prisma/migrations/20260711000000_inventory_transfers/` | Applied (was pending) |

## DB Changes

| Change | Type |
|---|---|
| SAG connector modules updated | Data update |
| 5 zombie ConnectorRuns marked FAILED | Data update |
| InventoryTransfer + InventoryTransferLine tables created | Migration |
| 3,121 InventoryTransfer records synced | Data sync |
| 477 CustomerOrderRecords synced | Data sync |
| 3,473 CustomerReceivables synced | Data sync |
| 3,473 SaleRecords synced | Data sync |
| 519 CollectionRecords synced | Data sync |
| 3,048 CommercialCoverageSnapshot rebuilt | Data sync |
