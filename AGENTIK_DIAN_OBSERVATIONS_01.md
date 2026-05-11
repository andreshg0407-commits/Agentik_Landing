# AGENTIK-DIAN-OBSERVATIONS-01
## Deterministic Fiscal Operational Observations

**Sprint closed:** 2026-05-10
**New files:** 4 (observation layer) + 0 new Prisma models
**Modified files:** 3 (dian-sync-types.ts, dian-sync-fiscal-memory.ts, dian-sync-orchestrator.ts)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Make Agentik interpret DIAN fiscal operational behavior using real fiscal memory, sync jobs, and deterministic observations.

```
SYNC-01:          fiscal sync infrastructure + job tracking + fiscal memory
OBSERVATIONS-01:  deterministic pattern detection → fiscal observations
                  (this sprint)
OBSERVATIONS-02:  (future) trend analysis, Copilot enrichment, conciliation gate
```

---

## Observation Philosophy

### What a fiscal observation IS

A factual statement derived from verified fiscal sync data:

```
✅ "Castillitos habilitación: 4 SOAP faults en los últimos 7 intentos."
✅ "Certificado DIAN expira en 11 días — renovación requerida."
✅ "ARKETOPS fiscal sync sin actividad hace 4 días."
✅ "Operación fiscal estable — 8 ejecuciones exitosas consecutivas."
✅ "Latencia DIAN degradada — promedio reciente 2800ms vs 1100ms anterior (+154%)."
```

### What a fiscal observation is NOT

```
❌ "Riesgo tributario detectado"           (no scoring)
❌ "Posible evasión fiscal"                (no fabrication)
❌ "Cash flow irregular esta semana"       (no predictions)
❌ "Agentik recomienda revisar impuestos"  (no marketing copy)
```

### Explainability principle

Every observation includes:
- **What** happened (SOAP fault / cert expiry / latency / stale sync)
- **How many / how long** (4 SOAP faults, 7 intentos, 11 días)
- **What changed** (2800ms vs 1100ms anterior, de fallo a 8 éxitos)
- **Evidence string** (exact data source backing the signal)

No observation is a black box.

### Operational calmness principle

- Silence is the signal for nominal state
- Quiet operational states emit one calm positive signal (not a flood of "all OK")
- Severity escalates with repetition and duration — not with first occurrence
- Alert fatigue is prevented by grouping and capping (1 primary + 3 grouped)

---

## Architecture

### Layer separation

```
dian-observation-loader.ts   → Prisma reads (only file with side effects)
dian-observation-patterns.ts → Pure temporal detectors (no Prisma, no side effects)
dian-observation-engine.ts   → Pure transformation: input → FiscalObservation[]
dian-observation-types.ts    → Type surface (FiscalObservation, input/output types)
```

Mirrors `lib/financial/observation-engine.ts` + `lib/financial/attention-router.ts` pattern.

### Input chain

```
1. dian-observation-loader.ts
   → loadFiscalObservationInput(orgId, operation, environment)
   → reads: Integration.metaJson (fiscal memory) + TenantDianIntegration (cert metadata)
   → returns: FiscalObservationInput (pure data bag)

2. dian-observation-engine.ts
   → generateFiscalObservations(input: FiscalObservationInput)
   → pure function — zero Prisma, zero side effects
   → returns: FiscalObservation[] sorted by severity

3. dian-observation-engine.ts
   → routeFiscalAttention(observations)
   → groups by type, caps at 1+3, derives escalation level
   → returns: FiscalAttentionResult
```

### Fiscal memory ring buffer (DianFiscalMemoryEntry)

Extended in this sprint with OBSERVATIONS-01 fields:

| Field | Type | Purpose |
|-------|------|---------|
| `lastHealthyAt` | `string \| undefined` | ISO of last SUCCEEDED run |
| `operationalStreak` | `number` | Consecutive successes (resets on failure) |
| `retryStreak` | `number` | Consecutive syncs with retryCount > 0 |
| `recentOutcomes` | `DianSyncOutcomeEntry[]` | Last 10 outcomes (ring buffer) |

`DianSyncOutcomeEntry`: `{ status, errorCode?, retryCount, durationMs, at }`

The `recentOutcomes` ring buffer is the primary signal source for all pattern detectors — no extra Prisma query needed in the engine.

---

## Implemented Observation Rules

### Certificate health (no history required)

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_CERT_EXPIRED | `cert_expired` | **critical** | `certExpiresAt` is in the past — terminal |
| R_CERT_EXPIRING_7 | `cert_expiring_soon` | **critical** | ≤ 7 days remaining |
| R_CERT_EXPIRING_14 | `cert_expiring_soon` | **elevated** | 8–14 days remaining |
| R_CERT_EXPIRING_30 | `cert_expiring_soon` | **watch** | 15–30 days remaining |
| R_CERT_UNKNOWN | `cert_health_unknown` | **info** | No `certExpiresAt` recorded (once ≥1 sync run) |

