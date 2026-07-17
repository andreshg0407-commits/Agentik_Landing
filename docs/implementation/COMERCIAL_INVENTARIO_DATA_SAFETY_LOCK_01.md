# COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01

Sprint: Data safety locks for the commercial inventory pipeline.
Severity: **CRITICAL** — prevents wrong decisions from absent/inferred/stale data.

## Core rule

**Absence of a record does NOT mean zero inventory.**

## Phases implemented

### Phase 1: Fix `?? 0` fallbacks

| File | Line | Pattern | Risk | Fix |
|---|---|---|---|---|
| `vendor-sample-loader.ts` | 222-223 | `importAvailability ?? 0` / `coverage?.disponible ?? 0` | HIGH — triggers false `reemplazar` | `deriveState()` now takes `hasCoverageData`; returns `"sin_datos"` when absent |
| `vendor-sample-loader.ts` | 244 | `importAvailMap.get(ref) ?? 0` | HIGH — triggers false `DEJAR_DE_VENDER` | Explicit `undefined` check; absent → `availableB24 = null`, no scarcity state |
| `vendor-sample-loader.ts` | 960 | `importAvailMap.get(sku) ?? 0` | MILD — counter only | `continue` on absent; don't count as zero stock |
| `maletas-engine.ts` | 78 | `availRecord?.disponible ?? 0` | HIGH — triggers false `sin_stock` alerts | `hasAvailabilityData` flag; absent → `status = "ok"` (prevents alerts) |
| `maletas-engine.ts` | 79-80 | `inventario/pedidos ?? 0` | SAFE | No change — display only |
| `maletas-normalizer.ts` | 184-186 | `raw.inventario ?? 0` | SAFE | No change — defensive on existing records |

### Phase 2: Block decisions with uncertain data

- **Production threshold evaluation** (`evaluateProductionThresholds`): Already gates `EN_VALIDACION` for `SIN_CORRESPONDENCIA` and `DATO_DESACTUALIZADO`. No change needed.
- **Maletas replacement engine** (`applyReplacements`): Already filters `state !== "reemplazar"` — `"sin_datos"` refs naturally excluded.
- **Import recompra** (`evaluateImportRefs`): Added `ref.state === "sin_datos"` skip — prevents `DO_NOT_REBUY` from absent data.
- **Accessory scarcity**: Fixed in Phase 1 — absent PIL → no scarcity evaluation.

### Phase 3: Fix `inferLine()`

**Before:** Defaulted ALL unrecognized SAG line codes to `"CS"` (Castillitos).
**After:** Returns `"OTRO"` for unrecognized codes. Only returns `"LT"` or `"CS"` when evidence is clear.

Added line code `"5"` and `"CONFECCION"` recognition.

Type `SagInventoryNormalizedRow.line` widened from `"LT" | "CS"` to `"LT" | "CS" | "OTRO"`.

### Phase 5: Freshness policy (PROVISIONAL — requires business approval)

Exported explicit constants and classification function from `canonical-warehouse-availability.ts`.

**Thresholds are PROVISIONAL engineering estimates.** Must be validated with Castillitos operations team before declaring final. TODO: make tenant-configurable.

| State | Age | Trust level |
|---|---|---|
| `FRESH` | ≤ 3 days | Full trust — decisions allowed |
| `STALE` | 4–7 days | Operational trust — flag for refresh |
| `EXPIRED` | > 7 days | Block decisions → EN_VALIDACION |
| `ABSENT` | No data | No decisions possible |

Added `freshness: DataFreshness` to `CanonicalAvailabilityResult`.

### Phase 6: Provenance fields

Added to `CanonicalRefAvailability`:

| Field | Type | Purpose |
|---|---|---|
| `subgrupoProvenance` | `DataProvenance` | How subgrupoSag was resolved: SAG_LIVE, SAG_SNAPSHOT, TEXT_INFERRED, HARDCODED, UNKNOWN |
| `availabilityKnown` | `boolean` | Whether a real availability value exists (vs absent) |

### Phase 7: Consolidate LINE_MAPs (PARTIAL — in progress)

**New file:** `lib/comercial/line-map.ts` — single source of truth for SAG line code mappings.

Exports: `LINE_TO_BRAND`, `LINE_TO_SUBLINEA`, `COMMERCIAL_LINES`, `isCommercialLine()`.

