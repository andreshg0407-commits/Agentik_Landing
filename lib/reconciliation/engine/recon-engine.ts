/**
 * lib/reconciliation/engine/recon-engine.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Matching Engine — Main Orchestrator
 *
 * This is the single public entry point for all universal reconciliation runs.
 *
 * Algorithm (6 phases):
 *
 *   PHASE 1 — Validation
 *     Enforce organizationId. Validate non-empty inputs.
 *
 *   PHASE 2 — Duplicate detection
 *     Detect records in each side sharing the same document key.
 *     Duplicate groups are reported as exceptions.
 *     Only one representative per key enters matching.
 *
 *   PHASE 3 — Build indexes
 *     Build O(1) lookup structures from deduplicated source B records:
 *       - Document number index
 *       - External ID index
 *       - Composite (amount+NIT+date) index
 *
 *   PHASE 4 — Exact matching pass
 *     For each record in source A, try indexes in priority order:
 *       documentNumber → externalId → composite
 *     Matched pairs: exact_match (amounts match) or amount_mismatch.
 *
 *   PHASE 5 — Fuzzy pass (on unmatched records)
 *     Score unmatched A against unmatched B.
 *     Score >= minFuzzyScore → probable_match exception.
 *     Remaining A → only_in_a.
 *     Remaining B → only_in_b.
 *
 *   PHASE 6 — Build result
 *     Compute metrics, summary, assemble ReconciliationEngineResult.
 *
 * Tenant safety:
 *   - organizationId is required (throws if missing)
 *   - Engine never reads from DB — caller is responsible for tenant-scoped data
 *   - All record IDs flow through; organizationId is reflected in the result
 *
 * Performance:
 *   - Phases 3-4: O(n) with hash map lookups
 *   - Phase 5: O(n_a * n_b) with maxFuzzyComparisons cap (default 50_000)
 *   - No external I/O, no async operations
 *
 * IMPORTANT:
 *   - Pure logic — no Prisma, no DB, no HTTP calls
 *   - Backend-only. Never import in client components.
 *   - Does NOT touch SAG, DIAN, cartera, or CollectionAllocation
 */

import type { CanonicalReconRecord }   from "../canonical-record";
import type {
  UniversalReconParams,
  ReconciliationEngineResult,
  EngineMetrics,
  ReconException,
  DuplicateGroup,
  MatchedPair,
} from "./engine-types";
import { detectDuplicates }            from "./grouping";
import { buildIndexes, runExactMatchPass } from "./exact-match";
import { runFuzzyMatchPass }           from "./fuzzy-match";
import {
  classifyOnlyInA,
  classifyOnlyInB,
  classifyDuplicateGroup,
} from "./exception-engine";

/** Current engine version — bump when matching logic changes. */
const ENGINE_VERSION = "1.0.0";

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the universal reconciliation engine.
 *
 * Takes two arrays of CanonicalReconRecord, performs matching, and returns
 * a fully typed, explainable ReconciliationEngineResult.
 *
 * @throws Error if organizationId is empty or missing.
 */
