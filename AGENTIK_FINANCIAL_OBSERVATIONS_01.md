# AGENTIK-FINANCIAL-OBSERVATIONS-01
## Deterministic Financial Operational Observations

**Sprint closed:** 2026-05-10
**Files created:** 1 (`lib/financial/observation-engine.ts`)
**Files modified:** 3 (`lib/financial/memory-model.ts`, `app/(app)/[orgSlug]/reconciliation/page.tsx`, `app/(app)/[orgSlug]/reconciliation/recon-client.tsx`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Transform financial stream memory into operational awareness.

MEMORY-01/02 built the infrastructure — types, storage, daily snapshots.
OBSERVATIONS-01 makes that memory mean something — pattern detection, evidence-based messages, honest intelligence.

```
MEMORY-01:       types + store reads
MEMORY-02:       daily snapshot accumulation
OBSERVATIONS-01: deterministic pattern detection → operational observations
OBSERVATIONS-02: (future) trend analysis, weekly patterns, Copilot enrichment
```

---

## Audit Summary (Mandatory First Step)

Files audited before implementation:

| File | Finding |
|------|---------|
| `lib/financial/memory-helpers.ts` | `buildRuleBasedObservations()` existed but was insufficient: only 1-day comparison (current vs prior), always emitted a nominal observation, no consecutive pattern detection, no temporal depth. Superseded by observation-engine.ts. |
| `lib/financial/memory-model.ts` | `CopilotObservationType` had 9 types but was missing: consecutive_increase, consecutive_decrease, recovery_pattern, stale_stream, no_activity, repeated_blocked, memory_building. Severity was 4-tier (info/warning/critical/ok) — missing watch/elevated. Updated both. |
| `lib/financial/snapshot-orchestrator.ts` | Confirmed snapshots are `sortNewestFirst`-friendly. `streamId` and `snapshotDate` are always populated. |
| `reconciliation/recon-client.tsx` | Old "Agentik observa" strip was an IIFE rendering `recommendations[0]` (text string from `getStreamRecommendations()`). Replaced with typed `ObservationStrip` component using `CopilotObservation[]`. |

**Key audit gaps resolved:**
- `buildRuleBasedObservations()` pattern: 1-day only → replaced with temporal detectors (N-consecutive)
- Nominal state fallback: always emitted `"first_observation"` → now silent for nominal streams
- Severity scale: 4-tier → 5-tier (`watch` / `elevated` added)
- `CopilotObservationType`: 9 types → 16 types

---

## Observation Philosophy

### What an observation IS

An observation is a factual statement derived from verified data, not an assessment:

```
✅ "Bancolombia 0313: consignaciones pendientes en aumento por 4 días consecutivos — ahora 18 entradas"
✅ "Banco Bogotá: consignaciones pendientes reduciéndose por 3 días consecutivos — de 14 a 6"
✅ "MercadoPago: sin lectura bancaria configurada — extracto requerido para conciliación"
✅ "Bancolombia CRT 0711: memoria acumulándose — 2 días de historial disponible"
```

### What an observation is NOT

```
❌ "Riesgo financiero detectado"          (no scoring, no assessment)
❌ "Posible fraude en consignaciones"     (no invented anomalies)
❌ "Cash flow bajo esta semana"           (no predictions)
❌ "Agentik recomienda revisar todo"      (no marketing copy)
```

### Explainability principle

Every observation message includes:
- **What** happened (pending count / status change)
- **How long** it has been happening (N días consecutivos)
- **What changed** (de X a Y where applicable)

No observation is a black box.

---

## Implemented Rules

### Temporal Pattern Detectors (pure functions, Task 5)

| Function | Rule ID | Description | Min Snapshots |
|----------|---------|-------------|---------------|
| `detectConsecutiveIncrease(sorted)` | R_INC | Returns N days where pendingCount has been strictly increasing at HEAD of history | 2 |
| `detectConsecutiveDecrease(sorted)` | R_DEC | Returns N days where pendingCount has been strictly decreasing at HEAD of history | 2 |
| `detectRecoveryPattern(sorted)` | R_RECOVERY | Was growing ≥3 days, now decreasing ≥2 days | 5 |
| `detectNoActivityDays(sorted)` | R_NO_ACT | Returns N consecutive days with pendingCount=0 at HEAD | 1 |
| `detectRepeatedBlockedState(sorted, window)` | R_BLOCKED | Count of blocked_source/missing_sag_mapping in last N snapshots | 7 |
| `detectStaleStream(sorted, maxDaysGap)` | R_STALE | Most recent snapshot is older than N days | 1 |

### Observation Rules

| Rule ID | Observation Type | Severity | Min Snaps | Trigger |
|---------|-----------------|----------|-----------|---------|
| R_INTEGRATION | `integration_missing` | info | 0 | stream.status === "integration_pending" |
| R_STALE | `stale_stream` | watch | 1 | no snapshot for >3 days on bancos stream |
| R_FIRST | `first_observation` | info | 0 | no snapshots at all |
| R_RESOLVED | `pending_resolved` | ok | 2 | pendingCount went from >0 to 0 |
| R_MEMORY | `memory_building` | info | 1 | <3 snapshots — honest insufficient state |
| R_INC | `consecutive_increase` | watch/elevated/critical | 3 | incDays≥2 |
| R_DEC | `consecutive_decrease` | ok | 3 | decDays≥2 AND no increase |
| R_RECOVERY | `recovery_pattern` | info | 5 | was growing ≥3d, now decreasing ≥2d |
| R_NO_ACT | `no_activity` | ok | 7 | pendingCount=0 for ≥7 consecutive days |
| R_BLOCKED | `repeated_blocked` | watch/elevated | 7 | blocked in ≥3 of last 10 snapshots |
| R_CHRONIC | `chronic_pending` | critical | 30d history | reconciliation_pending for >30 days |
| R_NOISE | `noise_detected` | elevated | 7 | CV > 0.40 across ≥7 snapshots |

---

## Severity System (Task 3)

| Severity | Meaning | When to Use |
|----------|---------|-------------|
| `ok` | Positive operational signal | pending_resolved, no_activity, consecutive_decrease |
| `info` | Neutral. No action required. | first_observation, memory_building, integration_missing, recovery_pattern |
| `watch` | Monitor. Not urgent. | 2-3 day increase, stale stream, 3-4 blocked occurrences |
| `elevated` | Action recommended. | 4-5 day increase, high noise, 5+ blocked occurrences |
| `critical` | Immediate attention. | 6+ day increase, chronic pending (>30 days) |

### Severity escalation for consecutive increase

| Days of consecutive increase | Severity |
|------------------------------|----------|
| 2–3 | `watch` |
| 4–5 | `elevated` |
| 6+ | `critical` |

No fixed thresholds for amounts (these vary per org). Duration is the only axis.

---

## Honest Intelligence Principles (Task 7)

The engine never fabricates patterns:

1. **Minimum snapshot enforcement**: Each rule has a documented minimum snapshot count. Rules are silently skipped when history is insufficient — no partial pattern fabrication.

2. **`memory_building` observation**: When <3 snapshots exist, the engine emits an honest placeholder ("memoria acumulándose") instead of an empty state or invented pattern.

3. **Terminal returns**: When a positive `resolved` state is detected, the engine returns immediately — no additional observations needed. Clean exits prevent noise.

4. **Silent nominal streams**: When a stream has 0 pending items and no patterns, the engine emits nothing. Silence IS the signal for nominal operational state.

5. **Evidence in every message**: All messages include specific counts and durations. "4 días consecutivos — ahora 18 entradas" is traceable and auditable.

6. **RULE_BASED confidence**: Every observation carries `confidence: "RULE_BASED"` and `basedOnSnapshots: N`. Users can verify the evidence count.

---

## Observation Priority

`sortObservationsByPriority()` orders by severity:
```
critical (5) > elevated (4) > watch/warning (3) > ok (2) > info (1)
```

The UI always shows the highest-severity observation as the primary signal. Additional observations appear in a compact list below.

---

## Copilot Strip Evolution (Task 6)

### Before (FLOWS-01 / MEMORY-01)
- IIFE rendering `recommendations[0]` (text string from `getStreamRecommendations()`)
- Always showed one static CTA button
- Not connected to snapshot history

### After (OBSERVATIONS-01)
- `ObservationStrip` component takes `CopilotObservation[]`
- Primary observation shows severity badge + RULE_BASED provenance + snapshot count
- Additional observations in compact list with severity dots
- Honest fallback when memory is building: "Memoria operacional acumulándose..."
- Severity-matched colors (green/info/amber/orange/red) via `OBS_SEVERITY_STYLES`
- `relatedWorkspace` links shown as inline "Revisar →" buttons

### Data flow
```
page.tsx (server):
  allSnapshots = getAllStreamSnapshots(orgId, 90)
  streams = buildFinancialStreams(...)
  observations = generateAllObservations(streams, allSnapshots, orgSlug)
  → prop: observations: CopilotObservation[]

recon-client.tsx (client):
  <ObservationStrip observations={observations} memoryTier={...} />
```

---

## What Was NOT Touched

- SAG integration, sync engine, adapters — zero modifications
- Prisma schema, migrations — zero modifications
- `getCobrosBreakdown()`, any existing financial calculations — zero modifications
- Reconciliation engine, dry runs, auto-reconciliation — zero modifications
- Executive dashboard, Torre de Control workspace pages — zero modifications
- Matching logic — zero modifications
- Shell, routing, navigation — zero modifications
- `buildRuleBasedObservations()` in memory-helpers.ts — still present for backward compatibility (superseded, not deleted)

---

## Readiness for Financial Copilot

The observation engine is the direct predecessor of the Financial Copilot:

| Component | Status | What's needed for Copilot |
|-----------|--------|--------------------------|
| `CopilotObservation` type | ✅ Complete | Already the output contract |
| `generateObservations()` | ✅ Deterministic | LLM can enrich the `message` field later |
| `confidence: "RULE_BASED"` | ✅ Honest provenance | LLM tier adds "HIGH"/"MEDIUM" when pattern is confirmed |
| `basedOnSnapshots: N` | ✅ Traceable evidence | Copilot knows how much history informed the observation |
| Severity scale | ✅ 5-tier | Copilot preserves severity from deterministic engine |
| `relatedWorkspace` | ✅ Present | Copilot can add workspace-specific context |

**The Copilot's job in the future:**
Replace the template-based `message` string with a natural-language enriched version — same data, better communication. The observation engine provides the facts; the Copilot provides the voice.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Agentik generates observations derived from real snapshots | ✅ `generateAllObservations()` wired through page.tsx |
| 2 | Observations are explainable (why + evidence in message) | ✅ Every message includes count + duration |
| 3 | No fake AI | ✅ `confidence: "RULE_BASED"` on every observation |
| 4 | Consistent severity scale | ✅ 5-tier: ok/info/watch/elevated/critical |
| 5 | Module feels more intelligent | ✅ Temporal patterns replace 1-day snapshot comparison |
| 6 | Everything deterministic | ✅ Same inputs always produce same observations |
| 7 | Reconciliation not broken | ✅ Zero changes to reconciliation logic |
| 8 | SAG not broken | ✅ Zero SAG changes |
| 9 | Copilot strip uses real observations | ✅ `ObservationStrip` replaces old IIFE strip |
| 10 | TypeScript zero regressions | ✅ 162 → 162 |

---

## Next Sprint Recommendation

**AGENTIK-FINANCIAL-OBSERVATIONS-02 — Weekly Pattern Detection & Stream Trend Indicators**

Requires: ≥7 days of accumulated snapshots.

1. Add `detectWeeklyPeak(sorted)` — which day-of-week historically has highest pending
   — Requires ≥14 snapshots
   — Observation type: `"pattern_repeat"` with day-of-week evidence

2. Add inline trend arrows to `StreamRow` in `FinancialStreamsPanel`
   — `▲ +3` (growing, watch color) or `▼ -2` (shrinking, ok color)
   — Only shown for streams with ≥3 snapshots
   — Data passed as `streamTrend?: { direction: "up" | "down" | "stable"; delta: number }` prop

3. Expand `ObservationStrip` to show a "memory readiness" inline badge
   — When `readinessTier === "building"`: "2 días · patrones en 5 días más"
   — When `readinessTier === "warming"`: "9 días · análisis semanal disponible"
   — When `readinessTier === "ready"`: remove the badge (memory is operational, no need to explain)

This sprint requires no schema changes and no new API routes.
