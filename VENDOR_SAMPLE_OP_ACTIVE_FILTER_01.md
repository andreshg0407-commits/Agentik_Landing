# VENDOR-SAMPLE-OP-ACTIVE-FILTER-01

**Sprint:** VENDOR-SAMPLE-OP-ACTIVE-FILTER-01
**Priority:** P0
**Type:** Business Logic Filter
**Status:** COMPLETE
**Date:** 2026-07-01
**TSC Baseline:** 160 (preserved)

---

## Root Cause

The OP linking engine (OP-LINKING-01) used a naive filter:

```sql
status = 'open' AND "isClosed" = false
```

SAG never closes old OPs. This included 3,042 zombie OPs dating back to November 2020. The Maletas drawer showed OPs from 2025 and earlier as "active replacement sources" — misleading the operator.

### Evidence

| Metric | Value |
|---|---|
| Total "open" OPs | 3,352 |
| Older than 12 months | 2,731 (81%) |
| Oldest open OP | OP 10 — 2020-11-02 (2,068 days) |
| ET events with quantity=0 | 3,640/3,640 (100%) — header-only |
| productionOrderRef format | `"2949-1"` (suffix `-1`) vs documentNumber `"2949"` |

### Audited OPs (all zombie)

| OP | Age | Last Event | Verdict |
|---|---|---|---|
| 2949 | 278d | 2025-11-28 (216d ago) | Zombie |
| 2948 | 279d | 2025-10-23 (252d ago) | Zombie |
| 2616 | 448d | 2025-05-15 (413d ago) | Zombie |
| 2597 | 455d | 2025-05-15 (413d ago) | Zombie |
| 2559 | 477d | 2025-04-04 (454d ago) | Zombie |
| 2893 | 304d | 2025-09-30 (275d ago) | Zombie |
| 2891 | 304d | 2025-09-30 (275d ago) | Zombie |
| 2781 | 357d | 2025-08-06 (330d ago) | Zombie |
| 2703 | 392d | 2025-06-26 (371d ago) | Zombie |
| 2534 | 492d | 2025-04-16 (442d ago) | Zombie |

---

## New Rule

```
DEFAULT_OP_ACTIVE_WINDOW_MONTHS = 6

OP is active for replacement in Maletas ONLY IF:
  status = 'open'
  AND isClosed = false
  AND (
    documentDate >= NOW() - 6 months
    OR lastProductionEventDate >= NOW() - 6 months
  )
```

### Key decisions

- **Recent OP without events**: included (may not have started production yet)
- **Old OP with recent activity**: included (still in production)
- **Old OP without recent activity**: excluded (zombie)
- **Window is configurable** via `DEFAULT_OP_ACTIVE_WINDOW_MONTHS` constant

### Event linkage

ProductionEvent.productionOrderRef uses `"2949-1"` format.
ProductionOrder.documentNumber uses `"2949"` format.
Linkage: `SPLIT_PART(productionOrderRef, '-', 1) = documentNumber`.

---

## Before / After

| Metric | Before | After | Change |
|---|---|---|---|
| Open OPs | 3,352 | 310 | -91% |
| OP lines | 56,294 | 5,211 | -91% |
| Subgrupos with OP | 105 | 60 | -43% |
| REEMPLAZAR refs with OP | 998 | 959 | -4% |
| Oldest surviving OP | OP 10 (2020-11-02) | OP 2816 (2025-07-24, event 2026-03-18) | Clean |

### Surviving OP age distribution

| Bucket | Count |
|---|---|
| 0-1m | 26 |
| 1-3m | 87 |
| 3-6m | 123 |
| 6-9m | 73 |
| 9-12m | 1 |
| 12m+ | 0 |

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-loader.ts` | `loadOpBySubgrupo()`: added temporal filter with `DEFAULT_OP_ACTIVE_WINDOW_MONTHS`, last-event-date lookup via ProductionEvent, prefix-match linkage |

## Files NOT Modified

- vendor-sample-types.ts (no type changes)
- vendor-sample-service.ts (no service changes)
- maletas-client.tsx (no UI changes needed — filter is server-side)
- ProductionOrder model (no schema changes)
- Production module (no cross-module changes)

---

## Alignment with Produccion Module

The Produccion module uses `OP_BOUND` mode in `production-timeline-loader.ts`:
OPs define the period, events follow their OPs. This sprint applies the same temporal hygiene principle to Maletas, using `DEFAULT_OP_ACTIVE_WINDOW_MONTHS` instead of a user-supplied `sinceDate`.

---

## Limitations

- ET events have `quantity = 0` (header-only) — completion percentage cannot be computed
- `producedQty` remains 0 on `VendorOpReplacementOption` (no ET reconciliation)
- 45 subgrupos lost OP coverage (had only zombie OPs)
- Window is a constant, not tenant-configurable (future: tenant settings)

## NOT Touched

- Presence Engine F34
- Bodega principal replacement engine
- State derivation rules (2-state model)
- ProductionOrder / ProductionEvent models
- Production module (production-timeline-loader.ts)
- Migrations
