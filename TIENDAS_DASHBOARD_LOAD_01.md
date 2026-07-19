# TIENDAS-DASHBOARD-LOAD-01 — Hotfix Report

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)

---

## Root Cause

`page.tsx` had a blocking waterfall that called `resolveData()` (full SAG load) N+3 times:

1. `getStoresWorkspace(orgId)` — 1 call to `resolveData()`
2. `getStoreCopilotSignals(orgId)` — calls `getStoresWorkspace()` AGAIN + `resolveData()` AGAIN = 2 more calls
3. `for (card of workspace.stores)` → `getStoreDetail(orgId, card.store.id)` — N calls to `resolveData()`, one per store

Each `resolveData()` runs `loadSagStoreData()` which queries:
- `discoverPilWarehouses` (distinct PIL warehouse IDs)
- `getWarehouseMap` (admin config from AgentExecution)
- `loadWarehouseLookup` (cached BODEGAS names)
- `getMainWarehouse` (main warehouse resolution)
- `getStoreInventoryByWarehouse` per store (PIL + CRM variant queries)
- `getMainWarehouseAvailability` (PIL + CommercialCoverageSnapshot)

For Castillitos with multiple stores, this produced a cascade of dozens of DB queries blocking the initial server render.

---

## Fix Applied

### 1. page.tsx — Eliminated N+2 redundant loads

**Before:** 3 sequential server calls + N store detail calls (all blocking render)

**After:**
- Block 1: `getStoresWorkspace()` — single SAG load, wrapped in try/catch
- Block 2: `getStoreCopilotSignals()` — wrapped in try/catch, empty on failure
- Removed: `getStoreDetail()` loop — no longer called at render time

If workspace load fails, the page renders with empty stores and a degraded metadata label. Signals failure shows empty — never crashes the module.

### 2. Store detail — Lazy-loaded via API

Created `app/api/orgs/[orgSlug]/comercial/tiendas/route.ts` with `store_detail` action.

Client `openStore()` changed from synchronous prop lookup to async API call:
- Opens drawer immediately (shows "Cargando detalle...")
- Fetches detail via POST
- Populates drawer when response arrives
- On failure: drawer stays open with empty state

### 3. Client cleanup

- Removed `storeDetails` from Props interface
- Removed `storeDetails` from component destructuring
- Added loading state to drawer (shown while detail is fetching)

---

## Files Changed

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/tiendas/page.tsx` | Removed N+2 blocking calls, added try/catch per block |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Removed `storeDetails` prop, lazy-load via API, loading state in drawer |
| `app/api/orgs/[orgSlug]/comercial/tiendas/route.ts` | **NEW** — store_detail API endpoint |

---

## What This Hotfix Does NOT Do

- Does not add features
- Does not touch engines (replenishment, suggestions, replacement, guides)
- Does not change SAG adapter logic
- Does not modify data contracts or types
