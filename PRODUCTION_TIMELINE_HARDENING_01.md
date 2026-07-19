# PRODUCTION-TIMELINE-HARDENING-01 — Timeline Architecture Hardening

**Sprint:** PRODUCTION-TIMELINE-HARDENING-01
**Date:** 2026-06-29
**Prerequisite:** PRODUCTION-TIMELINE-01 (APPROVED WITH CHANGES)
**Objective:** Remove SAG-specific hardcoding from ProductionTimeline layer

---

## Problems Found (from architectural audit)

### HC-01: Loader hardcoded SAG identity in OP synthesis
`production-timeline-loader.ts` hardcoded `sourceSystem: "SAG"`, `sourceRawCode: "33"`, `sourceRawName: "Orden de Produccion"`, `stageTo: "orden_produccion"` when synthesizing ProductionOrder → ProductionEvent.

### HC-02: `extractGroupKey()` SAG-specific dash-strip
`production-timeline-builder.ts` used `ref.indexOf("-")` to strip sequence suffix, assuming SAG ss_remision format `{OP#}-{sequence}`. An ERP using `PO-2024-001` would be truncated to `PO`.

### HC-04: `expectedStages` hardcoded
`production-timeline-metrics.ts` hardcoded `["confeccion_externa", "servicios"]` as required stages. Tenants without confeccion externa would be incorrectly marked NOT READY.

---

## Changes Applied

### New: `ProductionTimelineSourceConfig` (types.ts)
```typescript
interface ProductionTimelineSourceConfig {
  sourceSystem: ProductionSourceSystem;
  opSourceDocumentType: string;
  opSourceRawCode: string;
  opSourceRawName: string;
  opStageTo: string;
  groupKeyStrategy: ProductionTimelineGroupKeyStrategy;
}
```

### New: `ProductionTimelineGroupKeyStrategy` (types.ts)
```typescript
type ProductionTimelineGroupKeyStrategy =
  | "exact"                      // Use ref as-is (safe default)
  | "sag-remision-dash-strip";   // "3380-1" → "3380"
```

### New: `ProductionTimelineStageConfig` (types.ts)
```typescript
interface ProductionTimelineStageConfig {
  requiredStages: string[];   // Must be observed for ready=true
  optionalStages: string[];   // Informational, not blocking
}
```

### Config Presets (types.ts)
| Preset | Purpose |
|---|---|
| `SAG_PYA_SOURCE_CONFIG` | Castillitos/SAG PYA: sourceSystem=SAG, dash-strip, fuente 33 |
| `CASTILLITOS_STAGE_CONFIG` | requiredStages=["confeccion_externa", "servicios"] |
| `DEFAULT_SOURCE_CONFIG` | Safe defaults: CUSTOM, exact, no SAG assumptions |
| `DEFAULT_STAGE_CONFIG` | No required stages, no assumptions |

### New: `production-order-synthesis.ts`
Shared pure module with `synthesizeOpEvent()` and `prismaRowToProductionEvent()`. Used by both loader (server-only) and validation scripts. Eliminates HC-03 duplication.

### Updated: `production-timeline-builder.ts`
- `BuildTimelinesInput.groupKeyStrategy` optional parameter (default: "exact")
- `extractGroupKey()` delegates to `applyGroupKeyStrategy()`
- Two strategies: "exact" (passthrough) and "sag-remision-dash-strip"

### Updated: `production-timeline-metrics.ts`
- `buildProductionTimelineSnapshot()` accepts optional `stageConfig`
- `assessStageReadiness()` uses config instead of hardcoded array
- No config → no required stages → readiness depends on observed data

### Updated: `production-timeline-loader.ts`
- `LoadTimelineOptions.sourceConfig` and `stageConfig` optional parameters
- `prismaOrderToProductionEvent()` removed, replaced by shared `synthesizeOpEvent()`
- `prismaEventToProductionEvent()` removed, replaced by shared `prismaRowToProductionEvent()`

### Updated: `scripts/_production-timeline-01.ts`
- Uses `SAG_PYA_SOURCE_CONFIG` and `CASTILLITOS_STAGE_CONFIG` from presets
- Uses shared `synthesizeOpEvent()` and `prismaRowToProductionEvent()` — no duplicated logic

