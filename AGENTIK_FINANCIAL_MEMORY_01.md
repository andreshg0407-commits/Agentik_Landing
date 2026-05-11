# AGENTIK-FINANCIAL-MEMORY-01
## Operational Financial Stream Memory Layer

**Sprint closed:** 2026-05-10
**Files created:** 3 (`lib/financial/memory-model.ts`, `lib/financial/memory-helpers.ts`, `lib/financial/memory-store.ts`)
**Files modified:** 2 (`app/(app)/[orgSlug]/reconciliation/page.tsx`, `recon-client.tsx`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Add a temporal memory layer to the financial stream model.

The stream model (FLOWS-01) tells you the current operational state of each bank account.
The memory layer (MEMORY-01) tells you how that state has changed over time.

Two orthogonal concerns:
```
stream-model.ts  — What is happening RIGHT NOW
memory-model.ts  — What has happened OVER TIME
```

---

## Audit Summary (Mandatory First Step)

Files audited before implementation:

| File | Finding |
|------|---------|
| `prisma/schema.prisma` | `MetricSnapshot` model confirmed — `{id, organizationId, projectId, code, label, valueNumber, valueJson, snapshotAt, metadataJson}`. Index on `[organizationId, code, snapshotAt]`. This is the correct storage backend. |
| `lib/finance/receivables-snapshot.ts` | Canonical reference for live-computed snapshot pattern. Shows how to derive a typed snapshot from live Prisma data without writing it on every render. |
| `lib/financial/stream-model.ts` | `StreamOperationalStatus` (9 states), `FinancialStream` interface. Memory model imports `StreamOperationalStatus` from here. |
| `lib/financial/bank-account-registry.ts` | 10 sources registered. 3 linked to SAG via PENDING_DEPOSIT codes (B1/B2/H1). |
| `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` | Already had `FinancialStreamsPanel` + `streams` + `recommendations` props from FLOWS-01. Added `memoryStatus` prop. |
| `app/(app)/[orgSlug]/reconciliation/page.tsx` | Already fetched streams + cobros data. Added `getAllStreamSnapshots` + `getMemorySummary` in parallel. |

**Key discovery:** No `MetricSnapshot` rows with code prefix `financial.stream.*` exist yet.
The memory layer correctly returns `[]` → `no_history` tier → honest "sin historial suficiente" UI state.

---

## Architecture

### Storage convention

```
Model:     MetricSnapshot
code:      "financial.stream.{streamId}"
valueJson: FinancialStreamSnapshot
index:     [organizationId, code, snapshotAt]
```

One row per stream per day. Idempotent upsert — safe to re-run.

### Data flow

```
Day 0 — no history
  getAllStreamSnapshots(orgId)           → []
  getMemorySummary(orgId, [])            → readinessTier: "no_history"
  recon-client.tsx                       → memory footer: "sin historial suficiente"

Day 1+ — after first persistStreamSnapshot() call
  getAllStreamSnapshots(orgId)           → [FinancialStreamSnapshot, ...]
  getMemorySummary(orgId, snapshots)     → readinessTier: "insufficient" / "building" / "ready"
  compareSnapshots(current, prior)       → SnapshotDelta { movement, pendingCountDelta, ... }
  getAgingStatus(streamId, snapshots)    → StreamAgingStatus { daysInCurrentState, isStale }
  getNoiseLevel(snapshots)               → StreamNoiseAssessment { noiseLevel, reason }
  buildRuleBasedObservations(stream, ...) → CopilotObservation[] (RULE_BASED only)
```

### Memory readiness tiers

| Tier | Days of history | UI behavior |
|------|----------------|-------------|
| `no_history` | 0 | "sin historial suficiente — tendencias disponibles cuando se acumule historial" |
| `insufficient` | 1–6 | "N día(s) — historial insuficiente para tendencias" |
| `building` | 7–29 | "N días de historial" |
| `ready` | 30+ | "historial completo (N+ días)" |

---

## Files Created

### 1. `lib/financial/memory-model.ts`

Pure TypeScript — zero Prisma, zero SAG, zero side effects. Type definitions only.

**Types:**
- `StreamHealthState` — 6 states: `healthy | noisy | quiet | degraded | blocked | no_data`
- `FinancialStreamSnapshot` — point-in-time snapshot with identity, pending state, operational status, health, optional reconciliation counters
- `SnapshotDelta` — comparison result: movement direction, count/amount deltas, percentage
- `StreamMovement` — 6 directions: `growing | shrinking | stable | resolved | appeared | no_baseline`
- `StreamAgingStatus` — how long stream has been in current status, `isStale` flag (>30 days)
- `StreamNoiseAssessment` — coefficient-of-variation based noise level
- `MemorySummary` — org-level summary with history range, readiness tier, health breakdown
- `MemoryReadinessTier` — `no_history | insufficient | building | ready`
- `CopilotObservationType` — 9 observation types for future Financial Copilot
- `CopilotObservation` — full Copilot output contract with `confidence: "RULE_BASED"`

### 2. `lib/financial/memory-helpers.ts`

Pure helper functions — no Prisma, no SAG, no side effects, no writes.

**Functions:**
- `compareSnapshots(current, prior, label)` — SnapshotDelta from two snapshots; handles null prior → `no_baseline`
- `getStreamMovement(current, prior)` — StreamMovement from count delta + zero-boundary detection
- `getAgingStatus(streamId, snapshots)` — walks history newest-first; computes days, isStale, agingLabel
- `getNoiseLevel(snapshots)` — coefficient of variation across pendingCount values; requires ≥3 snapshots
- `getMemorySummary(orgId, snapshots)` — org-level summary; latest snapshot per stream for health breakdown
- `buildRuleBasedObservations(stream, snapshots, orgSlug)` — deterministic Copilot observations from real data; `confidence: "RULE_BASED"` always

**Noise assessment threshold:**
```
CV < 0.15 → low    — movimiento estable
CV < 0.40 → medium — fluctuación moderada
CV ≥ 0.40 → high   — alta varianza
```

### 3. `lib/financial/memory-store.ts`

MetricSnapshot read/write layer.

**Read functions (safe — zero side effects):**
- `getStreamSnapshots(orgId, streamId, limit)` — up to `limit` snapshots for one stream, newest first
- `getAllStreamSnapshots(orgId, limit)` — recent snapshots across all `financial.stream.*` codes for one org

**Snapshot builder (pure — zero Prisma):**
- `buildCurrentSnapshot(stream, orgId)` — derives `FinancialStreamSnapshot` from live `FinancialStream`. NOT written automatically.

**Write function (explicit only — idempotent):**
- `persistStreamSnapshot(snapshot)` — upserts by `(organizationId, code, snapshotDate)`. One row per stream per day. NOT called at page render — must be triggered by a scheduled job.

---

## Files Modified

### 4. `app/(app)/[orgSlug]/reconciliation/page.tsx`

Added parallel fetch of stream snapshots:
```typescript
const [filterOptions, cobrosBreakdown, allSnapshots] = await Promise.all([
  getFilterOptions(organization.id),
  getCobrosBreakdown(organization.id).catch(() => null),
  getAllStreamSnapshots(organization.id, 90).catch(() => []),
]);

const memorySummary = getMemorySummary(organization.id, allSnapshots);
const memoryStatus  = {
  readinessTier:  memorySummary.readinessTier,
  readinessLabel: memorySummary.readinessLabel,
  historyDays:    memorySummary.historyDays,
  snapshotCount:  memorySummary.snapshotCount,
};
```

`getAllStreamSnapshots` failure is handled gracefully — `.catch(() => [])` defaults to empty array → `no_history` tier. Page renders correctly in all failure modes.

### 5. `app/(app)/[orgSlug]/reconciliation/recon-client.tsx`

**New prop:** `memoryStatus?: { readinessTier, readinessLabel, historyDays, snapshotCount }`

**New UI:** Memory readiness footer (between `FinancialStreamsPanel` and Agentik observa strip):
- Left-bordered color-coded bar: green (ready), blue (building), gray (no_history / insufficient)
- Shows `readinessLabel` with contextual footnote for low-tier states
- Completely hidden when `memoryStatus` is undefined (graceful degradation)

---

## What Is Real vs. Prepared vs. Not Yet

| Layer | Status | Detail |
|-------|--------|--------|
| Current stream state | REAL | `buildFinancialStreams()` from live SAG/Prisma data |
| Memory types | REAL | All types defined; JSON-serializable |
| Helper functions | REAL | Pure functions; tested via TypeScript compilation |
| Memory store reads | REAL | Prisma queries compile; return `[]` when no history exists |
| Memory store writes | PREPARED | `persistStreamSnapshot()` exists; NOT called automatically |
| Stream snapshots in DB | NOT YET | No rows exist; first write requires scheduled job trigger |
| Trend analysis | NOT YET | Requires ≥7 days of history |
| Pattern detection | NOT YET | Requires ≥30 days |
| LLM enrichment | NEVER (this sprint) | Copilot contract defined; no LLM called |

---

## What Was NOT Touched

- SAG integration, sync engine, adapters — zero modifications
- Prisma schema, migrations — zero modifications
- `getCobrosBreakdown()`, any existing financial calculations — zero modifications
- Reconciliation engine (`lib/reconciliation/`) — zero modifications
- Matching logic, auto-reconciliation scripts — zero modifications
- Executive dashboard, Torre de Control workspace pages — zero modifications
- Shell, routing, navigation — zero modifications

---

## Copilot Preparation

The `buildRuleBasedObservations()` function is the seed for the future Financial Copilot.

```typescript
// CURRENT (rule-based, RULE_BASED confidence):
{ observationType: "pending_growing", confidence: "RULE_BASED", basedOnSnapshots: 7,
  message: "Bancolombia CRT 0711: consignaciones pendientes creciendo — 14 entradas (era 8)" }

// FUTURE (Financial Copilot, after ≥30 days of history):
{ observationType: "pattern_repeat", confidence: "HIGH", basedOnSnapshots: 30,
  message: "Bancolombia CRT 0711: patrón consistente — consignaciones crecen los lunes y se
            resuelven antes del viernes. Comportamiento estable en los últimos 4 períodos." }
```

**Copilot readiness checklist:**
- ✅ `CopilotObservationType` — 9 observation types defined
- ✅ `CopilotObservation` — full output contract with severity, message, suggestedAction, relatedWorkspace
- ✅ `confidence: "RULE_BASED"` — honest provenance marker; no fake HIGH/MEDIUM before history exists
- ✅ `basedOnSnapshots: number` — Copilot can know how much history informed the observation
- ✅ `buildRuleBasedObservations()` — deterministic implementation ready
- ⬜ Scheduled snapshot writer — trigger for daily `persistStreamSnapshot()` calls
- ⬜ 7+ days of history — enables trend analysis and `growing/shrinking` detection
- ⬜ 30+ days of history — enables chronic/pattern/repeat observations
- ⬜ LLM enrichment layer — after pattern detection

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `FinancialStreamSnapshot` type defined with all required fields | ✅ memory-model.ts |
| 2 | `SnapshotDelta`, `StreamMovement`, `StreamAgingStatus`, `StreamNoiseAssessment`, `MemorySummary` defined | ✅ memory-model.ts |
| 3 | `compareSnapshots()` handles null prior → `no_baseline` | ✅ memory-helpers.ts |
| 4 | `getAgingStatus()` correctly identifies stale streams (>30 days same status) | ✅ memory-helpers.ts |
| 5 | `getNoiseLevel()` uses coefficient of variation; requires ≥3 snapshots | ✅ memory-helpers.ts |
| 6 | `getMemorySummary()` computes latest snapshot per stream for health breakdown | ✅ memory-helpers.ts |
| 7 | `buildRuleBasedObservations()` never invents data — all from real snapshot state | ✅ memory-helpers.ts |
| 8 | `buildCurrentSnapshot()` is pure — derives from FinancialStream, no Prisma write | ✅ memory-store.ts |
| 9 | `persistStreamSnapshot()` is idempotent — one row per stream per day | ✅ memory-store.ts |
| 10 | `getAllStreamSnapshots()` returns `[]` when no history — callers handle gracefully | ✅ memory-store.ts |
| 11 | UI shows honest readiness state — "sin historial suficiente" when no snapshots | ✅ recon-client.tsx footer |
| 12 | `MemoryReadinessTier` maps correctly to UI color and footnote text | ✅ recon-client.tsx |
| 13 | `getAllStreamSnapshots` failure is caught — page renders with `no_history` tier | ✅ page.tsx `.catch(() => [])` |
| 14 | Future Financial Copilot contract fully defined | ✅ `CopilotObservation`, `CopilotObservationType` |
| 15 | TypeScript zero regressions | ✅ 162 → 162 |

---

## Risks

| Risk | Severity | Note |
|------|----------|------|
| No write trigger yet | LOW | `persistStreamSnapshot()` exists but is never called. First history row requires a scheduled job or manual trigger. UI correctly shows `no_history`. |
| `buildCurrentSnapshot` extracts amount from signal label | LOW | The "Pool total" signal text is parsed for the amount. This is a best-effort extraction — real amount should come from `getCobrosBreakdown` when persisting. Acceptable for current state. |
| Snapshot pool is shared | LOW (inherited from FLOWS-01) | Same as FLOWS-01: B1/B2/H1/H2/CP share one pool; all linked banks store the same total. Honest representation. |

---

## Next Sprint Recommendation

**AGENTIK-FINANCIAL-MEMORY-02 — Daily Snapshot Scheduler**

1. Add an API route `POST /api/orgs/[orgSlug]/financial/snapshots/persist`
   — Calls `buildCurrentSnapshot()` for all streams + `persistStreamSnapshot()` per stream
   — Protected: internal API key or cron secret header
   — Idempotent: safe to call multiple times per day

2. Wire to Vercel cron job (`vercel.json` cron config)
   — Schedule: daily at 23:00 UTC (after SAG sync window)
   — Logs result to console (count of streams written)

3. Optionally: add a one-click "registrar snapshot ahora" button in the reconciliation panel
   — Only visible in development or to admin users
   — Useful for seeding initial history without waiting 30 days

Once snapshots accumulate, `buildRuleBasedObservations()` and `compareSnapshots()` become live.
