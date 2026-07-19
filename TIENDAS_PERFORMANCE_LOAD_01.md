# TIENDAS-PERFORMANCE-LOAD-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 52/52 PASS

---

## Problema

El dashboard /comercial/tiendas tardaba mas de 1 minuto en cargar. Al abrir el drawer de una tienda, se cargaba TODO el detalle (inventario, faltantes, sugerencias, cobertura textil, bodega principal) en una sola peticion bloqueante.

Causas raiz:
1. **N+1 queries**: `loadSagStoreData` ejecutaba N consultas Prisma independientes (una por tienda)
2. **Zero cache**: cada navegacion re-ejecutaba todas las queries desde cero
3. **Monolithic drawer**: `openStore()` cargaba `store_detail` con TODA la data antes de abrir
4. **No lazy tabs**: todos los tabs renderizaban con data pre-cargada

---

## Solucion

### 1. Batch inventory query (elimina N+1)

```typescript
// ANTES: N queries independientes
for (const store of stores) {
  await getStoreInventoryByWarehouse(orgId, store.id, store.warehouseCode);
}

// DESPUES: 1 query batch
await invDb().findMany({
  where: { organizationId: orgId, warehouseId: { in: warehouseCodes } },
  include: { product: ..., variant: ... },
});
```

Archivo: `lib/comercial/tiendas/sag-store-adapter.ts` — `loadBatchStoreInventory()`

### 2. In-memory TTL cache

| Cache key | TTL | Contenido |
|---|---|---|
| `resolvedData:{orgId}` | 2 min | Stores + inventory + mainStock + rules |
| `policies:{orgId}` | 1 min | StorePolicyRule[] |

Archivo: `lib/comercial/tiendas/store-replenishment-service.ts`

### 3. Per-tab lazy service functions

| Funcion | Proposito |
|---|---|
| `getStoreSummary()` | Store + health only (drawer open) |
| `getStoreShortages()` | Shortages + assortment needs |
| `getStoreSuggestionsLazy()` | Suggestions + assortment needs |
| `getStoreTextileCoverage()` | Textile size/color coverage |
| `getStoreMainWarehouse()` | Main warehouse stock |
| `getStoreInventoryPaginated()` | Paginated inventory with search |

### 4. Per-tab API actions

| Action | Payload |
|---|---|
| `store_summary` | `{ storeId }` |
| `store_shortages` | `{ storeId }` |
| `store_suggestions` | `{ storeId }` |
| `store_textile_coverage` | `{ storeId }` |
| `store_main_warehouse` | `{}` |
| `store_inventory` | `{ storeId, limit?, offset?, search?, activeOnly? }` |
| `stock_lookup` | `{ query }` |
| `store_detail` | `{ storeId }` (legacy, preserved) |

### 5. Client-side lazy loading

- `openStore()` ahora llama `store_summary` (lightweight: store + health + hasRules)
- Drawer se abre instantaneamente con header + KPIs
- Cada tab carga su propia data via `useEffect` cuando el usuario lo selecciona
- Loading state por tab: "Cargando faltantes...", "Cargando sugerencias...", etc.
- `handleCreateProposal` carga sugerencias on-demand (no pre-loaded)

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/sag-store-adapter.ts` | `loadBatchStoreInventory()`, `getInventorySummaryBatch()`, batch queries |
| `lib/comercial/tiendas/store-replenishment-service.ts` | TTL cache, `resolveDataAndPolicies()`, 6 per-tab lazy functions, textileCoverage removed from getStoreDetail |
| `app/api/orgs/[orgSlug]/comercial/tiendas/route.ts` | 8 per-tab API actions |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | `StoreSummaryData`, lazy `openStore()`, self-loading tabs (ShortagesTab, SuggestionsTab, TextileCoverageTab, MainWarehouseTab), on-demand proposal creation |

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `scripts/validate-tiendas-performance-load.ts` | 52 structural checks |

---

## Impacto esperado

| Metrica | Antes | Despues |
|---|---|---|
| Dashboard load | >60s | <5s (cached: <1s) |
| Drawer open | >10s (full detail) | <1s (summary only) |
| Tab switch | Instantaneo (pre-loaded) | <2s (lazy load, cached) |
| Prisma queries per dashboard | N+1 (N stores) | 1 batch |
| Re-navigation (within TTL) | Full reload | Cache hit |

---

## Validaciones

```
=== Results: 52 PASS / 0 FAIL / 52 TOTAL ===
```

Validaciones previas:
- validate-tiendas-textile-size-color-coverage: 55/55 PASS
- validate-tiendas-ruleless-mode: 21/21 PASS
- validate-tiendas-assortment-rules-engine: 45/45 PASS
