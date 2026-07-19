# TIENDAS-INVENTORY-01 — Sprint Report

## Objetivo
Determinar por que el modulo Tiendas no recibe inventario real por tienda/bodega y reparar el flujo de lectura para que el motor de reposicion funcione con datos reales.

## Root Cause

**Stores (billing channels) ≠ Warehouses (physical stock locations).**

The adapter discovered "stores" from SaleRecord (billing channels derived from FUENTES comprobante codes: FA→"Almacen A", FC→"Almacen C", etc.) and used their slugs as warehouse codes to query ProductInventoryLevel. But PIL stores SAG `ka_nl_bodega` numeric PKs ("10", "11", "13") as `warehouseId`. These are completely different namespaces.

```
BEFORE (broken):
  SaleRecord.storeSlug="almacen-a" → PIL.warehouseId="almacen-a" → 0 records

AFTER (fixed):
  PIL.warehouseId="11" + BODEGAS.name="BODEGA SANDIEGO" → 15,910 records
```

SAG BODEGAS has **no warehouse named "Almacen A/C/D/G"**. Those names come from FUENTES (invoicing document types), not physical warehouses. The real retail stores are franchise locations like "F1 - PAQUE BERRIO", "BODEGA SANDIEGO", "GRAN PLAZA", etc.

## Data Inventory (Castillitos)

| Source | Records | Warehouses |
|---|---|---|
| ProductInventoryLevel | 157,101 | 39 distinct |
| BODEGAS (SAG) | 49 | — |
| Retail warehouses with PIL data | 15 | — |
| Main warehouse (BODEGA PRINCIPAL, id=10) | 50,430 | — |

### Retail Stores Discovered (with real PIL data)

| warehouseId | Name | PIL Records |
|---|---|---|
| 11 | BODEGA SANDIEGO | 15,910 |
| 31 | BODEGA CENTRO | 10,351 |
| 32 | GRAN PLAZA | 8,015 |
| 12 | BODEGA MAYORCA | 7,484 |
| 39 | BODEGA CALDAS | 5,852 |
| 17 | F1 - PAQUE BERRIO | 383 |
| 19 | F3 - BOLIVAR | 467 |
| 18 | F6 - BELLO | 434 |
| 20 | F7 - ARMENIA | 328 |
| 21 | F9 - PEREIRA | 319 |
| 22 | F16 - CENT MAY BOGOT | 344 |
| 23 | F17 - MAYORCA | 342 |
| 24 | F10 - IBAGUE | 353 |
| 38 | PLAN SEPARE | 354 |
| 52 | DEXCATO. MC | 354 |

## Fix Summary

### New files
- `lib/comercial/tiendas/sag-warehouse-lookup.ts` — BODEGAS cache service (load/save via AgentExecution, warehouse classification helpers)
- `scripts/_populate-sag-warehouse-cache.ts` — One-time script to fetch SAG BODEGAS and persist the lookup
- `scripts/validate-tiendas-inventory.ts` — 17-check validation (17/17 PASS)

### Modified files
- `lib/comercial/tiendas/sag-store-adapter.ts` — Core fix:
  - **Store discovery**: Changed from `discoverSagStores()` (SaleRecord billing channels) to `discoverPilWarehouses()` (PIL warehouse IDs)
  - **Warehouse name resolution**: Uses cached BODEGAS lookup via `loadWarehouseLookup()`
  - **Store filtering**: Only shows retail warehouses (franchise stores, named locations), hides production/import/salesperson warehouses
  - **Main warehouse**: Resolves from BODEGAS cache (finds "BODEGA PRINCIPAL" = id 10)
  - **Inventory queries**: `sagWarehouseCode` now contains the SAG `ka_nl_bodega` PK, matching PIL `warehouseId` directly

### Not modified
- No Prisma schema changes
- No engine changes (store-replenishment-engine.ts)
- No provider interface changes
- No UI changes
- No SAG adapter changes (sag-pya-soap/)
- No sync pipeline changes

## Validation Results

```
17 PASS / 0 FAIL

1. BODEGAS cache record exists                              PASS
2. Cache contains warehouses array                          PASS
3. Cache has 49 warehouses                                  PASS
4. PIL records exist (157,101)                              PASS
5. PIL has multiple warehouses (39)                         PASS
6. PIL warehouseIds match BODEGAS cache keys (39/39 = 100%) PASS
7. Retail warehouses identified (17)                        PASS
8. Main warehouse found (10 = BODEGA PRINCIPAL)             PASS
9. Main warehouse has PIL data (50,430 records)             PASS
10-12. Per-store PIL queries return data                    PASS x3
13. Adapter discovers 15 retail stores                      PASS
14. Old query warehouseId='almacen-a' returns 0 (bug)       PASS
15. Old query warehouseId='tienda-web' returns 0 (bug)      PASS
16. New query warehouseId='11' returns 15,910               PASS
```

## TSC Baseline
160 errors (unchanged)

## Architecture Decisions

1. **BODEGAS lookup cached in AgentExecution** — Same pattern as StoreWarehouseMappingConfig. No schema changes needed. Refreshable via script or during inventory sync.

2. **Retail warehouse classification is rule-based** — Uses name patterns (F-prefix for franchises, known location names). New warehouses added in SAG will need the cache refreshed and may need classification rules updated.

3. **Admin config takes priority** — If warehouse mappings are configured via the admin UI, those override auto-discovery. This allows manual control over which warehouses appear as stores.

4. **Main warehouse fallback chain**: admin config → BODEGAS "BODEGA PRINCIPAL" → warehouse "10" (heuristic).