`cert_expired` is **terminal** — no other rules run. The integration cannot operate until the cert is renewed.

### Sync activity (≥1 outcome)

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_NEVER_SYNCED | `tenant_never_synced` | **info** | `successCount + failureCount = 0` |
| R_MEMORY | `fiscal_memory_building` | **info** | `totalRuns < 5` |
| R_STALE_3 | `stale_fiscal_sync` | **elevated** | No sync in last 3–7 days |
| R_STALE_7 | `stale_fiscal_sync` | **critical** | No sync in 7+ days |

### Failure patterns (require ≥5 outcomes in buffer)

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_SOAP_FAULT_3 | `repeated_soap_fault` | **elevated** | `SOAP_FAULT` ≥ 3 in last 10 outcomes |
| R_SOAP_FAULT_5 | `repeated_soap_fault` | **critical** | `SOAP_FAULT` ≥ 5 in last 10 outcomes |
| R_WSSE | `repeated_wsse_failure` | **elevated** | `WSSE_SIGNING_FAILED` ≥ 2 in last 10 |
| R_UNSTABLE_30 | `unstable_environment` | **elevated** | Success rate < 50% over last 10 |
| R_UNSTABLE_20 | `unstable_environment` | **critical** | Success rate < 30% over last 10 |

### Latency (require ≥10 latency samples)

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_LATENCY_50 | `latency_degradation` | **watch** | Recent avg 50–99% higher than previous 5 |
| R_LATENCY_100 | `latency_degradation` | **elevated** | Recent avg ≥ 100% higher than previous 5 |

Compares last 5 latency samples vs preceding 5. Requires `recentLatencies` ≥ 10.

### Retry behavior (from retryStreak field)

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_RETRY_STREAK | `retry_escalation` | **watch** | `retryStreak ≥ 3` consecutive syncs with retries |

### Positive / quiet states

| Rule | Type | Severity | Trigger |
|------|------|----------|---------|
| R_RECOVERY | `sync_recovery` | **ok** | `operationalStreak ≥ 3` AND `failureCount > 0` |
| R_STABLE | `stable_fiscal_ops` | **ok** | `operationalStreak ≥ 5` AND success rate ≥ 90% |
| R_QUIET | `stable_fiscal_ops` | **info** | No other rules fired — calm state |

---

## Severity Strategy

```
ok        — Positive signal: sync_recovery, stable_fiscal_ops
info      — Neutral: tenant_never_synced, fiscal_memory_building, cert_health_unknown, quiet state
watch     — Monitor: cert_expiring_soon (30d), stale_sync (3d), latency_degradation (50%), retry_escalation
elevated  — Act soon: cert_expiring_soon (14d), repeated_soap_fault, wsse_failure, unstable_env
critical  — Urgent: cert_expired, cert_expiring_soon (7d), stale_sync (7d), unstable_env (30% rate)
```

---

## Temporal Pattern Helpers (Pure Functions)

All in `dian-observation-patterns.ts`. All injectable `now: Date` for testing.

| Helper | Purpose |
|--------|---------|
| `certificateExpiryWindow(certExpiresAt)` | Returns `expired \| critical \| elevated \| watch \| ok \| unknown` + daysRemaining |
| `repeatedFailurePattern(outcomes, code, minCount, window)` | Count occurrences of error code in ring buffer |
| `computeSuccessRate(outcomes, window)` | Success rate over last N outcomes |
| `retryEscalation(retryStreak, minStreak)` | Detects consecutive retry-required syncs |
| `staleFiscalSync(lastRunAt, maxDaysGap)` | Days since last sync vs threshold |
| `latencyDegradation(recentLatencies, minPctChange)` | Recent 5 vs prior 5 comparison |
| `recoveryPattern(operationalStreak, failureCount, minStreak)` | Was failing, now succeeding |
| `stableOperationPattern(streak, outcomes, minStreak, minRate)` | All-positive signal |

---

## Grouping (Task 8 — Alert Fatigue Reduction)

`groupFiscalObservations(observations)` aggregates observations of the same type across tenants:

```
NOT:
  - "Castillitos habilitación: 4 SOAP faults en los últimos 7 intentos."
  - "ARKETOPS habilitación: 3 SOAP faults en los últimos 8 intentos."
  - "Diana habilitación: 5 SOAP faults en los últimos 10 intentos."

YES:
  - "3 tenants presentan SOAP faults repetitivos."
```

`routeFiscalAttention(observations)` caps display at 1 primary + 3 grouped signals.
Excess signals → `quietCount`.

---

## Quiet Operational States (Task 7)

When no pattern rules fire, the engine emits one calm signal:

