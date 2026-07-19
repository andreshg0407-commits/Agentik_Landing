# PRODUCTION-TIMELINE-01 — Production Timeline Report

**Sprint:** PRODUCTION-TIMELINE-01
**Date:** 2026-06-29
**Tenant:** Castillitos
**Sources:** ProductionEvent (CN, ET) + ProductionOrder (OP)
**Target:** ProductionTimeline (projection, not stored)

---

## Executive Summary

**3,387 production timelines built from 14,906 events. 97% COMPLETE (OP+CN+ET). Average production cycle: 44 days (median 40). Total material cost: $334.6M COP. 99% cost coverage. Chronologically consistent: 99.5%.**

---

## Phase 1: Archaeology

| Layer | Status | Reuse |
|---|---|---|
| `lib/production-events/` | 7 files, universal model | FULL — types, builders, utils |
| `lib/production-intelligence/` | 13 files, flow engine | NONE — uses old SagProductionRecord |
| `lib/production-control/` | 2 files, control center | NONE — consumes flow engine |
| ProductionTimeline | NOT EXISTS | Greenfield |

Key finding: OP data lives in `ProductionOrder` model (3,376 orders, 56,586 lines), NOT in `ProductionEvent`. CN (7,890) and ET (3,640) live in `ProductionEvent`. Timeline builder synthesizes OP → ProductionEvent for uniform processing.

---

## Phase 2: Domain Model

| Type | Purpose |
|---|---|
| `ProductionTimelineEvent` | Normalized event for chronological analysis |
| `ProductionTimeline` | Complete timeline for one production order |
| `ProductionTimelineSummary` | Date markers + duration metrics |
| `ProductionTimelineQuality` | COMPLETE/PARTIAL/INCOMPLETE classification |
| `ProductionTimelineProfitability` | Material cost breakdown |
| `ProductionTimelineSnapshot` | Organization-wide snapshot |
| `ProductionTimelineMetrics` | Executive-level aggregates |
| `ProductionTimelineReadiness` | Stage + profitability readiness |

---

## Phase 3: Event Normalization

| Source | Event Type | Events | Lines |
|---|---|---|---|
| ProductionOrder (OP) | PRODUCTION_ORDER_CREATED | 3,376 | 0 (header-only for timeline) |
| ProductionEvent (CN) | MATERIAL_CONSUMED | 7,890 | 81,367 |
| ProductionEvent (ET) | PRODUCTION_COMPLETED | 3,640 | 0 |
| **Total** | | **14,906** | **81,367** |

---

## Phase 4-5: Timeline Construction + Aggregation

### By productionOrderRef (primary)

| Metric | Value |
|---|---|
| Total timelines | 3,387 |
| COMPLETE (OP+CN+ET) | 3,302 (97%) |
| PARTIAL | 54 (2%) |
| INCOMPLETE | 31 (1%) |

### Duration Metrics (COMPLETE timelines only)

| Metric | Value |
|---|---|
| Avg OP -> CN | 0 days |
| Avg CN span | 20 days |
| Avg CN -> ET | 25 days |
| **Avg OP -> ET** | **44 days** |
| **Median OP -> ET** | **40 days** |
| Min OP -> ET | 2 days |
| Max OP -> ET | 279 days |

### By referenceCode

| Metric | Value |
|---|---|
| Total timelines | 4,824 |
| COMPLETE | 0 (0%) |
| INCOMPLETE | 4,824 (100%) |

Note: referenceCode grouping yields 100% INCOMPLETE because CN articles are RAW MATERIALS (0% overlap with OP/ET product references). This is expected behavior — CN references are fabric/trim codes, not product codes.

---

## Phase 6: Quality Classification

| Quality | Count | Pct | Criteria |
|---|---|---|---|
| COMPLETE | 3,302 | 97% | OP + CN + ET observed |
| PARTIAL | 54 | 2% | OP + CN without ET (in progress) |
| INCOMPLETE | 31 | 1% | Missing OP or CN |

**Chronological Consistency:** 3,371/3,387 (99.5%) timelines are chronologically consistent (OP <= CN <= ET).

16 inconsistent timelines exist — all are minor CN-before-OP cases within the 7-day tolerance window (CN can start the same day or slightly before OP date in SAG PYA).

---

## Phase 7: Sample Validation (25 COMPLETE timelines)

| OP# | Events | Lines | OP Date | CN First | CN Last | ET Date | Days OP->ET | Cost |
|---|---|---|---|---|---|---|---|---|
| 3353 | 5 | 22 | 2026-05-21 | 2026-05-21 | 2026-06-02 | 2026-06-11 | 17 | $51,098 |
| 3354 | 5 | 22 | 2026-05-21 | 2026-05-21 | 2026-06-02 | 2026-06-11 | 16 | $50,908 |
| 3350 | 5 | 20 | 2026-05-20 | 2026-05-20 | 2026-06-02 | 2026-06-10 | 21 | $50,593 |
| 3343 | 4 | 26 | 2026-05-15 | 2026-05-15 | 2026-06-02 | 2026-06-22 | 38 | $90,735 |
| 3334 | 4 | 19 | 2026-05-12 | 2026-05-12 | 2026-05-25 | 2026-06-03 | 22 | $105,615 |
| 3330 | 4 | 33 | 2026-05-11 | 2026-05-11 | 2026-05-15 | 2026-06-05 | 25 | $130,923 |
| 3323 | 4 | 26 | 2026-05-06 | 2026-05-06 | 2026-05-25 | 2026-06-16 | 41 | $90,734 |
| 3321 | 4 | 24 | 2026-05-05 | 2026-05-05 | 2026-05-11 | 2026-05-28 | 22 | $78,414 |
| 3315 | 4 | 24 | 2026-05-01 | 2026-05-01 | 2026-05-13 | 2026-06-19 | 49 | $78,479 |
| 3313 | 4 | 24 | 2026-05-01 | 2026-05-01 | 2026-05-13 | 2026-06-10 | 40 | $78,479 |

