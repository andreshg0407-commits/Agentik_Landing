# VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01

**Status:** COMPLETE
**Date:** 2026-07-01
**Depends on:** VENDOR-SAMPLE-REPLACEMENT-INTELLIGENCE-01, VENDOR-SAMPLE-OP-ACTIVE-FILTER-01

---

## Objective

Include IMPORT/accessory references (productLine=5) in the Maletas vendor sample system with scarcity alerts. When an IMPORT ref has low inventory across import source warehouses, vendors are told to stop selling it.

## Key Discovery: B24 is NOT the Import Warehouse

The sprint spec referenced B24 as the import source. Audit proved **B24 has zero IMPORT refs**. Real import stock lives in:

| Warehouse | Quantity | Role |
|-----------|----------|------|
| **B36** | 49,109 | Primary import source |
| **B37** | 33,247 | Secondary import source |

Source: `ProductInventoryLevel` aggregated by `ProductEntity.productLine = "5"`.

## Scarcity Rule

```
disponible_B36_B37 = SUM(GREATEST(PIL.quantity, 0)) WHERE warehouseId IN ('36', '37')

IF disponible_B36_B37 <= 10 THEN
  state = "escasez"
  action = "DEJAR_DE_VENDER"
ELSE
  state = "saludable"
  action = null
```

- Threshold constant: `IMPORT_SCARCITY_MINIMUM = 10` (vendor-sample-types.ts)
- Source warehouses: `IMPORT_SOURCE_WAREHOUSES = ["36", "37"]` (vendor-sample-types.ts)

## Integration with Maletas

### What IMPORT refs DO get:
- Scarcity state badge (escasez/saludable)
- `centralImportAvailable` field showing B36+B37 aggregated stock
- `accessorySuggestedAction: "DEJAR_DE_VENDER"` when in scarcity
- Executive summary KPIs: accessoryRefs, accessoryScarcityRefs
- Dedicated `AccessoryScarcityPanel` in vendor drawer
- Filter chip "Accesorios escasez" in drawer filter bar

### What IMPORT refs do NOT get:
- Replacement suggestions (excluded from replacement engine)
- OP linking (no production orders for imports)
- Production suggestions (imports are purchased, not manufactured)
- Recompra/replenishment automation (future sprint)

### Exclusion enforcement:
In `vendor-sample-loader.ts`, `applyReplacements()` skips import refs:
```typescript
if (ref.isAccessory) continue; // IMPORT refs excluded from replacement engine
```

## Identification

IMPORT refs identified by `ProductEntity.productLine = "5"`:
- 657 total refs across 52 SAG subgrupos
- Categories: ALIMENTACION, CUIDADO DENTAL, ASEO, JUGUETES, ACCESORIOS, etc.

## Validation Results (27/27 PASS, 100%)

```
Global Import Scarcity Stats:
  Total IMPORT refs: 657
  Saludable (>10): 179 (27%)
  Escasez (<=10): 478 (73%)
  Source warehouses: B36+B37
  Minimum threshold: 10
```

- All availability values matched direct PIL queries
- No IMPORT refs found in CoverageSnapshot (confirmed)
- IMPORT refs correctly excluded from replacement engine

## Files Modified

| File | Changes |
|------|---------|
| `lib/comercial/maletas/vendor-sample-types.ts` | AccessoryScarcityState type, IMPORT constants, new fields on VendorSampleRef/Snapshot/Summary |
| `lib/comercial/maletas/vendor-sample-loader.ts` | loadImportAvailability(), loadImportRefSet(), import detection in ref construction, exclusion in applyReplacements() |
| `lib/comercial/maletas/vendor-sample-service.ts` | Default accessory field values for service-path refs |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | AccessoryScarcityPanel, accesorios_escasez filter, KPI strip, StateBadge accessory variant |

## Limitations

1. **No recompra automation** — detecting scarcity does not trigger purchase orders
2. **PIL data freshness** — depends on SAG sync frequency for warehouse quantities
3. **No vendor-specific import bodegas** — uses global B36+B37, not per-vendor import warehouses
4. **73% in scarcity** — high percentage suggests many IMPORT refs have minimal or zero stock; may need business review of threshold

## Future Work

**ACCESSORY-REPLENISHMENT-INTELLIGENCE-01** — Automatic import replenishment:
- Detect sustained scarcity patterns
- Generate purchase order suggestions to international suppliers
- Track reorder points and lead times
- Integration with procurement/compras module

## TSC Baseline

Maintained at **160 errors** (all pre-existing). Zero new errors introduced.
