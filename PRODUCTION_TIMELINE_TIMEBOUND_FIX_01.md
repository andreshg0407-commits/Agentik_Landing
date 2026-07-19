# PRODUCTION-TIMELINE-TIMEBOUND-FIX-01

**Sprint:** PRODUCTION-TIMELINE-TIMEBOUND-FIX-01
**Status:** COMPLETE
**TSC Baseline:** 160 (unchanged)
**Date:** 2026-06-30

---

## Problem

The production timeline loader applied `sinceDate` independently to both OPs (`WHERE documentDate >= sinceDate`) and events (`WHERE eventDate >= sinceDate`). When an OP was created just before the filter boundary but its CN/ET events fell inside the window, orphan timelines appeared — events without their parent OP.

These orphan timelines were classified as `partial` (no OP event), counted as active, and inflated every executive KPI:

| Metric | Before (EVENT_BOUND) | After (OP_BOUND) | Inflation |
|---|---|---|---|
| Active | 104 | **46** | +126% |
| Stalled (>30d) | 59 | **6** | +883% |
| Critical alerts (>60d) | 56 | **3** | +1767% |
| Orphan partials | 58 | **0** | -- |
| Completed | 584 | **584** | 0% |

## Root Cause

Independent WHERE clauses in `loadProductionTimelineSnapshot()`:

```
-- OPs: WHERE documentDate >= sinceDate
-- Events: WHERE eventDate >= sinceDate (independent)
```

An OP created 2025-06-15 (before sinceDate 2025-06-30) with CN events on 2025-07-10 would include the CN but not the OP, creating a timeline with no OP event.

## Solution: OP_BOUND Mode

New `ProductionTimeboundMode` type with two modes:

- **OP_BOUND** (new default): OPs define period membership. All CN/ET events for authorized OPs are included regardless of eventDate. Two-pass approach:
  1. Load OPs within date range
  2. Build `authorizedKeys` set from OP document numbers (applying group key strategy)
  3. Load ALL CN/ET events (no sinceDate filter)
  4. Filter in JS: keep only events whose stripped ref matches an authorized key

- **EVENT_BOUND** (legacy): Independent sinceDate on OPs and events. Preserved for backward compatibility.

## Files Modified

| File | Change |
|---|---|
| `lib/production-timeline/production-timeline-types.ts` | Added `ProductionTimeboundMode` type |
| `lib/production-timeline/production-timeline-loader.ts` | Added `timeboundMode` option (default: `"OP_BOUND"`), OP_BOUND branch with authorized-key filtering, `applyGroupKeyStrategyLocal()` helper |
| `lib/production-timeline/index.ts` | Added `ProductionTimeboundMode` to barrel exports |

## Files Created

| File | Purpose |
|---|---|
| `scripts/_production-timebound-fix-validation.ts` | READ ONLY validation script comparing EVENT_BOUND vs OP_BOUND |

## Validation Results

```
AUDIT TARGET COMPARISON
  Activas              | Target:   46 | Actual:   46 | MATCH
  Detenidas            | Target:    6 | Actual:    6 | MATCH
  Alertas criticas     | Target:    3 | Actual:    3 | MATCH
  Completadas          | Target:  584 | Actual:  584 | MATCH
  Orphan partials      | Target:    0 | Actual:    0 | MATCH
```

## Design Decisions

1. **OP_BOUND as default** — The OP is the authoritative anchor for production lifecycle. Events belong to their OP, not to a calendar window.

2. **Two-pass loading** — Loads all events then filters in JS rather than building a complex SQL IN clause. Acceptable for current scale (~50K events).

3. **Guard clause** — OP_BOUND only activates when `sinceDate` is set AND `groupBy === "productionOrderRef"`. Other groupings or no-filter queries fall through to EVENT_BOUND.

4. **Local group key strategy** — `applyGroupKeyStrategyLocal()` duplicates the strip logic to avoid circular imports from the builder module.

5. **No consumer changes** — All callers (production-operations-service, page.tsx) use the default, which is now OP_BOUND. No API changes required.

## Predecessor Sprints

- PRODUCTION-TIMELINE-01 — Timeline builder and loader
- PRODUCTION-TIMELINE-HARDENING-01 — Source/stage config, group key strategy
- PRODUCTION-STAGE-ACTIVATION-01 — Stage classification engine
- PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01 — Operations snapshot
- PRODUCTION-EXECUTIVE-DASHBOARD-01 — Executive snapshot wiring
- PRODUCTION-EXECUTIVE-TIMEBOUND-VALIDATION-01 — Forensic audit identifying the defect
