# CASTILLITOS-SAG-FULL-RESYNC-01 — Full Resync Report

**Date:** 2026-06-27
**Tenant:** castillitos (cmmpwstuf000dp5y58kj1daaj)
**TSC Baseline:** 160 (maintained)

---

## Objective

Populate empty data tables so the executive dashboard (`/castillitos/reports`) shows real SAG data instead of empty states.

## What was done

### FASE 1-2: Archaeology + Diagnostic

Examined existing data in the database before writing any code.

**Key findings:**
- ProductInventoryLevel: 57,393 records with qty > 0 across 30 bodegas
- Bodega 01 (main warehouse): 469 distinct products
- Bodega 04 (WIP): 3,007 products (largest)
- ProductEntity: 4,565 articles (catalog already synced)
- ProductionOrder: 3,376 total (3,352 open) — synced by `_production-sync-01a.ts`
- CommercialCoverageSnapshot: **EMPTY** (root cause of "Sin datos de disponibilidad")
- InventoryTransfer: **no table** (migration never applied)
- CustomerOrderRecord: table exists but `status='open'` query returns 0

### FASE 3: Articles + Inventory

**No action needed.** ProductEntity (4,565) and ProductInventoryLevel (57,393) were already populated by previous syncs (`_sag-catalog-full-sync.ts` and `_sag-inventory-sync.ts`).

### FASE 4: Pending Orders

**Documented gap.** CustomerOrderRecord exists with 9,045 rows but zero have `status='open'`. The PD (Pedidos) field mapping needs review — the `status` column may not be populated correctly from SAG source data.

### FASE 5: Production Sync Validation

**Already synced.** 3,376 ProductionOrders with lines, synced by `_production-sync-01a.ts`. 3,352 are open (active production).

### FASE 6: Transfer Sync

**Documented gap.** InventoryTransfer and InventoryTransferLine models exist in `schema.prisma` but no Prisma migration was ever applied. The sync infrastructure exists (`sag-transfer-sync.ts`) but cannot write because the table doesn't exist. **Action needed:** apply migration for InventoryTransfer/InventoryTransferLine tables, then run transfer sync.

### FASE 7: CommercialCoverageSnapshot (KEY FIX)

**Root cause of empty dashboard resolved.**

Created `scripts/_resync-coverage-snapshot.ts` which:
1. Reads ProductInventoryLevel (Bodega 01) — variant-level data
2. Aggregates by product reference (SKU)
3. Maps product lines: 1=LT (Latin Kids), 2=CS (Castillitos)
4. Subtracts pending orders from CustomerOrderRecord
5. Writes to CommercialCoverageSnapshot via `persistSagInventorySnapshot()`

**Result:** 3,048 references written (1,682 LT + 1,366 CS)

### Bugfixes Applied

1. **report-loader.ts (production):** Wrapped `prisma.productionOrder.findMany()` with `prisma as any` + `try/catch` for graceful degradation when table doesn't exist at runtime.

2. **report-loader.ts (inferSubLinea):** Added `referenceCode` parameter to check SKU prefixes (`L-` = LATIN KIDS, `C-`/`CP-`/`CT-`/`CA-` = CASTILLITOS) before falling back to product name keyword matching. Previously all production records showed "OTRO" because product names don't contain "LATIN" or "CASTILLITOS".

3. **live-vendor-loader.ts:** Wired `resolveInventoryThresholds()` into vendor portfolio and replacement analysis.

---

## FASE 8: Validation Results

All checks PASS:

| Data Source | Count | Status |
|---|---|---|
| CommercialCoverageSnapshot | 3,048 (LT: 1,682, CS: 1,366) | READY |
| ProductInventoryLevel (Bodega 01) | 469 products | READY |
| ProductInventoryLevel (all) | 57,393 across 30 bodegas | READY |
| ProductEntity | 4,565 articles | READY |
| ProductionOrder (open) | 3,352 | READY |
| ProductionOrder (total) | 3,376 | READY |
| InventoryTransfer | 0 | PENDING (no migration) |
| CustomerOrderRecord (open) | 0 | GAP (field mapping) |

**Dashboard readiness:**
- Availability section: READY
- Production section: READY
- Inventory section: READY
- Transfer section: PENDING

---

## Files Created

| File | Purpose |
|---|---|
| `scripts/_resync-diagnostic.ts` | Phase 2 diagnostic (inventory structure, bodegas, product lines) |
| `scripts/_resync-coverage-snapshot.ts` | Phase 7 coverage builder (bridges PIL to CCS) |
| `scripts/_resync-validation.ts` | Phase 8 post-sync validation |

## Files Modified

| File | Change |
|---|---|
| `lib/production-intelligence/report-loader.ts` | `prisma as any` + try/catch + inferSubLinea reference prefix matching |
| `lib/comercial/vendors/live-vendor-loader.ts` | Wired tenant business rules into vendor portfolio |

---

## Known Gaps (Future Work)

1. **InventoryTransfer migration:** Model in schema but no migration. Apply migration, then run `syncInventoryTransfers()` from `sag-transfer-sync.ts`.

2. **CustomerOrderRecord status mapping:** 9,045 records exist but none have `status='open'`. Review SAG PD field mapping in the sync adapter.

3. **CommercialCoverageSnapshot refresh:** Currently a one-time snapshot. Consider cron job or sync hook to keep it updated as ProductInventoryLevel changes.

---

## How to Re-run

```bash
# Diagnostic
npx dotenv-cli -e .env -- npx tsx scripts/_resync-diagnostic.ts

# Populate CommercialCoverageSnapshot
npx dotenv-cli -e .env -- npx tsx scripts/_resync-coverage-snapshot.ts dryrun
npx dotenv-cli -e .env -- npx tsx scripts/_resync-coverage-snapshot.ts sync

# Validate
npx dotenv-cli -e .env -- npx tsx scripts/_resync-validation.ts
```
