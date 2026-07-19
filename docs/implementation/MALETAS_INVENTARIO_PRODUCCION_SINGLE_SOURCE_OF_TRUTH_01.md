# MALETAS-INVENTARIO-PRODUCCION-SINGLE-SOURCE-OF-TRUTH-01

Sprint: Fix production suggestions diverging from Inventario by establishing a canonical availability source.

## Root cause

Production and Inventario both query `CommercialCoverageSnapshot` but resolved `subgrupoSag` differently:

- **Inventario (per-ref):** Used live SAG lookup via `subgrupoLookup.get(subgrupoId)` to resolve names
- **Production (stock map):** Used stale CCS `subgrupoSag` column directly

When SAG renames a subgrupo (e.g., "CONJUNTO CC" -> "CONJUNTO NINA KIDS CC"), the stock map key and the ref grouping key diverge -> false `DATOS_INSUFICIENTES` with stock=0 while Inventario shows 260+ units.

## Solution

### Phase 4: Canonical function (`canonical-warehouse-availability.ts`)

**New file:** `lib/comercial/maletas/canonical-warehouse-availability.ts`

Single source of truth for main-warehouse availability. Both Inventario and Production consume this output.

```typescript
getCanonicalMainWarehouseAvailability(db, orgId, subgrupoLookup, subgrupoToGrupoLookup)
```

Returns per reference:
- `reference`, `description`, `line`
- `grupoId`, `grupoSag` (resolved via live SAG)
- `subgrupoId`, `subgrupoSag` (resolved via live SAG, NOT stale CCS)
- `available`, `warehouseCode` ("B01+B04")
- `source` ("CommercialCoverageSnapshot")
- `sourceUpdatedAt`, `dataConfidence` (HIGH/MEDIUM/STALE/ABSENT)

Helper: `buildStockBySubgrupoFromCanonical()` — derives the stock-by-subgrupo map using `productionStockKey()` semantics.

### Phase 5: Stock map resolution fix (`vendor-sample-loader.ts`)

**Before:** Inline CCS query + inline stock map with stale CCS names.
**After:** Calls `getCanonicalMainWarehouseAvailability()` once, derives both `coverageMap` (per-ref) and `centralStockBySubgrupo` (production) from the same canonical result.

Key changes:
- Removed inline `$queryRawUnsafe` CCS query (was lines 163-169)
- Removed inline stock map loop (was lines 436-458)
- Removed inline freshness calc (was lines 460-469)
- Added `buildStockBySubgrupoFromCanonical(canonical, productionStockKey)`
- Uses `canonical.isStale` instead of inline calculation

### Phase 6: Data states (`maletas-functional-evaluation.ts`)

New type `ProductionDataState` with 5 states:

| State | Meaning |
|---|---|
| `STOCK_REAL_CERO` | Valid rows exist, sum = 0 |
| `STOCK_REAL_POSITIVO` | Valid rows exist, sum > 0 |
| `SIN_CORRESPONDENCIA` | No matching key between stock map and ref grouping |
| `DATO_DESACTUALIZADO` | Source exceeds freshness limit (>7 days) |
| `SIN_DATOS` | Source has no data for this brand |

### Phase 7: Safe decisions (`maletas-functional-evaluation.ts`)

New decision: `EN_VALIDACION` — gates all uncertain data away from `PRODUCIR`.

| Condition | Decision |
|---|---|
| Missing stock key | EN_VALIDACION (SIN_CORRESPONDENCIA) |
| Stale snapshot (>7d) | EN_VALIDACION (DATO_DESACTUALIZADO) |
| stock <= umbral, no OP | PRODUCIR |
| stock <= umbral, has OP | ESPERAR_OP |
| stock > umbral | SIN_ACCION |
| Unknown brand | DATOS_INSUFICIENTES (SIN_DATOS) |

### Phase 9: Counter fix (`maletas-client.tsx`)

Production counter in nav now counts `PRODUCIR` decisions only (was PRODUCIR + ESPERAR_OP).

### Phase 10: UI (`maletas-client.tsx`)

Production table: 8 columns (Marca | Grupo | Subgrupo | Stock | Umbral | OP Activa | Estado datos | Decision).

- Stock shows "--" for SIN_CORRESPONDENCIA/SIN_DATOS
- `EN_VALIDACION` uses `C.amber` color
- Data state column: "Cero real", "Dato real", "Sin cruce", "Desactualizado", "Sin datos"

## Files modified

| File | Change |
|---|---|
| `lib/comercial/maletas/canonical-warehouse-availability.ts` | NEW — canonical availability function |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Replaced inline CCS query + stock map with canonical calls |
| `lib/comercial/maletas/maletas-functional-evaluation.ts` | Added ProductionDataState, EN_VALIDACION, dataState field |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | 8-column production table, counter fix |

## Metrics NOT modified

| Metric | Status |
|---|---|
| En maleta | No change |
| Salud comercial | No change |
| Presencia catalogo | No change |
| Derroteros | No change |
| Ideales editables | No change |
| Recompra | No change |
| Oportunidades | No change |

## Verification

- TSC: zero errors in target files
- No new TSC errors introduced
- Forensic audit script: `scripts/_audit-production-inventory-reconciliation.ts`
