# AGENTIK-FINANCIAL-MEMORY-02
## Automated Financial Snapshot Accumulation

**Sprint closed:** 2026-05-10
**Files created:** 3 (`lib/financial/snapshot-orchestrator.ts`, `app/api/internal/financial-memory/capture/route.ts`, `vercel.json`)
**Files modified:** 3 (`lib/financial/memory-model.ts`, `lib/financial/memory-store.ts`, `lib/financial/memory-helpers.ts`, `app/(app)/[orgSlug]/reconciliation/recon-client.tsx`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Activate automatic financial memory accumulation.

MEMORY-01 defined the types and helpers.
MEMORY-02 makes the memory live — daily snapshots are now captured automatically.

```
MEMORY-01: infrastructure   — types, helpers, store reads, honest UI placeholder
MEMORY-02: accumulation     — orchestrator, cron, safe writes, staleness detection
MEMORY-03: analysis (next)  — trends, velocity, pattern detection (requires ≥14 days)
```

---

## Audit Summary (Mandatory First Step)

Files audited before implementation:

| File | Finding |
|------|---------|
| `lib/financial/memory-model.ts` | `MemoryReadinessTier` had 4 tiers. Missing `warming`, `degraded`, `capture_failed`. Updated. |
| `lib/financial/memory-store.ts` | `buildCurrentSnapshot()` parsed pending count from signal text — fragile. Replaced with `buildSnapshotFromRawData()` taking explicit numeric data. |
| `lib/financial/memory-helpers.ts` | `getMemorySummary()` had correct structure but tier thresholds needed revision. No staleness detection for `degraded` tier. Updated. |
| `lib/financial/stream-model.ts` | `buildFinancialStreams(sources, pendingDepositsTotal)` — exact signature understood. Orchestrator calls this correctly. |
| `app/api/internal/run-scheduled-jobs/route.ts` | Canonical cron endpoint pattern confirmed: `INTERNAL_CRON_SECRET`, header `x-internal-cron-secret`, POST+GET alias. |
| `app/api/internal/collections/auto-tasks/route.ts` | Multi-org cron pattern confirmed: body `organizationId?`, per-org try/catch, structured summary response. |
| `vercel.json` | Did NOT exist. Created from scratch. |

**Key audit risks found and resolved:**

| Risk | Resolution |
|------|-----------|
| Signal text parsing for pending count | Replaced with `buildSnapshotFromRawData()` — takes real `{count, amount}` directly |
| UTC vs Colombia calendar date mismatch | Defined `colombiaDayISO()` helper using UTC-5 offset; cron at 06:00 UTC always lands on correct Colombia day |
| No `degraded` tier for stale data | Added staleness check: newest snapshot >2 days old → `degraded` tier |
| `persistStreamSnapshot` theoretical race | Existing findFirst+create/update is safe for single daily cron; documented |

---

## Snapshot Lifecycle

```
06:00 UTC daily (= 01:00 COT)
  │
  ▼ Vercel Cron triggers GET /api/internal/financial-memory/capture
  │
  ▼ Auth: INTERNAL_CRON_SECRET header check
  │
  ▼ Load all active orgs (prisma.organization.findMany)
  │
  ▼ For each org:
  │   ├── getCobrosBreakdown(orgId)           → real pending pool { count, amount }
  │   ├── buildFinancialStreams(sources, pool) → FinancialStream[] with status
  │   └── For each stream:
  │         ├── buildSnapshotFromRawData(stream, orgId, pool)
  │         │     → FinancialStreamSnapshot (Colombia date, honest pending data)
  │         └── persistStreamSnapshot(snapshot)
  │               → MetricSnapshot upsert (one row per stream per day)
  │
  ▼ Return: { ok: true, summary: { orgs, totalCaptured, totalErrors }, results: {...} }
     (counts only — no raw financial data in response)
```

---

## Cron Strategy

### Schedule
```
vercel.json:  "0 6 * * *"   (06:00 UTC = 01:00 COT, daily)
```

**Why 06:00 UTC / 01:00 COT:**
- SAG sync jobs run during business hours (08:00–20:00 COT)
- By 01:00 COT, all SAG writes from the prior day are complete
- 01:00 COT is solidly midnight Colombia — never ambiguous for calendar date
- Colombia does NOT observe DST (UTC-5 is constant year-round)

### No conflict with existing crons
- `run-scheduled-jobs`: hourly (`0 * * * *`) — unrelated (ScheduledReport model)
- `collections/auto-tasks`: daily 08:00 COT — unrelated (ActionTask model)
- `financial-memory/capture`: daily 01:00 COT — new, no conflict

---

## Idempotency Strategy

**"One row per stream per calendar day"**

```
Code:       "financial.stream.{streamId}"
Org:        organizationId
Date key:   snapshotDate (YYYY-MM-DD, Colombia time)
```

`persistStreamSnapshot()` implementation:
1. `findFirst` where `code` + `organizationId` + `snapshotAt` in `[day 00:00, day 23:59]`
2. If found → `update` (idempotent re-run; same day, latest data wins)
3. If not found → `create`

**Safe to re-run:** A second cron call the same day updates each row with the latest values. No duplicate rows.

**Safe across orgs:** `organizationId` is always included in the `where` — org isolation guaranteed.

---

## Timezone Decision

| Concern | Decision |
|---------|----------|
| Which timezone for snapshot date? | Colombia (UTC-5), not UTC |
| Implementation | `colombiaDayISO()` in memory-store.ts: subtract 5h from UTC |
| DST handling | None needed — Colombia has no DST |
| Cron time | 06:00 UTC = 01:00 COT — always falls on correct Colombia calendar day |
| Consistency | All snapshots for same org written by same cron call share same `snapshotDate` |

Example: Cron fires 2026-05-11T06:00:00Z → `colombiaDayISO()` → `"2026-05-11"` → correct.

---

## Storage Convention (unchanged from MEMORY-01)

```
Model:       MetricSnapshot
code:        "financial.stream.{streamId}"
valueJson:   FinancialStreamSnapshot (full typed object)
snapshotAt:  UTC midnight of Colombia snapshot date (deterministic)
label:       "Financial stream: {streamId}"
Index:       [organizationId, code, snapshotAt]
```

**Never creates new tables. Never alters existing tables. Only MetricSnapshot.**

---

## Memory Readiness Tiers (updated from MEMORY-01)

| Tier | Condition | UI color | Meaning |
|------|-----------|----------|---------|
| `no_history` | 0 snapshots | gray | Freshly initialized — no data yet |
| `building` | 1–6 days | light blue | Accumulating — no trend analysis possible yet |
| `warming` | 7–13 days | blue | Weekly patterns starting to emerge |
| `ready` | 14+ days | green | Trend analysis, aging, noise detection available |
| `degraded` | Newest snapshot >2 days old | orange | History exists but stale — check cron |
| `capture_failed` | Set by caller when capture fails | red | Last capture attempt failed |

**`degraded`** is a new operational signal: history exists but hasn't been updated recently. Operators see an orange warning with "verificar ejecución de cron" note.

---

## Failure Handling

| Failure | Behavior |
|---------|----------|
| `getCobrosBreakdown` throws | Warn + continue. Linked streams get `pendingCount=0` (honest — data unavailable). Non-linked streams (tarjetas, plataformas) are unaffected — they never had pending data. |
| Single stream `persistStreamSnapshot` throws | Error logged + counted. Other streams continue. `partialSuccess: true` if at least one captured. |
| Single org orchestrator throws | Error counted. Other orgs continue. Response still `ok: true`. |
| All orgs fail | Response `ok: true, summary: { totalCaptured: 0, totalErrors: N }` — HTTP 200 because the endpoint itself worked; orchestration failures are operational, not request errors. |
| Auth failure | HTTP 401 immediately. |
| Bad request body | HTTP 400 immediately. |

**Production guarantee:** Nothing outside MetricSnapshot is touched. Page renders and financial calculations are never affected by capture failures.

---

## Observability

Each capture call emits:
```
[snapshot-orchestrator] org={orgId} date={snapshotDate} streams={N} captured={N} errors={N} cobrosOk={bool}
[financial-memory/capture] orgs={N} captured={N} errors={N}
```

No PII. No financial amounts in logs. Only operational counts.

---

## Files Created

### 1. `lib/financial/snapshot-orchestrator.ts`

The orchestrator function `captureFinancialSnapshots(orgId)`:
- Loads `BANK_ACCOUNT_SOURCES` registry
- Fetches `getCobrosBreakdown(orgId)` for real pending deposit data
- Calls `buildFinancialStreams(allSources, pendingDepositsTotal)`
- For each stream: `buildSnapshotFromRawData()` + `persistStreamSnapshot()`
- Returns `SnapshotCaptureResult` with per-stream status

### 2. `app/api/internal/financial-memory/capture/route.ts`

Internal cron endpoint:
- Auth: `x-internal-cron-secret` header, `INTERNAL_CRON_SECRET` env var
- Org scope: optional `organizationId` body param; defaults to all active orgs
- Calls `captureFinancialSnapshots(orgId)` per org
- Returns safe summary (counts only, no amounts, no account identifiers)
- GET alias for Vercel Cron compatibility

### 3. `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/internal/financial-memory/capture",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## Files Modified

### 4. `lib/financial/memory-model.ts`

`MemoryReadinessTier` expanded from 4 to 6 tiers:
```
before: no_history | insufficient | building | ready
after:  no_history | building | warming | ready | degraded | capture_failed
```

### 5. `lib/financial/memory-store.ts`

- Added `colombiaDayISO()` helper — Colombia UTC-5 calendar date
- Added `buildSnapshotFromRawData(stream, orgId, pendingDepositsTotal)` — preferred builder
- `buildCurrentSnapshot()` now delegates to `buildSnapshotFromRawData()` via signal parsing (deprecated wrapper)
- Extracted `deriveHealthState()` and `deriveSystemReason()` as pure private helpers

### 6. `lib/financial/memory-helpers.ts`

`getMemorySummary()`:
- Added staleness check: `daysBetween(newest.snapshotDate, todayISO()) > 2` → `degraded`
- Updated tier thresholds: `building` (1–6), `warming` (7–13), `ready` (14+)

### 7. `app/(app)/[orgSlug]/reconciliation/recon-client.tsx`

Memory readiness footer updated for all 6 tiers:
- `degraded`: orange border + "verificar ejecución de cron" note
- `capture_failed`: red border + "última captura falló" note
- `warming`: blue border (new tier)
- Contextual footnotes for `no_history` and `building` tiers

---

## What Was NOT Touched

- SAG integration, sync engine, adapters — zero modifications
- Prisma schema, migrations — zero modifications
- `getCobrosBreakdown()`, any existing financial calculations — zero modifications
- Reconciliation engine, dry runs, auto-reconciliation — zero modifications
- Executive dashboard, Torre de Control workspace pages — zero modifications
- Matching logic — zero modifications
- Existing cron endpoints — zero modifications
- Shell, routing, navigation — zero modifications

---

## Operational Risks

| Risk | Severity | Note |
|------|----------|------|
| No `INTERNAL_CRON_SECRET` in env | BLOCKED — endpoint returns 401 | Add to Vercel env vars before deploying |
| First run: 0 snapshots exist | EXPECTED | `no_history` tier. UI shows "sin historial suficiente". Correct honest state. |
| Vercel Hobby plan cron limits | LOW | Vercel Pro/Enterprise supports crons. Hobby plan has limited cron support. Verify plan. |
| SAG unavailable at 01:00 COT | LOW | Capture still runs; linked streams get `pendingCount=0`. Accurate — no SAG data = no pending data available. |
| Shared pending deposit pool | INHERITED | B1/B2/H1/H2/CP share one total. All linked banks store the same pool total. Honest representation — documented in FLOWS-01. |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Agentik captures daily snapshots automatically | ✅ Orchestrator + cron endpoint + vercel.json |
| 2 | Snapshots are deterministic | ✅ Same org state → same snapshot; Colombia date is canonical |
| 3 | No accidental duplicates | ✅ findFirst+update/create idempotency; one row per stream per day |
| 4 | Financial memory starts accumulating | ✅ Will activate on first cron trigger after `INTERNAL_CRON_SECRET` is set |
| 5 | SAG not modified | ✅ Zero SAG changes |
| 6 | Reconciliation not modified | ✅ Zero reconciliation changes |
| 7 | Secure internal endpoint exists | ✅ `/api/internal/financial-memory/capture` with secret auth |
| 8 | Stable cron configuration | ✅ `vercel.json` with non-conflicting schedule |
| 9 | Clean auditable architecture | ✅ All functions typed, documented, single-responsibility |
| 10 | TypeScript zero regressions | ✅ 162 → 162 |

---

## Activation Checklist (before production)

- [ ] Set `INTERNAL_CRON_SECRET` in Vercel environment variables
- [ ] Verify Vercel plan supports cron jobs (Pro or Enterprise)
- [ ] Deploy: `vercel.json` will register the cron automatically on next deploy
- [ ] Monitor first capture: check Vercel function logs for `[financial-memory/capture]`
- [ ] After 7 days: verify `readinessTier` transitions from `building` to `warming`
- [ ] After 14 days: `ready` tier — trend analysis becomes available

---

## Next Sprint Recommendation

**AGENTIK-FINANCIAL-MEMORY-03 — Stream Trend Analysis**

Requires: ≥7 days of accumulated snapshots (available after MEMORY-02 runs for one week).

1. Add `getStreamTrend(streamId, snapshots)` to memory-helpers.ts
   — Uses last 7 days of snapshots
   — Returns: `{ direction: "improving" | "worsening" | "stable", confidence: number, basedOnDays: number }`
   — Only emits when basedOnDays ≥ 5 (avoids misleading single-day signals)

2. Surface trend indicators in FinancialStreamsPanel
   — Tiny trend arrow (▲ growing / ▼ shrinking) next to pending count
   — Only shown when `readinessTier === "warming" | "ready"`
   — Honest: "no hay suficiente historial" placeholder until ready

3. Activate `buildRuleBasedObservations()` in memory-helpers.ts
   — Currently defined but not called in UI
   — Wire to a "Agentik observa · memoria" expandable section
   — `basedOnSnapshots > 0` → show observations; `=== 0` → hide section

This sprint does not require any new DB tables or SAG changes.