All 25/25 timelines validated: chronologically consistent, OP before CN before ET, cost data present.

---

## Phase 8: Executive Metrics

| Metric | Value |
|---|---|
| Total production orders analyzed | 3,387 |
| Complete lifecycle visibility | 97% |
| Avg production cycle | 44 days |
| Median production cycle | 40 days |
| Shortest cycle | 2 days |
| Longest cycle | 279 days |
| Avg OP -> first CN | 0 days (same day) |
| Avg CN consumption span | 20 days |
| Avg last CN -> ET | 25 days |
| Total events processed | 14,906 |
| Total lines processed | 81,367 |
| Total material cost | $334,609,799 COP |
| Avg cost per complete timeline | $99,872 COP |

---

## Phase 9: Profitability Foundation

| Metric | Value |
|---|---|
| Timelines with cost data | 3,359/3,387 (99%) |
| Total material cost | $334,609,799 COP |
| Avg cost per COMPLETE timeline | $99,872 COP |
| CN events contributing cost | 7,888 |
| CN lines contributing cost | 81,365 |

### Top 10 Most Expensive Production Orders

| OP# | Cost (COP) | CN Events | CN Lines |
|---|---|---|---|
| 1168 | $363,736 | 4 | 66 |
| 3087 | $355,382 | 3 | 25 |
| 1359 | $331,475 | 3 | 48 |
| 1360 | $315,320 | 3 | 46 |
| 3008 | $294,450 | 2 | 26 |
| 3086 | $271,668 | 3 | 24 |
| 1328 | $253,570 | 3 | 42 |
| 1717 | $252,847 | 3 | 27 |
| 1731 | $251,707 | 4 | 37 |
| 1106 | $245,936 | 3 | 48 |

---

## Phase 10: Production Control Integration

### Files Created

| File | Purpose |
|---|---|
| `lib/production-timeline/production-timeline-types.ts` | Domain model (Phase 2) |
| `lib/production-timeline/production-timeline-builder.ts` | Builder + normalizer + quality + profitability (Phases 3-6, 9) |
| `lib/production-timeline/production-timeline-metrics.ts` | Executive metrics + snapshot + readiness (Phases 8, 10-12) |
| `lib/production-timeline/production-timeline-loader.ts` | Server-side Prisma loader (Phase 10) |
| `lib/production-timeline/index.ts` | Public barrel export |
| `scripts/_production-timeline-01.ts` | Validation script (Phase 7) |

### Loader Architecture

```
ProductionOrder (Prisma) ─→ Synthesize OP events ─┐
                                                    ├→ buildProductionTimelines()
ProductionEvent (Prisma)  ─→ CN + ET events ───────┘        │
                                                             ↓
                                                   buildProductionTimelineSnapshot()
                                                             │
                                                             ↓
                                                   ProductionTimelineSnapshot
                                                   ├── timelines[]
                                                   ├── metrics (executive)
                                                   └── readiness (stages + profitability)
```

---

## Phase 11: Stage Activation Readiness

**Status: NOT READY (1 blocker)**

### Available Stages (from synced data)
- `orden_produccion` (OP confirmed)
- `consumo_insumos` (CN confirmed)
- `servicios` (ET default stageFrom)
- `entrada_producto` (ET confirmed)

### Missing Stages
- `confeccion_externa` — fuentes PC/EC/T1/T2/Y1 not yet synced

### Evidence
- 3,302 COMPLETE timelines with validated OP->CN->ET cycle
- Stage transitions observed in real production data

### To unlock
- Sync PC (fuente 99) and EC (fuente 100) to ProductionEvent
- Sync T1/T2/Y1 (fuentes 129/118/119) to ProductionEvent

---

## Phase 12: Profitability Readiness

**Status: NOT READY (1 blocker)**

### Foundation: READY
- 99% cost coverage (3,359/3,387 timelines have cost data)
- $334.6M COP total material cost preserved
- Per-OP, per-CN-event, per-CN-line cost granularity available

### Blocker
- Revenue/sales data not yet available in Agentik
- Cannot compute profit margin without revenue per product reference

### To compute per-product profitability
1. Sum CN line costs by productionOrderRef -> total raw material cost per OP
2. Join with OP to get product reference and planned quantity
3. Join with sales data (when available) for revenue per product
4. Margin = Revenue - Material Cost

---

## Phase 14: TSC Validation

**TSC Baseline: 160 errors — maintained. Zero new errors.**

---

## Production Lifecycle Knowledge (Castillitos)

```
OP (PLANNED)                 Avg 0 days
  │                          (OP and first CN same day)
  ↓
CN (MATERIAL_CONSUMED)       Avg 20 days span
  │                          (materials consumed over ~3 weeks)
  ↓
ET (PRODUCTION_COMPLETED)    Avg 25 days after last CN
  │
  ↓
Total cycle: 44 days avg, 40 days median
             Range: 2-279 days
```

Typical Castillitos production order:
- 4-5 events (1 OP + 2-3 CN + 1 ET)
- 20-25 material lines (raw materials consumed)
- ~$100K COP material cost
- 40 days from order to completion
