/**
 * lib/reconciliation/engine/validation/validation-runner.ts
 *
 * AGENTIK-RECON-ENGINE-02 — Task 2
 * Parity Validation Runner
 *
 * `validateOrdersVsSalesParity()`:
 *   - Runs both the legacy and universal engines on the same input
 *   - Returns a ParityCheckResult comparing their summaries
 *   - Used in shadow mode to detect regressions before promoting universal
 *
 * `runFixtureValidation()`:
 *   - Runs all controlled scenarios from fixtures.ts through the universal engine
 *   - Returns pass/fail per scenario
 *   - Use this to regression-test the engine against known ground truth
 *
 * IMPORTANT:
 *   - Pure logic — no Prisma, no DB, no HTTP calls
 *   - Backend-only. Never import in client components.
 *   - Does NOT touch SAG, DIAN, cartera, or CollectionAllocation
 */

import { runUniversalRecon }        from "../recon-engine";
import type { CanonicalReconRecord } from "../../canonical-record";
import type { ReconciliationSummarySnapshot } from "../../session-types";
import type { ReconciliationEngineResult }   from "../engine-types";
import { compareReconResults, assertSummaryMatchesExpected } from "./compare-results";
import type { ParityCheckResult, ValidationScenario }        from "./validation-types";
import { ALL_VALIDATION_SCENARIOS }                           from "./fixtures";

// ── Parity check ──────────────────────────────────────────────────────────────

/**
 * Validate parity between a legacy summary and the universal engine.
 *
 * Runs the universal engine on the provided canonical records and compares
 * its summary against the legacy summary already computed by the caller.
 *
 * This keeps the function pure: the caller supplies the legacy summary
 * (already computed as part of the normal run path); this function only
 * runs the universal engine and performs the comparison.
 *
 * @param organizationId   Required — tenant isolation
 * @param legacySummary    Summary from the legacy engine run
 * @param legacyMs         Wall-clock time of the legacy run in ms
 * @param recordsA         Canonical records from source A
 * @param recordsB         Canonical records from source B
 * @param sessionId        Optional session ID for audit trail linkage
 */
export function validateOrdersVsSalesParity(params: {
  organizationId: string;
  legacySummary:  ReconciliationSummarySnapshot;
  legacyMs:       number;
  recordsA:       CanonicalReconRecord[];
  recordsB:       CanonicalReconRecord[];
  sessionId?:     string | null;
}): ParityCheckResult {
  const { organizationId, legacySummary, legacyMs, recordsA, recordsB, sessionId } = params;

  const t0 = Date.now();
  let universalResult: ReconciliationEngineResult;
  const warnings: string[] = [];

  try {
    universalResult = runUniversalRecon({
      organizationId,
      sessionId:    sessionId ?? null,
      sourceAType:  "sag_orders",
      sourceBType:  "sag_sales",
      sourceALabel: "Pedidos (parity check)",
      sourceBLabel: "Ventas (parity check)",
      recordsA,
      recordsB,
      options: {
        amountTolerance:     0.001,
        minFuzzyScore:       60,
        dateFuzzyDays:       31,
        maxFuzzyComparisons: 50_000,
        detectDuplicates:    true,
      },
    });
    warnings.push(...universalResult.warnings);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Universal engine error during parity check: ${msg}`);
    // Return a failed parity result (can't compare if universal threw)
    return {
      parity:           false,
      differences:      [{ field: "engine_error", legacy: 0, universal: -1, delta: 1 }],
      legacySummary,
      universalSummary: legacySummary,   // placeholder — same as legacy for downstream safety
      legacyMs,
      universalMs:      Date.now() - t0,
      warnings,
    };
  }

  const universalMs = Date.now() - t0;

  return compareReconResults(
    legacySummary,
    universalResult.summary,
    legacyMs,
    universalMs,
    warnings,
  );
}

// ── Fixture-based regression tests ────────────────────────────────────────────

/** Result of running one ValidationScenario through the universal engine. */
export interface FixtureValidationResult {
  scenarioName: string;
  passed:       boolean;
  failures:     string[];
  executionMs:  number;
  summary:      ReconciliationSummarySnapshot;
}

/**
 * Run all controlled test scenarios through the universal engine
 * and assert that each produces the expected counts.
 *
 * Safe to call in any environment — uses only synthetic data.
 * Does not write to the database.
 *
 * @param organizationId  Tenant ID to satisfy the engine's mandatory check.
 *                        Use a test-org ID in CI (e.g. "test-org-validation").
 */
export function runFixtureValidation(
  organizationId: string,
  scenarios: ValidationScenario[] = ALL_VALIDATION_SCENARIOS,
): FixtureValidationResult[] {
  return scenarios.map(scenario => {
    const t0 = Date.now();

    let result: ReconciliationEngineResult;
    try {
      result = runUniversalRecon({
        organizationId,
        sourceAType:  "sag_orders",
        sourceBType:  "sag_sales",
        sourceALabel: `Fixture A: ${scenario.name}`,
        sourceBLabel: `Fixture B: ${scenario.name}`,
        recordsA:     scenario.recordsA,
        recordsB:     scenario.recordsB,
        options: {
          amountTolerance:     0.001,
          minFuzzyScore:       60,
          dateFuzzyDays:       31,
          maxFuzzyComparisons: 50_000,
          detectDuplicates:    true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        scenarioName: scenario.name,
        passed:       false,
        failures:     [`Engine threw: ${msg}`],
        executionMs:  Date.now() - t0,
        summary:      {
          total: 0, matched: 0, mismatchAmount: 0, onlyInA: 0, onlyInB: 0,
          possibleDuplicates: 0, totalAmountA: 0, totalAmountB: 0,
          deltaTotal: 0, matchRate: 0,
        },
      };
    }

    const executionMs = Date.now() - t0;
    const failures    = assertSummaryMatchesExpected(result.summary, scenario.expected);

    return {
      scenarioName: scenario.name,
      passed:       failures.length === 0,
      failures,
      executionMs,
      summary:      result.summary,
    };
  });
}
