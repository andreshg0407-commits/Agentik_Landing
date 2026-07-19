# PRODUCTION-SYNC-01A — OP Snapshot Read Model

**Date:** 2026-06-25
**Status:** COMPLETE
**Tenant:** Castillitos
**Mode:** READ-ONLY against SAG

---

## Model Created

### Prisma Models

**ProductionOrder** — OP header from SAG MOVIMIENTOS (fuente 33)

| Field | Type | Source |
|---|---|---|
| id | cuid | Agentik PK |
| organizationId | String | Org FK |
| erpMovId | Int | ka_nl_movimiento — stable SAG PK |
| documentNumber | String | n_numero_documento |
| sourceCode | String | "OP" |
| sourceName | String | "Orden de Produccion" |
| status | String | open / closed / unknown |
| isClosed | Boolean | sc_dcto_cerrado = 'S' |
| documentDate | DateTime | d_fecha_documento |
| createdBy | String? | sc_beneficiario |
| remisionRef | String? | ss_remision |
| warehouseCode | String? | ka_nl_bodega |
| warehouseName | String? | sc_detalle_bodega |
| rawJson | Json | Full SAG row |

Unique constraint: `@@unique([organizationId, erpMovId])`

**ProductionOrderLine** — OP line item from MOVIMIENTOS_ITEMS

| Field | Type | Source |
|---|---|---|
| id | cuid | Agentik PK |
| organizationId | String | Org FK |
| productionOrderId | String | FK to ProductionOrder |
| erpItemId | Int | ka_nl_movimiento_item — stable SAG PK |
| referenceCode | String | k_sc_codigo_articulo from v_articulos |
| productName | String? | sc_detalle_articulo |
| size | String? | ss_talla |
| color | String? | ss_color |
| quantityOrdered | Float | n_cantidad |
| unitCost | Float? | n_valor_unitario |
| lineTotal | Float? | qty * unitCost |
| rawJson | Json | Full SAG item row |

Unique constraint: `@@unique([organizationId, erpItemId])`

### Domain Types

`lib/production/production-types.ts`
- `ProductionOrderStatus` = "open" | "closed" | "unknown"
- `ProductionOrderSnapshot` — normalized OP header
- `ProductionOrderLineSnapshot` — normalized OP line
- `ProductionSyncResult` / `ProductionSyncMetrics` / `ProductionSyncError`

### Normalizer

`lib/connectors/adapters/sag-pya-soap/production/sag-production-normalizer.ts`
- `normalizeOpHeader(row)` — SAG MOVIMIENTOS row to header snapshot
- `normalizeOpLine(row)` — SAG MOVIMIENTOS_ITEMS row to line snapshot
- `buildProductionSnapshots(headers, items)` — groups headers with their items

### Sync Service

`lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts`
- `syncProductionOrders(opts)` — full sync pipeline
- Supports: dryRun, incremental (sinceDate), batched transactions (50 OPs/batch)
- Idempotent via Prisma upsert on unique constraints

### Read Services

`lib/production/production-read-service.ts`
- `getRecentProductionOrders(orgId, { days, limit })`
- `getProductionByReference(orgId, refCode)`
- `getOpenProductionByReference(orgId, refCode)`
- `getProductionSummary(orgId)` — aggregate counts
- `getProductionByReferenceSummary(orgId, { onlyOpen, limit })` — grouped by ref

---

## Data Synced

| Metric | Value |
|---|---|
| OP leidas | 3,376 |
| OP sincronizadas | 3,376 |
| Lineas OP leidas | 56,586 |
| Lineas OP sincronizadas | 56,586 |
| OP abiertas | 3,352 |
| OP cerradas | 24 |
| Referencias unicas | 3,167 |
| Match ProductEntity | 94.9% (3,007 / 3,167) |
| Match ProductVariant | 0.0% (variant SKUs use different format) |
| Errores | 0 |
| Sync duration | ~110 min (full initial load to Neon DB) |
| Idempotency | VERIFIED (0 creates on re-sync) |

---

## Limitations

### What we CAN say

- "Referencia CJ-1026066B tiene 3 ordenes de produccion abiertas en 2026."
- "Referencia L-3560 tiene OP activa con 625 unidades ordenadas."
- "En los ultimos 30 dias se crearon 30 ordenes de produccion nuevas."
- "94.9% de las referencias en produccion existen en el catalogo de productos."

### What we CANNOT say yet

- "Referencia X tiene N unidades **pendientes** de produccion."
  - Requiere validar la relacion OP -> Entrada PT (fuente 116), que permanece sin resolver.
- "La OP #3382 ya fue completada."
  - `sc_dcto_cerrado` no es confiable (99.3% nunca se cierra).
  - No hay mecanismo confirmado para saber si una OP se cumplio.
- "Esta referencia agotada tiene produccion activa."
  - Las referencias agotadas actuales (mascotas, bebes) son importadas, no manufacturadas.
  - Las OP contienen referencias de confeccion (CJ-*, L-*, DA-*, H-*).

### Unmatched references (160 / 3,167 = 5.1%)

Mostly new references not yet in the product catalog:
- DA-9040, DA-9042, DA-9038 — new designs
- CJ-2026053B, CJ-1026082B — 2026 season conjuntos
- H-5012 through H-5016 — new hombres line
- L-9117, L-9118 — new lineas

These will match automatically once the product catalog syncs new items.

---

## Next Steps

1. **PRODUCTION-LINKAGE-INVESTIGATION-01** — Discover the OP->ET cross-reference mechanism by tracing intermediate fuentes (80, 117, etc.)
2. **INFORMES-EJECUTIVOS-PRODUCCION-01** — Wire production read services into executive dashboard
3. **Incremental sync** — Use `sinceDate` for daily cron (already supported by the sync service)

---

## File Map

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | ProductionOrder + ProductionOrderLine models |
| `lib/production/production-types.ts` | Domain types |
| `lib/production/production-read-service.ts` | Read services for queries |
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-normalizer.ts` | SAG row normalizer |
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts` | Sync engine |
| `scripts/_production-sync-01a.ts` | Full sync + validation script |
| `scripts/_production-idempotency-check.ts` | Idempotency verification |

---

## TSC Baseline

**160** — zero new errors introduced.
