# VENDOR-SAMPLE-PRESENCE-ENGINE-01

**Sprint:** VENDOR-SAMPLE-PRESENCE-ENGINE-01
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Prerequisite:** INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01 (forensics)

---

## Root Cause (from forensics)

F34 transfers (TRASLADO ENTRE BODEGAS) write to `movimientos_traslados`, NOT `MOVIMIENTOS_ITEMS`. The old PIL-based engine queried `MOVIMIENTOS_ITEMS` via `SAG_VARIANT_INVENTORY_QUERY` and never saw vendor bodega inventory. Additionally, the warehouse ID mapping was wrong (ss_codigo vs ka_nl_bodega).

## Architecture Change

**Before:** PIL (ProductInventoryLevel) queried with ss_codigo warehouse IDs (35-40). Wrong table, wrong IDs. Showed import warehouse data as vendor maleta data.

**After:** SAG SOAP direct queries to `movimientos_traslados` using ka_nl_bodega (45-50). Computes F34 net balance (IN-OUT) per vendor per reference. Binary presence model (present = netBalance > 0).

## Key Decisions

1. **Binary presence, not quantities.** Maletas are mostrario (sample bags). Max 1 unit per reference. UI shows "present" or "not present", not quantities.
2. **F34 as sole source.** All vendor inventory comes from `movimientos_traslados`. PIL is no longer queried for vendor bodegas.
3. **ka_nl_bodega as warehouse ID.** Internal PK (45-50), not external code (35-40).
4. **Sequential SAG queries.** One balance query + one transfer metadata query per active vendor. Sequential to respect SAG rate limits (10/min).
5. **TEXTIL/IMPORT separation.** Only LT/CS generate production suggestions. IMPORT refs are excluded.

## Vendor Bodega Mapping (corrected)

| Vendor | ka_nl_bodega | ss_codigo (old, wrong) | Active |
|---|---|---|---|
| ORLANDO | 45 | 35 | Yes |
| CARLOS_LEON | 46 | 36 | Yes |
| LUIS | 47 | 37 | No (inactive) |
| NESTOR | 48 | 38 | Yes |
| CARLOS_VILLA | 49 | 39 | Yes |
| FREDY | 50 | 40 | No (inactive) |

## Expected Ref Counts (from forensics audit)

| Vendor | Expected Refs | Status |
|---|---|---|
| Orlando (45) | ~209 | Active |
| Carlos Leon (46) | ~259 | Active |
| Luis (47) | 0 | Inactive (all returned) |
| Nestor (48) | ~240 | Active |
| Carlos Villa (49) | ~271 | Active |
| Fredy (50) | ~4 | Inactive |

## Type Changes

### VendorSampleRef

| Field | Before | After |
|---|---|---|
| `quantityInBag` | PIL quantity (wrong data) | Removed |
| `present` | — | New: F34 net balance > 0 |
| `lastTransferDate` | — | New: most recent F34 inbound |
| `sourceWarehouse` | — | New: origin bodega of last transfer |
| `ageInDays` | null (never used) | Removed |

### ProductionSuggestion

| Field | Before | After |
|---|---|---|
| `samplesInField` | Sum of bag quantities | Removed |
| `vendorsWithPresence` | — | New: count of vendors carrying ref |

### VendorSampleSnapshot

| Field | Change |
|---|---|
| `warehouseCode` | Now uses ka_nl_bodega (45-50), not ss_codigo (35-40) |
| `totalUnits` | Now equals totalRefs (presence-based, 1 per ref) |

## UI Changes

### Summary Strip
- Removed: "Unidades distribuidas" KPI
- Added: "Sugerencias produccion" KPI

### Vendor Cards
- Removed: "Unidades" metric
- Added: "Saludables" metric

### Drawer Table Columns
- Before: Ref, Descripcion, Linea, **Maleta**, Central, Min, Estado
- After: Ref, Descripcion, Linea, Central, Estado, **Traslado**, **Origen**

### Drawer KPIs
- Removed: "Unidades"
- Added: "Riesgo" (risk + replace count)

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-presence-engine.ts` | **NEW** — F34-based presence engine |
| `lib/comercial/maletas/vendor-sample-types.ts` | Replace quantityInBag with presence fields |
| `lib/comercial/maletas/vendor-sample-loader.ts` | **REWRITTEN** — SAG SOAP instead of PIL |
| `lib/comercial/maletas/vendor-sample-service.ts` | Fix warehouse codes (45-50), presence model |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | Remove qty UI, add transfer date/origin |

## SAG Query Pattern

```sql
-- Balance query (per vendor bodega)
SELECT
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  mt.ss_talla, mt.ss_color,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = {BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = {BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = {BOD} OR mt.ka_nl_bodega_origen = {BOD})
GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo, mt.ss_talla, mt.ss_color
HAVING net_qty > 0
```