```
"Operación fiscal estable — 8 ejecuciones exitosas consecutivas (95% de éxito en las últimas 10)."
"Operación fiscal estable."
"Sin degradaciones tributarias relevantes."
"Memoria fiscal acumulándose."
```

NO alert spam. NO fake urgency. Silence for nominal state.

---

## Future Reconciliation Readiness (Task 9)

Documented in `FISCAL_RECONCILIATION_READINESS` constant in `dian-observation-types.ts`:

| Reconciliation concern | Data contract |
|------------------------|--------------|
| XML ↔ banco gate | `FiscalObservation[stable_fiscal_ops \| sync_recovery]` signals DIAN sync is healthy before cross-reference |
| CUFE ↔ ERP correlation | `DianFiscalMemoryEntry.operationalStreak >= 5` signals consistent GetAcquirer responses |
| Fiscal-bank window | `DianSyncOutcomeEntry[].at` timestamps for sync window correlation |
| XML ↔ SAG | FUTURE — requires SAG invoice-level adapter |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Fiscal observations generated from real sync memory | ✅ 14 observation types, all from DianFiscalMemoryEntry |
| 2 | All observations are explainable | ✅ Every observation has `message` + `evidence` fields |
| 3 | No fake AI fiscal intelligence | ✅ `confidence: "RULE_BASED"` enforced; no LLMs |
| 4 | Grouping across tenants | ✅ `groupFiscalObservations()` + `synthesizeGroupMessage()` |
| 5 | Quiet operational state | ✅ R_STABLE, R_QUIET — calm messages, no spam |
| 6 | No tenant data leakage | ✅ Each `FiscalObservationInput` is strictly per-org |
| 7 | DIAN sync infrastructure untouched | ✅ Sync-01 files only extended, not modified in behavior |
| 8 | Financial infrastructure untouched | ✅ Zero modifications to lib/financial/* |
| 9 | Architecture ready for reconciliation | ✅ `FISCAL_RECONCILIATION_READINESS` contracts documented |
| 10 | Zero new TypeScript errors | ✅ 162 → 162 |
| 11 | Pure engine (no Prisma in engine) | ✅ Only `dian-observation-loader.ts` touches Prisma |
| 12 | Minimum data requirements enforced | ✅ Rules skip silently below thresholds (no fabrication) |

---

## What Was Intentionally NOT Implemented

- **AI fiscal scoring** — no LLMs, no ML models, no heuristic scoring
- **Fraud / evasion detection** — no invented anomaly signals
- **Tax predictions** — no forecasting of fiscal outcomes
- **SAG correlation** — no DIAN ↔ SAG cross-reference (scheduled for later sprint)
- **Bank ↔ XML reconciliation** — contracts documented, not implemented
- **CUFE validation** — no CUFE generation or validation
- **Fiscal dashboard components** — engine is backend-only; UI integration is a separate sprint
- **Alert persistence** — observations are generated on-demand, not stored in DB
- **Scheduled observation cron** — entry point exists; scheduling is infrastructure concern

---

## What Was NOT Touched

- SAG integration — zero modifications
- Financial observation engine — zero modifications
- Financial attention router — zero modifications
- Reconciliation layer — zero modifications
- Executive dashboards — zero modifications
- Prisma schema — zero modifications
- Marketing studio — zero modifications
- DIAN signing layer — zero modifications

---

## Fiscal Memory Evolution (Task 6)

`DianFiscalMemoryEntry` extended with OBSERVATIONS-01 fields:

```typescript
// Added to existing DianFiscalMemoryEntry in dian-sync-types.ts:
lastHealthyAt?:    string;                 // ISO of last SUCCEEDED run
operationalStreak: number;                 // consecutive successes (resets on failure)
retryStreak:       number;                 // consecutive syncs with retryCount > 0
recentOutcomes:    DianSyncOutcomeEntry[]; // last 10 outcomes (ring buffer)

// New type added:
interface DianSyncOutcomeEntry {
  status:     "succeeded" | "failed";
  errorCode?: string;
  retryCount: number;
  durationMs: number;
  at:         string;  // ISO
}
```

`recordSyncOutcome()` in `dian-sync-fiscal-memory.ts` updated to compute all new fields.

---

## Next Sprint Recommendation

**AGENTIK-DIAN-OBSERVATIONS-02 — Fiscal Observation UI + Copilot Integration**

Steps:
1. Surface `FiscalAttentionResult` in the Agentik workspace (Torre de Control fiscal strip)
2. Connect `routeFiscalAttention()` to the right-ops-rail observation slot
3. Implement per-org fiscal health panel (cert status, sync streak, latency trend)
4. Introduce fiscal observation persistence (store `FiscalObservation[]` in DB for history)
5. Wire `FISCAL_RECONCILIATION_READINESS.dianXmlBancoGate` as a pre-check in the reconciliation engine
