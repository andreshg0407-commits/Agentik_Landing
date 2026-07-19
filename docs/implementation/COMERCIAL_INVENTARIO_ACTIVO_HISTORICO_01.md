# COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01

Sprint: Inventory Active/Historical/No-Data Segmentation

## Summary

Separates the inventory universe (4,048 references) into three visibility segments:

| Segment | Criteria | Count |
|---|---|---|
| **Activos** | `disponibleReal > 0` | ~2,800 |
| **Agotados** | `disponibleReal <= 0` AND availability data exists | ~771 |
| **Sin datos** | No availability record in source bodegas | ~477 |

Default view: **Activos** (only items with real stock).

## Architecture

### Derived State (no persistence)

Visibility is computed, never stored:

```typescript
// lib/inventory/inventory-control-types.ts
export type InventoryVisibility = "ACTIVE" | "OUT_OF_STOCK" | "NO_DATA";

export function deriveInventoryVisibility(
  disponibleReal: number,
  hasAvailabilityData: boolean,
): InventoryVisibility {
  if (!hasAvailabilityData) return "NO_DATA";
  if (disponibleReal > 0) return "ACTIVE";
  return "OUT_OF_STOCK";
}
```

### Automatic Reactivation

When SAG reports stock > 0, `disponibleReal` becomes positive, and `deriveInventoryVisibility()` returns `"ACTIVE"` automatically. No manual intervention needed.

### NO_DATA vs OUT_OF_STOCK

- **OUT_OF_STOCK**: Item has real data from bodegas but quantity is zero or negative (operationally exhausted).
- **NO_DATA**: Item exists in ProductEntity but has no ProductInventoryLevel records in source bodegas (26/27 for accessories). This means SAG has never synced stock data for these items.

Textile items always have `hasAvailabilityData = true` because they come from `CommercialCoverageSnapshot`.

## Files Modified

| File | Change |
|---|---|
| `lib/inventory/inventory-control-types.ts` | Added `InventoryVisibility` type, `deriveInventoryVisibility()` pure function, `inventoryVisibility` field on `InventoryItem`, visibility counts on `InventoryHealth` |
| `lib/inventory/inventory-control-service.ts` | Computes `inventoryVisibility` for textile (always has data) and accessories (checks PIL existence). Health includes `activeCount`/`outOfStockCount`/`noDataCount` |
| `app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx` | Added visibility tabs (Activos/Agotados/Sin datos), default tab = ACTIVE, pre-filters items by visibility before operational filters, tab-aware empty states and KPI strip |

## Files Created

| File | Purpose |
|---|---|
| `scripts/_audit-inventario-activo-historico.ts` | Phase 1 audit — initial data distribution analysis |
| `scripts/_validate-inventario-activo-historico.ts` | Phase 8 validation — 12 checks proving classification correctness |

## Constraints Honored

1. No data deletion — all 4,048 refs remain accessible
2. No second source of truth — visibility is derived, never persisted
3. No Prisma schema changes — no new columns or tables
4. No SAG adapter changes — read-only consumption
5. Automatic reactivation — pure function, no stored state to go stale
6. Mutual exclusivity — every item is in exactly one bucket