Consumers migrated:
- `canonical-warehouse-availability.ts` — uses `LINE_TO_BRAND` from shared map
- `report-loader.ts` — uses `LINE_TO_SUBLINEA` from shared map

**Consumers NOT yet migrated** (pending):
- `sag-inventory-normalizer.ts` — inline `inferLine()` heuristic (returns LT/CS/OTRO)
- `vendor-sample-loader.ts` — inline `"IMPORT"` / `coverage?.line ?? "OTRO"` logic
- `inventory-refresh-pipeline.ts` — inline commercial warehouse filtering
- `_resync-coverage-snapshot.ts` — script with inline `"1"→"LT"`, `"2"→"CS"` map

## Type changes

| Type | Change |
|---|---|
| `SampleState` | Added `"sin_datos"` variant |
| `VendorSampleSnapshot` | Added `sinDatosRefs: number` counter |
| `SagInventoryNormalizedRow.line` | Widened to `"LT" \| "CS" \| "OTRO"` |
| `CanonicalRefAvailability` | Added `subgrupoProvenance`, `availabilityKnown` |
| `CanonicalAvailabilityResult` | Added `freshness: DataFreshness` |

## Files modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-types.ts` | `SampleState` += `"sin_datos"`, `VendorSampleSnapshot` += `sinDatosRefs` |
| `lib/comercial/maletas/vendor-sample-loader.ts` | `deriveState()` gets `hasCoverageData`; accessory scarcity gated; counter fixes |
| `lib/comercial/maletas/vendor-sample-service.ts` | `deriveSampleState()` gets `hasCoverageData`; `sinDatosRefs` counter |
| `lib/comercial/maletas/maletas-engine.ts` | `hasAvailabilityData` flag prevents false alerts |
| `lib/comercial/maletas/maletas-functional-evaluation.ts` | `evaluateImportRefs` skips `sin_datos` refs |
| `lib/comercial/maletas/canonical-warehouse-availability.ts` | Freshness policy, provenance fields, shared line map |
| `lib/integrations/sag/sag-inventory-normalizer.ts` | `inferLine()` returns `"OTRO"` instead of defaulting to `"CS"` |
| `lib/integrations/sag/sag-inventory-contract.ts` | `line` widened to include `"OTRO"` |
| `lib/commercial-intelligence/report-loader.ts` | Uses shared `LINE_TO_SUBLINEA` |
| `lib/comercial/line-map.ts` | NEW — shared line code mappings |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | `sin_datos` state color/label/bg/filter |

## NOT modified

| Component | Status |
|---|---|
| Derrotero rules | No change |
| Ideales editables | No change |
| Production catalog | No change |
| KPI formulas | No change |
| Variants | No change |
| UI layout/structure | No change (only new state tokens added) |

## Verification criteria

- False positives eliminated: refs without availability data no longer trigger `reemplazar`, `sin_stock`, `DEJAR_DE_VENDER`, or `DO_NOT_REBUY`
- Valid data unchanged: refs WITH availability data behave identically to before
- Provenance traceable: every canonical ref has `subgrupoProvenance` and `availabilityKnown`
- Freshness classified: every canonical result has `freshness` state
- `"OTRO"` line refs excluded from all production threshold decisions
- No new TSC errors introduced

## Sprint status: IN_PROGRESS

### Completed phases
- Phase 1: Fix `?? 0` fallbacks
- Phase 2: Block decisions with uncertain data
- Phase 3: Fix `inferLine()` defaulting to CS
- Phase 5: Freshness policy (PROVISIONAL thresholds)
- Phase 6: Provenance fields on canonical output
- Phase 7: LINE_MAP consolidation (PARTIAL — 2 of 6 consumers migrated)

### Pending phases
- Phase 4: Mark `inferProductType`/`inferCategory` outputs as `TEXT_INFERRED`, block from decisions
- Phase 7: Migrate remaining 4 LINE_MAP consumers
- Phase 8: Validate with 8 real-case scenarios (before/after)
- Phase 9: Regression verification — valid cases must not change behavior
- Phase 10: Update counters to exclude `EN_VALIDACION` / `sin_datos`
- Phase 11: Full CCS reader/writer audit (canonical vs legacy classification)

### Open decisions requiring approval
- Freshness thresholds (3/7 days) are provisional — need business validation
- `"OTRO"` line handling: currently excluded from decisions; may need explicit mapping for SAG line codes beyond LT/CS/5
