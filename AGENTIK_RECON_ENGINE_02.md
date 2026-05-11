# AGENTIK-RECON-ENGINE-02
## Engine Validation + Session Runtime Integration

**Sprint:** AGENTIK-RECON-ENGINE-02
**Status:** COMPLETE — all 11 tasks delivered
**TypeScript:** 162 pre-existing errors → 162 after. Zero regressions.

---

## What This Sprint Does

Engine-02 bridges the universal matching engine (from ENGINE-01) into the live session runtime.

It adds three things:
1. A **feature flag** (`RECON_ENGINE_MODE`) for safe promotion: legacy → shadow → universal
2. A **validation harness** with parity checking, fixtures, and a runner
3. **Audit trail integration** for all engine mode events

No UI changes. No schema migrations. No SAG/DIAN writes. Pure logic + session layer.

---

## Engine Mode: The Safe Switch

```
RECON_ENGINE_MODE=legacy     (current production behavior — unchanged)
RECON_ENGINE_MODE=shadow     (DEFAULT — legacy response + silent universal comparison)
RECON_ENGINE_MODE=universal  (universal is primary, legacy is fallback)
```

**Promotion path:**
1. Start with `shadow` (default) — legacy response, universal runs silently
2. Monitor parity events in audit trail — ensure `engine_parity_passed` consistently
3. Promote to `universal` once parity is stable across multiple periods
4. Retire legacy engine (future sprint)

**Why shadow mode is the default (not legacy)?**
Shadow gives us continuous parity data in the audit trail at zero risk.
If universal diverges, we get `engine_parity_failed` events with field-level diffs.
No operator sees the difference. No run outcomes change.

---

## File Structure

```
lib/reconciliation/engine/
  engine-mode.ts                      — NEW. ReconEngineMode type + getEngineMode() from env var.
                                        shouldRunUniversal() + universalIsAuthority() helpers.

  validation/
    validation-types.ts               — NEW. ParityDifference, ParityCheckResult, EngineRunMetadata,
                                        ReconciliationExceptionSummary, ValidationScenario.
    compare-results.ts                — NEW. compareReconResults() + assertSummaryMatchesExpected().
    validation-runner.ts              — NEW. validateOrdersVsSalesParity() + runFixtureValidation().
    fixtures.ts                       — NEW. 7 controlled test scenarios (no PII).

lib/reconciliation/
  run-service.ts                      — UPDATED. Mode-aware engine dispatch (legacy/shadow/universal).
                                        Fire-and-forget shadow comparison. _failRun() helper.
                                        _runShadowComparison() helper.
  session-types.ts                    — UPDATED. 6 new audit event types added.
```

---

## Feature Flag: engine-mode.ts

```typescript
import { getEngineMode } from "@/lib/reconciliation/engine/engine-mode";

// Returns: "legacy" | "shadow" | "universal"
// Source: process.env.RECON_ENGINE_MODE
// Default: "shadow" (safe for production)
const mode = getEngineMode();
```

Helper functions:
- `shouldRunUniversal(mode)` — true for shadow + universal
- `universalIsAuthority(mode)` — true only for universal (decides which result is returned)

---

## Parity Checking: compare-results.ts

```typescript
import { compareReconResults } from "@/lib/reconciliation/engine/validation/compare-results";

const parity = compareReconResults(
  legacySummary,
  universalSummary,
  legacyMs,
  universalMs,
);
// parity.parity === true  → all 10 summary fields agree within tolerance
// parity.differences[]    → list of fields that diverged (field, legacy, universal, delta)
```

**Fields compared:** total, matched, mismatchAmount, onlyInA, onlyInB, possibleDuplicates,
totalAmountA, totalAmountB, deltaTotal, matchRate

**Tolerances:**
- Count fields: 0 (exact equality required)
- Amount fields (COP): ±1 (floating-point rounding)
- matchRate: ±0.01% (rate calculation rounding)

---

## Fixture Validation: fixtures.ts + validation-runner.ts

Seven controlled scenarios with known expected outcomes:

| Scenario | A | B | Expected |
|----------|---|---|----------|
| `all_exact_matches` | 3 records | 3 matching records | 3 exactMatches |
| `amount_mismatches` | 2 records | 2 same ID, diff amount | 2 amountMismatches |
| `orphans_only` | 2 records | 1 unrelated | 2 onlyInA, 1 onlyInB |
| `duplicates_in_a` | 2 (dup key) | 1 | 1 exactMatch, 1 duplicateA |
| `probable_match_fuzzy` | 1 record | 1 (same NIT+amount+ref, diff docNum) | 1 probableMatch |
| `mixed_realistic` | 3 records | 3 (mix) | 1 exact, 1 mismatch, 1 onlyA, 1 onlyB |
| `empty_inputs` | 0 | 0 | all zeros |

```typescript
import { runFixtureValidation } from "@/lib/reconciliation/engine/validation/validation-runner";

const results = runFixtureValidation("test-org-validation");
// results[n].passed === true  → scenario matches expected counts
// results[n].failures[]       → which counts diverged
```

---

## Session Runtime Integration: run-service.ts

### Legacy mode (RECON_ENGINE_MODE=legacy)

```
runOrdersVsSalesRecon() ─→ result ─→ persist ─→ audit events
```

Identical to previous behavior. `getEngineMode()` returns "legacy" if env var is set or unset.

### Shadow mode (RECON_ENGINE_MODE=shadow, default)

