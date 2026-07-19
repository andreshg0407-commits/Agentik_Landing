/**
 * lib/reconciliation/engine/validation/compare-results.ts
 *
 * AGENTIK-RECON-ENGINE-02 — Task 1
 * Parity Comparison Between Legacy and Universal Engine Outputs
 *
 * `compareReconResults()` compares two ReconciliationSummarySnapshot values
 * and produces a ParityCheckResult that lists every numeric field that diverges
 * beyond the configured tolerance.
 *
 * Used in shadow mode to detect regressions before promoting universal to primary.
 *
 * IMPORTANT:
 *   - Pure logic — no Prisma, no DB, no HTTP calls
 *   - Backend-only. Never import in client components.
 *   - Does NOT modify any records or produce side effects
 */

import type { ReconciliationSummarySnapshot } from "../../session-types";
import type { ParityCheckResult, ParityDifference } from "./validation-types";

// ── Fields compared ───────────────────────────────────────────────────────────

/**
 * Which summary fields are compared for parity.
 * All are numeric. matchRate is compared with relaxed tolerance (see below).
 */
const PARITY_FIELDS: ReadonlyArray<keyof ReconciliationSummarySnapshot> = [
  "total",
  "matched",
  "mismatchAmount",
  "onlyInA",
  "onlyInB",
  "possibleDuplicates",
  "totalAmountA",
  "totalAmountB",
  "deltaTotal",
  "matchRate",
] as const;

// ── Tolerance ─────────────────────────────────────────────────────────────────

/**
 * Absolute tolerance for integer count fields.
 * Zero: counts must be exactly equal.
 */
const COUNT_TOLERANCE = 0;

/**
 * Absolute tolerance for amount fields (COP).
 * 1 COP difference is acceptable due to floating-point rounding.
 */
const AMOUNT_TOLERANCE_COP = 1;

/**
 * Absolute tolerance for matchRate (percentage 0–100).
 * 0.01 = 0.01% — negligible rounding in rate calculation.
 */
const MATCH_RATE_TOLERANCE = 0.01;

/** Amount fields (use AMOUNT_TOLERANCE_COP). */
const AMOUNT_FIELDS = new Set<keyof ReconciliationSummarySnapshot>([
  "totalAmountA",
  "totalAmountB",
  "deltaTotal",
]);

/** Rate fields (use MATCH_RATE_TOLERANCE). */
const RATE_FIELDS = new Set<keyof ReconciliationSummarySnapshot>([
  "matchRate",
]);

function toleranceFor(field: keyof ReconciliationSummarySnapshot): number {
  if (AMOUNT_FIELDS.has(field)) return AMOUNT_TOLERANCE_COP;
  if (RATE_FIELDS.has(field))   return MATCH_RATE_TOLERANCE;
  return COUNT_TOLERANCE;
}

// ── Core comparison ───────────────────────────────────────────────────────────

/**
 * Compare two ReconciliationSummarySnapshots and return a ParityCheckResult.
 *
 * @param legacySummary    Summary produced by the legacy engine
 * @param universalSummary Summary produced by the universal engine
 * @param legacyMs         Wall-clock time of the legacy run in ms
 * @param universalMs      Wall-clock time of the universal run in ms
 * @param warnings         Any warnings to carry forward into the result
 */
export function compareReconResults(
  legacySummary:    ReconciliationSummarySnapshot,
  universalSummary: ReconciliationSummarySnapshot,
  legacyMs:         number,
  universalMs:      number,
  warnings:         string[] = [],
): ParityCheckResult {
  const differences: ParityDifference[] = [];

  for (const field of PARITY_FIELDS) {
    const legacyVal    = legacySummary[field]    as number;
    const universalVal = universalSummary[field]  as number;
    const delta        = Math.abs(universalVal - legacyVal);
    const tolerance    = toleranceFor(field);

    if (delta > tolerance) {
      differences.push({
        field:     field as string,
        legacy:    legacyVal,
        universal: universalVal,
        delta,
      });
    }
  }

  return {
    parity:           differences.length === 0,
    differences,
    legacySummary,
    universalSummary,
    legacyMs,
    universalMs,
    warnings,
  };
}

// ── Validation scenario assertion ─────────────────────────────────────────────

/**
 * Assert that a ReconciliationSummarySnapshot matches a ValidationScenario's
 * expected counts. Returns a list of assertion failures (empty = all pass).
 *
 * Used in fixture-based tests to verify the engine produces correct output.
 */
export function assertSummaryMatchesExpected(
  summary:  ReconciliationSummarySnapshot,
  expected: {
    exactMatches:     number;
    amountMismatches: number;
    onlyInA:          number;
    onlyInB:          number;
    probableMatches:  number;
    duplicatesA:      number;
    duplicatesB:      number;
  },
): string[] {
  const failures: string[] = [];

  function check(label: string, actual: number, exp: number) {
    if (actual !== exp) {
      failures.push(`${label}: expected ${exp}, got ${actual}`);
    }
  }

  check("matched (exactMatches)",        summary.matched,            expected.exactMatches);
  check("mismatchAmount",                summary.mismatchAmount,     expected.amountMismatches);
  check("onlyInA",                       summary.onlyInA,            expected.onlyInA);
  check("onlyInB",                       summary.onlyInB,            expected.onlyInB);
  // possibleDuplicates in summary = duplicatesA + duplicatesB (one group per side)
  check("possibleDuplicates (dupA+dupB)",
    summary.possibleDuplicates,
    expected.duplicatesA + expected.duplicatesB,
  );

  return failures;
}