export function runUniversalRecon(
  params: UniversalReconParams,
): ReconciliationEngineResult {
  const t0 = Date.now();

  // ── PHASE 1: Validation ────────────────────────────────────────────────────
  if (!params.organizationId) {
    throw new Error("[UniversalReconEngine] organizationId is required.");
  }

  const {
    organizationId,
    sessionId       = null,
    sourceAType,
    sourceBType,
    sourceALabel,
    sourceBLabel,
    recordsA,
    recordsB,
  } = params;

  const tolerance    = params.options?.amountTolerance  ?? 0.001;
  const minFuzzy     = params.options?.minFuzzyScore    ?? 60;
  const fuzzyDays    = params.options?.dateFuzzyDays    ?? 3;
  const maxCmp       = params.options?.maxFuzzyComparisons ?? 50_000;
  const doDedup      = params.options?.detectDuplicates ?? true;

  const warnings: string[] = [];

  // ── PHASE 2: Duplicate detection ──────────────────────────────────────────
  const dedupResultA = doDedup
    ? detectDuplicates(recordsA, "a")
    : { duplicates: [], uniqueRecords: recordsA, duplicateIds: new Set<string>() };

  const dedupResultB = doDedup
    ? detectDuplicates(recordsB, "b")
    : { duplicates: [], uniqueRecords: recordsB, duplicateIds: new Set<string>() };

  const allDuplicateGroups: DuplicateGroup[] = [
    ...dedupResultA.duplicates,
    ...dedupResultB.duplicates,
  ];

  const duplicateExceptions: ReconException[] = allDuplicateGroups.map(classifyDuplicateGroup);

  if (dedupResultA.duplicates.length > 0) {
    warnings.push(
      `Fuente A: ${dedupResultA.duplicates.length} clave(s) duplicada(s) detectada(s) — excluidas del matching primario.`,
    );
  }
  if (dedupResultB.duplicates.length > 0) {
    warnings.push(
      `Fuente B: ${dedupResultB.duplicates.length} clave(s) duplicada(s) detectada(s) — excluidas del matching primario.`,
    );
  }

  // ── PHASE 3: Build indexes ─────────────────────────────────────────────────
  const indexes = buildIndexes(dedupResultB.uniqueRecords);
  const usedBIds = new Set<string>();

  // ── PHASE 4: Exact matching pass ───────────────────────────────────────────
  const exactResult = runExactMatchPass(
    dedupResultA.uniqueRecords,
    indexes,
    usedBIds,
    tolerance,
  );

  const exactMatches: MatchedPair[] = exactResult.matches;

  // ── PHASE 5: Fuzzy matching pass ───────────────────────────────────────────
  // Build list of unmatched B records (not used by exact pass)
  const unmatchedBList = dedupResultB.uniqueRecords.filter(
    b => !exactResult.usedBIds.has(b.id),
  );

  const fuzzyResult = runFuzzyMatchPass(
    exactResult.unmatchedA,
    unmatchedBList,
    { minFuzzyScore: minFuzzy, maxComparisons: maxCmp, amountTolerance: tolerance, dateFuzzyDays: fuzzyDays },
  );

  warnings.push(...fuzzyResult.warnings);

  // Build only_in_a exceptions from orphan A records
  const onlyInAExceptions: ReconException[] = fuzzyResult.orphanA.map(classifyOnlyInA);

  // Build only_in_b exceptions from remaining unmatched B
  const onlyInBList = unmatchedBList.filter(b => !fuzzyResult.consumedBIds.has(b.id));
  const onlyInBExceptions: ReconException[] = onlyInBList.map(classifyOnlyInB);

  // ── PHASE 6: Build result ──────────────────────────────────────────────────
  const allMatches: MatchedPair[] = exactMatches;
  const allExceptions: ReconException[] = [
    ...duplicateExceptions,
    ...fuzzyResult.probableMatches,
    ...onlyInAExceptions,
    ...onlyInBExceptions,
  ];

  // Counts for metrics
  const exactMatchCount    = allMatches.filter(m => m.explanation.decision === "exact_match").length;
  const amountMismatchCount = allMatches.filter(m => m.explanation.decision === "amount_mismatch").length;
  const probableMatchCount = fuzzyResult.probableMatches.length;
  const onlyInACount       = onlyInAExceptions.length;
  const onlyInBCount       = onlyInBExceptions.length;
  const dupACount          = dedupResultA.duplicates.length;
  const dupBCount          = dedupResultB.duplicates.length;

  const totalAmountA = recordsA.reduce((s, r) => s + r.amount, 0);
  const totalAmountB = recordsB.reduce((s, r) => s + r.amount, 0);
  const deltaAmount  = totalAmountB - totalAmountA;

  // Match rate = exact_match / (exact_match + amount_mismatch + orphanA + orphanB)
  const denominator = exactMatchCount + amountMismatchCount + onlyInACount + onlyInBCount;
  const matchRate   = denominator > 0
    ? Math.round((exactMatchCount / denominator) * 10000) / 100
    : 0;

  const metrics: EngineMetrics = {
    totalInputA:      recordsA.length,
    totalInputB:      recordsB.length,
    deduplicatedA:    dedupResultA.uniqueRecords.length,
    deduplicatedB:    dedupResultB.uniqueRecords.length,
    exactMatches:     exactMatchCount,
    amountMismatches: amountMismatchCount,
    onlyInA:          onlyInACount,
    onlyInB:          onlyInBCount,
    probableMatches:  probableMatchCount,
    duplicateKeysA:   dupACount,
    duplicateKeysB:   dupBCount,
    totalAmountA,
    totalAmountB,
    deltaAmount,
    matchRate,
    executionMs:      Date.now() - t0,
  };

  // ReconciliationSummarySnapshot-compatible (for session layer)
  const summary = {
    total:              denominator + probableMatchCount,
    matched:            exactMatchCount,
    mismatchAmount:     amountMismatchCount,
    onlyInA:            onlyInACount,
    onlyInB:            onlyInBCount,
    possibleDuplicates: dupACount + dupBCount,
    totalAmountA,
    totalAmountB,
    deltaTotal:         deltaAmount,
    matchRate,
  };

  return {
    engineVersion: ENGINE_VERSION,
    organizationId,
    sessionId:     sessionId ?? null,
    sourceAType,
    sourceBType,
    sourceALabel,
    sourceBLabel,
    runAt:         new Date().toISOString(),
    matches:       allMatches,
    exceptions:    allExceptions,
    duplicates:    allDuplicateGroups,
    metrics,
    summary,
    warnings,
  };
}

// ── Convenience re-exports ────────────────────────────────────────────────────
// Consumers import only from recon-engine.ts — no need to import from sub-files.

export type {
  UniversalReconParams,
  ReconciliationEngineResult,
  MatchedPair,
  ReconException,
  DuplicateGroup,
  EngineMetrics,
} from "./engine-types";

export type { CanonicalReconRecord } from "../canonical-record";
