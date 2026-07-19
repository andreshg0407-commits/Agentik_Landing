/**
 * lib/reconciliation/engine/validation/validation-types.ts
 *
 * AGENTIK-RECON-ENGINE-02
 * Engine Validation + Session Runtime Integration — Type Surface
 *
 * Types for:
 *   - Parity checking between legacy and universal engine outputs
 *   - Engine run metadata storage contract (what goes in metadataJson)
 *   - Exception summary (aggregated counts, no raw records)
 *
 * IMPORTANT: Pure types — no Prisma, no side effects.
 * Backend-only. Never import in client components.
 */

import type { ReconEngineMode }             from "../engine-mode";
import type { ReconciliationSummarySnapshot } from "../../session-types";

// ── Parity check ──────────────────────────────────────────────────────────────

/**
 * One discrepancy between legacy and universal engine outputs.
 *
 * `field`    — which summary field differs
 * `legacy`   — value from legacy engine
 * `universal`— value from universal engine
 * `delta`    — absolute difference
 */
export interface ParityDifference {
  field:     string;
  legacy:    number;
  universal: number;
  delta:     number;
}

/**
 * Full result of a parity check between legacy and universal engines.
 *
 * `parity: true`  → outputs are equivalent within tolerance
 * `parity: false` → outputs diverge; `differences` lists every discrepancy
 *
 * Used in shadow mode to detect regressions before promoting universal to primary.
 */
export interface ParityCheckResult {
  parity:       boolean;
  differences:  ParityDifference[];
  legacySummary:    ReconciliationSummarySnapshot;
  universalSummary: ReconciliationSummarySnapshot;
  /** Wall-clock time of the legacy run in ms. */
  legacyMs:    number;
  /** Wall-clock time of the universal run in ms. */
  universalMs: number;
  warnings:    string[];
}

// ── Engine run metadata ────────────────────────────────────────────────────────

/**
 * Metadata stored in ReconciliationRun.metadataJson after a run.
 *
 * Captures which engine was used and what the outcome was —
 * without storing raw records or sensitive financial data.
 */
export interface EngineRunMetadata {
  /** Which engine mode was active for this run. */
  engineMode:       ReconEngineMode;
  /** Universal engine version (only present for shadow/universal modes). */
  engineVersion?:   string;
  /** Non-fatal warnings emitted by the universal engine. */
  warnings?:        string[];
  /** Exception counts from the universal engine (not from legacy). */
  exceptionCounts?: {
    onlyInA:         number;
    onlyInB:         number;
    amountMismatches: number;
    duplicates:       number;
    probableMatches:  number;
  };
  /** Shadow mode: whether parity passed between legacy and universal. */
  parityPassed?:      boolean;
  /** Shadow mode: number of differences found if parity failed. */
  parityDifferences?: number;
  /** Universal mode: whether a fallback to legacy was needed. */
  fallbackUsed?:      boolean;
  /** If fallback: the error message that triggered it. */
  fallbackReason?:    string;
  /** Universal engine execution time in ms (if run). */
  universalMs?:       number;
}

// ── Exception summary (Task 6) ────────────────────────────────────────────────

/**
 * Aggregated exception summary stored alongside run results.
 *
 * This is the ONLY exception data persisted to the DB — no raw records,
 * no amounts, no PII. Just counts, severity, and a few sample keys
 * to allow UI to show a meaningful summary without loading large datasets.
 *
 * Future: a dedicated ReconciliationException Prisma model will store
 * the full exception list. Until then, this summary is stored in
 * ReconciliationRun.metadataJson under the key "exceptionSummary".
 */
export interface ReconciliationExceptionSummary {
  /** Exception type key (e.g. "only_in_a", "probable_match"). */
  type:           string;
  /** Total count of this exception type in the run. */
  count:          number;
  /** Highest severity observed for this exception type. */
  severity:       "info" | "watch" | "elevated" | "critical";
  /**
   * Up to 3 sample document numbers / external IDs for context.
   * Never includes amounts, NITs, or other sensitive fields.
   */
  sampleKeys:     string[];
  /** Whether this exception type requires operator review before closing the session. */
  requiresReview: boolean;
}

/**
 * Complete set of exception summaries for one run.
 * Stored in ReconciliationRun.metadataJson["exceptionSummary"].
 */
export type RunExceptionSummary = ReconciliationExceptionSummary[];

// ── Fixture record contract ───────────────────────────────────────────────────

/**
 * Descriptor for a validation scenario (used in fixtures.ts).
 * Carries the expected outcome alongside the input records.
 */
export interface ValidationScenario {
  name:        string;
  description: string;
  recordsA:    import("../../canonical-record").CanonicalReconRecord[];
  recordsB:    import("../../canonical-record").CanonicalReconRecord[];
  expected: {
    exactMatches:     number;
    amountMismatches: number;
    onlyInA:          number;
    onlyInB:          number;
    probableMatches:  number;
    duplicatesA:      number;
    duplicatesB:      number;
  };
}