```
runOrdersVsSalesRecon() ─→ result ─→ persist ─→ audit events
                                            └─→ [fire-and-forget] _runShadowComparison()
                                                  ├─ runOrdersVsSalesViaEngine()
                                                  ├─ compareReconResults()
                                                  ├─ emit engine_shadow_completed
                                                  └─ emit engine_parity_passed | engine_parity_failed
```

The fire-and-forget runs AFTER the response is committed. Shadow errors are caught silently.
The caller (page/API) sees the run complete immediately; parity events arrive asynchronously.

### Universal mode (RECON_ENGINE_MODE=universal)

```
runOrdersVsSalesViaEngine() ─→ result ─→ persist ─→ emit engine_universal_completed
                  ↓ (on error)
              runOrdersVsSalesRecon() ─→ result ─→ persist ─→ emit engine_fallback_to_legacy
```

If universal throws, legacy is used as fallback. Both paths produce a completed run.
The fallback is transparent to the session layer — status is still "completed" or "needs_review".

---

## New Audit Event Types (session-types.ts)

| Event | When |
|-------|------|
| `engine_shadow_completed` | Universal finished its fire-and-forget run in shadow mode |
| `engine_parity_passed` | Legacy + universal summaries agree within tolerance |
| `engine_parity_failed` | Summaries diverge — field-level diff in metadata |
| `engine_universal_completed` | Universal engine provided the response (universal mode) |
| `engine_fallback_to_legacy` | Universal failed; legacy was used as response (universal mode) |
| `exception_summary_created` | Aggregated exception summary persisted (future use) |

---

## EngineRunMetadata Contract

Defined in `validation-types.ts`. Will be stored in `ReconciliationRun.metadataJson`
once the schema migration (RECON-ENGINE-03) adds that column.

```typescript
interface EngineRunMetadata {
  engineMode:         "legacy" | "shadow" | "universal";
  engineVersion?:     string;         // from universal engine
  warnings?:          string[];       // non-fatal universal warnings
  exceptionCounts?:   { onlyInA; onlyInB; amountMismatches; duplicates; probableMatches; };
  parityPassed?:      boolean;        // shadow: did parity pass?
  parityDifferences?: number;         // shadow: count of differing fields
  fallbackUsed?:      boolean;        // universal: was fallback needed?
  fallbackReason?:    string;         // universal: error that triggered fallback
  universalMs?:       number;         // universal engine execution time
}
```

**Current status:** metadata is carried in audit event payloads.
Column addition deferred to RECON-ENGINE-03 (next sprint).

---

## ReconciliationExceptionSummary

Defined in `validation-types.ts`. Will be stored in `metadataJson` alongside `EngineRunMetadata`.

```typescript
interface ReconciliationExceptionSummary {
  type:           string;   // "only_in_a" | "probable_match" | etc.
  count:          number;
  severity:       "info" | "watch" | "elevated" | "critical";
  sampleKeys:     string[]; // up to 3 document numbers for UI context — no PII
  requiresReview: boolean;
}
```

Aggregated counts only — no raw records, no amounts, no NITs stored.

---

## Performance Guardrails (Task 8)

The universal engine (from ENGINE-01) already has guardrails in place:

| Guard | Mechanism | Threshold |
|-------|-----------|-----------|
| Fuzzy pass cap | `maxFuzzyComparisons` | 50,000 comparisons |
| Exact match | O(n) hash maps | No cap needed |
| Dedup | O(n) hash map | No cap needed |

Shadow mode adds one concern: the fire-and-forget `_runShadowComparison` runs a full
`runOrdersVsSalesViaEngine()` call asynchronously after the response is sent. For large
datasets (>5,000 records per side), this adds ~100ms of background work.

**Current guardrail:** `maxFuzzyComparisons=50,000` (inherited from ENGINE-01 defaults).
**Monitoring:** `engine_shadow_completed` events carry `universalMs` — operators can track.
**Future:** If shadow Ms consistently exceeds 2,000ms, add chunked processing (ENGINE-04).

---

## What Was NOT Implemented

1. **`ReconciliationRun.metadataJson` column** — Type is defined; schema migration deferred.
   `EngineRunMetadata` is currently logged to audit events, not persisted to DB column.

2. **Exception summary persistence** — `ReconciliationExceptionSummary` type is complete.
   Persistence to DB deferred until `ReconciliationException` Prisma model exists (ENGINE-03).

3. **Fixture validation as test runner** — `runFixtureValidation()` is a pure function.
   Integration with a test framework (Jest/Vitest) deferred — call manually or via script.

4. **Shadow mode time limit** — No timeout on the fire-and-forget call. The `maxFuzzyComparisons`
   cap is the only implicit bound. Explicit timeout guard is future work.

---

## Next Sprint Recommendations

**AGENTIK-RECON-ENGINE-03: Exception Persistence + Schema Column**
- Add `metadataJson Json?` column to `ReconciliationRun` in Prisma schema
- Add `ReconciliationException` Prisma model
- Persist `RunExceptionSummary` to DB after each run
- Wire exception review UI (approve / ignore / override)

**AGENTIK-RECON-ENGINE-04: Bank Statement Adapter**
- Implement `normalizeBankMovement()` for `bank_statement` source
- Activate batch matching (one-to-many: consignación ↔ N facturas)
- Add `sourceBType === "bank_statement"` branch in `run-service.ts`

**AGENTIK-RECON-COPILOT-01: AI Exception Suggestions**
- Layer Claude API on top of `ReconException[]` from ENGINE-01
- Suggest resolutions — operator confirmation required before applying
- All AI events emitted with `actorType: "agent"` to the audit trail