---

## Group Key Strategy

| Strategy | Behavior | When to use |
|---|---|---|
| `exact` | `"PO-2024-001"` → `"PO-2024-001"` | Default for unknown ERPs |
| `sag-remision-dash-strip` | `"3380-1"` → `"3380"` | SAG PYA ss_remision format |

The "exact" strategy is the safe default. No truncation, no assumptions about ref format.

---

## Stage Configuration

| Config | requiredStages | optionalStages |
|---|---|---|
| `DEFAULT_STAGE_CONFIG` | `[]` | `[]` |
| `CASTILLITOS_STAGE_CONFIG` | `["confeccion_externa", "servicios"]` | `[]` |

With `DEFAULT_STAGE_CONFIG`, readiness only requires at least one observed stage — no blockers from assumed stages.

---

## Castillitos Validation

All metrics unchanged after hardening:

| Metric | Before | After |
|---|---|---|
| Total timelines | 3,387 | 3,387 |
| COMPLETE | 3,302 (97%) | 3,302 (97%) |
| PARTIAL | 54 (2%) | 54 (2%) |
| INCOMPLETE | 31 (1%) | 31 (1%) |
| Avg OP→ET | 44 days | 44 days |
| Median OP→ET | 40 days | 40 days |
| Total material cost | $334.6M COP | $334.6M COP |
| Chronological consistency | 3,371/3,387 | 3,371/3,387 |

### Correctness improvement
Previously, `servicios` was listed as a missing stage even though it IS observed in ET events (as `stageFrom`). The new config-driven approach correctly identifies only `confeccion_externa` as missing.

---

## Multi-ERP Validation

25/25 tests passed:

| Test | Result |
|---|---|
| "exact" preserves multi-segment IDs (PO-2024-001, MO-ABC-999, etc.) | PASS |
| "sag-remision-dash-strip" merges SAG sequences (3380-1, 3380-2 → 3380) | PASS |
| "exact" keeps SAG-style refs separate (contrast test) | PASS |
| Default config uses "exact" strategy | PASS |
| Default stage config has no required stages | PASS |
| Stage readiness with Castillitos config flags missing stages | PASS |

---

## Impact on Stage Activation (PRODUCTION-STAGE-ACTIVATION-01)

| Before | After |
|---|---|
| `extractGroupKey` would truncate multi-ERP IDs | Safe: "exact" default preserves all formats |
| `expectedStages` hardcoded, wrong for non-Castillitos | Stage config per tenant, no hardcoded assumptions |
| Loader fabricated SAG events regardless of tenant | Source config drives OP synthesis |
| OP synthesis duplicated between loader and script | Shared `synthesizeOpEvent()` — single source of truth |

**PRODUCTION-STAGE-ACTIVATION-01 can now proceed safely** — the timeline layer no longer inherits SAG-specific assumptions.

---

## Files Modified

| File | Change |
|---|---|
| `lib/production-timeline/production-timeline-types.ts` | +3 types, +4 config presets, JSDoc fix |
| `lib/production-timeline/production-timeline-builder.ts` | Group key strategy parameter |
| `lib/production-timeline/production-timeline-metrics.ts` | Stage config parameter |
| `lib/production-timeline/production-timeline-loader.ts` | Source config + shared synthesis |
| `lib/production-timeline/production-order-synthesis.ts` | **NEW** — shared OP synthesis |
| `lib/production-timeline/index.ts` | Updated barrel exports |
| `scripts/_production-timeline-01.ts` | Uses config presets + shared functions |
| `scripts/_production-timeline-hardening-01.ts` | **NEW** — multi-ERP validation |

---

## TSC Validation

**Baseline: 160 errors — maintained. Zero new errors.**

---

## Risks Remaining

1. **Revenue data** still unavailable — profitability readiness stays NOT READY
2. **confeccion_externa** stage still missing — requires syncing fuentes PC/EC/T1/T2/Y1
3. **Custom group key functions** not yet supported — only "exact" and "sag-remision-dash-strip"
4. **OP synthesis** still requires a `ProductionOrder` Prisma model — ERPs without separate OP model need adaptation
