# TIENDAS-POLICY-UX-AND-STOCK-LOOKUP-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 26/26 PASS

---

## Summary

Made Tiendas module usable for real store operations by unifying the rules UX, adding a live inventory tab with stock lookup, and providing rule templates for faster configuration.

---

## Changes

### FASE 1 — Tab unification

Unified "Reglas" and "Politica" tabs into a single "Reglas de surtido" tab. Eliminated the confusing split between `StoreReplenishmentRule` (stub-only) and `StorePolicyRule` (full CRUD).

- Tab order: Inventario > Faltantes > Sugerencias > Reglas de surtido > Bodega principal
- "Reglas de surtido" renders `PolicyTab` (with full add/remove CRUD via `/api/orgs/_/comercial/tiendas/policies`)
- Old `RulesTab` component preserved for backward compatibility but no longer rendered

### FASE 2 — Inventario tab

New `InventarioTab` component shows real-time store inventory:
- Summary strip: total references, total units, zero-stock count
- Search/filter by reference, product name, size, or color
- Paginated to 200 rows with truncation notice
- Lazy-loads via API (`store_inventory` action) — no pre-compute at render time
- Sync-aware: shows empty state message when store has no sync data

### FASE 3 — Store inventory API

Added `store_inventory` action to `POST /api/orgs/[orgSlug]/comercial/tiendas`:
- Takes `storeId` + `warehouseCode`
- Calls `getStoreInventoryByWarehouse()` from sag-store-adapter
- Returns `{ inventory: InventoryItem[] }`

### FASE 5 — Rule templates

Added `RULE_TEMPLATES` with 5 preset configurations:
- Textil basico (line scope, 1/1/2)
- Textil detallado (line+subgroup, 1/2/3)
- Accesorio (class scope, 1/2/4)
- Voluminoso (class scope, 1/1/1)
- Tienda global (store scope, 2/4/6)

Templates appear as pill buttons at the top of `AddPolicyRuleForm` and pre-fill scope, class, and thresholds.

### FASE 7-9 — Stock lookup / availability

Click any inventory row to see availability across all locations:
- `StockLookupPanel` component shows results grouped by "Bodega principal" and "Otras tiendas"
- `stock_lookup` API action searches main warehouse + first 5 stores for a reference
- Uses `getMainWarehouseAvailability()` and `getStoreInventoryByWarehouse()` from sag-store-adapter
- Results limited to 100 items per query

---

## Files Changed

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Tab unification, InventarioTab, StockLookupPanel, rule templates |
| `app/api/orgs/[orgSlug]/comercial/tiendas/route.ts` | `store_inventory` + `stock_lookup` API actions |
| `scripts/validate-tiendas-policy-ux.ts` | **NEW** — 26-check validation script |

---

## What This Sprint Does NOT Do

- Does not touch Control Comercial, Maletas, or Pedidos
- Does not create real movements or write to SAG
- Does not change SAG adapter logic
- Does not modify engine internals (replenishment, suggestions, scoring)
- Does not remove PolicyTab or AddPolicyRuleForm — they are reused under the "Reglas de surtido" label
