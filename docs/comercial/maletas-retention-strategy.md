# Maletas — Data Retention Strategy
**Sprint:** AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
**Status:** LIVE — applies to all CommercialCoverage* models

---

## Problem statement

Maletas generates high-frequency operational snapshots.
Without a retention policy, storage grows unbounded and query latency degrades.
This document defines snapshot frequency, pruning rules, and historical compression.

---

## Data volumes (estimates, Castillitos)

| Model | Rows/sync | Daily (3×/day) | Monthly | Annual |
|---|---|---|---|---|
| CommercialCoverageSnapshot | ~309 | ~927 | ~28,000 | ~338,000 |
| CommercialCaseItem | ~309 | ~927 | ~28,000 | ~338,000 |
| CommercialCase | ~8 | ~24 | ~720 | ~8,760 |
| CommercialSalesRepProfileSnapshot | ~8 | ~24 | ~720 | ~8,760 |
| CommercialProductionSignal | ~0–30 | ~0–90 | ~0–2,700 | ~0–32,000 |
| CommercialDeadStockSignal | ~0–20 | ~0–60 | ~0–1,800 | ~0–21,000 |
| CommercialOperationalEvent | ~0–15 | ~0–45 | ~0–1,350 | ~0–16,000 |

**Total at 3×/day:** ~2,000 rows/day → ~60,000/month → ~730,000/year.
Manageable at PlanetScale/Supabase free tier until ~5M rows.

---

## Snapshot frequency

### Target cadence (future Vercel Cron)

```
0 8,14,20 * * *   →  3×/day at 8am, 2pm, 8pm (COT)
```

### Rationale

- Commercial cycle: vendors receive stock daily, production runs weekly.
- 3 snapshots/day captures intraday coverage changes without overwhelming storage.
- Single daily snapshot (8am) acceptable for V1 before cron is active.

### Minimum viable history for temporal engine

- **10 snapshots** minimum to activate `READY` status in `buildTemporalEvolution()`.
- **30 snapshots** (~10 days at 3×/day) for stable trend detection.
- **90 snapshots** (~30 days) for recurring pattern detection.

---

## Retention policy by model

### CommercialCoverageSnapshot
```
KEEP: 90 days of raw snapshots (full resolution)
AGGREGATE: day-level averages for days 91–365 (1 row/ref/day)
PRUNE: delete rows older than 365 days
```

Rationale: Coverage velocity patterns require 90-day rolling window.
Beyond that, weekly aggregates are sufficient for trend analysis.

### CommercialCaseItem
```
KEEP: 30 days of raw snapshots
AGGREGATE: weekly summaries for days 31–180
PRUNE: delete rows older than 180 days
```

Rationale: Item-level status is operationally relevant for 30 days.
Weekly summaries capture production cycles (which run on 4–8 week cycles).

### CommercialCase
```
KEEP: 365 days (low volume, ~8,760 rows/year)
PRUNE: delete after 2 years
```

### CommercialSalesRepProfileSnapshot
```
KEEP: 365 days (low volume, ~8,760 rows/year)
PRUNE: delete after 2 years
```

Rationale: Vendor pressure patterns require year-over-year comparison.
Seasonal peaks (school year, holidays) need 12-month baseline.

### CommercialProductionSignal
```
KEEP: all unresolved signals (no pruning)
KEEP: resolved signals for 90 days after resolution
PRUNE: resolved signals older than 90 days
```

### CommercialDeadStockSignal
```
KEEP: all unresolved signals
KEEP: resolved signals for 60 days after resolution
PRUNE: resolved signals older than 60 days
```

### CommercialOperationalEvent
```
KEEP: last 90 days (operational timeline window)
ARCHIVE: events older than 90 days to compressed event log (JSON blob)
PRUNE: delete raw rows after 90 days
```

---

## Aggregation windows

The temporal engine (`maletas-temporal.ts`) operates on these windows:

| Window | Purpose | Minimum snapshots |
|---|---|---|
| 7 days | Short-term velocity trend | 3 |
| 14 days | Coverage degradation detection | 6 |
| 30 days | Recurring breakdown detection | 10 |
| 90 days | Seasonal pattern baseline | 30 |

---

## Pruning implementation

Pruning should run as a separate low-priority cron:

```
0 3 * * 0   →  Weekly, Sunday 3am (low-traffic window)
```

Recommended implementation approach:

```typescript
// lib/comercial/maletas/maletas-pruner.ts (future sprint)

async function pruneMaletasData(orgId: string): Promise<PruneResult> {
  const now = new Date();

  // 1. Prune coverage snapshots > 365 days
  const coverageCutoff = subDays(now, 365);
  await prisma.commercialCoverageSnapshot.deleteMany({
    where: { organizationId: orgId, snapshotAt: { lt: coverageCutoff } },
  });

  // 2. Prune item snapshots > 180 days
  const itemCutoff = subDays(now, 180);
  await prisma.commercialCaseItem.deleteMany({
    where: { organizationId: orgId, snapshotAt: { lt: itemCutoff } },
  });

  // 3. Prune resolved production signals > 90 days after resolution
  // (requires resolvedAt field — add in future sprint)

  // 4. Prune operational events > 90 days
  const eventCutoff = subDays(now, 90);
  await prisma.commercialOperationalEvent.deleteMany({
    where: { organizationId: orgId, createdAt: { lt: eventCutoff } },
  });
}
```

---

## Historical compression (future)

For orgs with > 1 year of history, consider:

1. **Day-level aggregation table**: `CommercialCoverageAggregate` — one row per ref/day with min/max/avg coverage.
2. **Trend materialization**: Pre-compute 7d/30d trends on write (avoid re-scanning 90d of data on read).
3. **Partitioning**: If using PostgreSQL directly, partition `CommercialCoverageSnapshot` by `snapshotAt` month.

---

## Multi-tenant isolation

All pruning operations are **orgId-scoped**.
Never run global prune queries without `organizationId` WHERE clause.
Tenant deletion (org offboarding) cascades via `onDelete: Cascade` on all models.

---

## Current state

| Status | Detail |
|---|---|
| Snapshot pipeline | ✅ Active via `maletas-snapshots.ts` |
| Event detection | ✅ Active via `maletas-events.ts` |
| Temporal engine | ✅ Active via `maletas-temporal.ts` |
| Cron endpoint | ✅ Ready at `/api/internal/comercial/maletas/sync` |
| Pruning | ⏳ Pending — `maletas-pruner.ts` (next sprint) |
| Aggregation | ⏳ Pending — when > 90 days of history exists |
| Backfill CLI | ✅ Available via `runMaletasBackfill()` in ingestion pipeline |
