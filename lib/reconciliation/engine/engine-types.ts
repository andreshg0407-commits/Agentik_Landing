/**
 * lib/reconciliation/engine/engine-types.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Matching Engine — Type Surface
 *
 * All types for the universal engine output.
 * Pure TypeScript — no Prisma, no DB, no side effects.
 *
 * Import CanonicalReconRecord from ../canonical-record.
 * Import ReconciliationSummarySnapshot from ../session-types.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord }          from "../canonical-record";
import type { ReconciliationSummarySnapshot } from "../session-types";

// ── Match decisions ────────────────────────────────────────────────────────────

/**
 * The engine's verdict on a pair of matched records.
 *
 *   exact_match     — Identity match AND amount within tolerance. No action needed.
 *   amount_mismatch — Identity match confirmed; amounts differ beyond tolerance.
 *                     The pair IS reconciled in terms of document identity, but the
 *                     amount discrepancy must be investigated.
 */
export type MatchDecision = "exact_match" | "amount_mismatch";

/** Confidence level of a match or exception. */
export type MatchConfidence = "high" | "medium" | "low";

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * One line in the match score breakdown.
 * Every point earned is traceable to a specific field and reason.
 */
export interface ScoreItem {
  field:  string;   // e.g. "documentNumber", "amount", "thirdPartyId"
  points: number;   // 0–40 depending on field weight
  reason: string;   // human-readable: "mismo número de documento"
}

/**
 * Complete scoring result for a candidate pair.
 * Score is deterministic: same inputs always produce the same score.
 */
export interface MatchScore {
  /** Total score 0–100. 0 = no similarity, 100 = perfect match. */
  total:     number;
  breakdown: ScoreItem[];
}

// ── Match explanation ─────────────────────────────────────────────────────────

/**
 * Explainable result for one matched or unmatched pair.
 *
 * The humanReadable array is the auditable "why" — shown to operators,
 * fiscal reviewers, and stored in audit trails.
 */
export interface MatchExplanation {
  decision:      MatchDecision;
  confidence:    MatchConfidence;
  score:         MatchScore;
  /**
   * Human-readable reasons for the match decision.
   * Ordered from strongest to weakest signal.
   * Examples:
   *   ["Número de documento idéntico", "Valor exacto coincide"]
   *   ["Valor igual", "NIT coincide", "Fecha con diferencia de 1 día"]
   */
  humanReadable: string[];
}

// ── Matched pair ──────────────────────────────────────────────────────────────

/**
 * One confirmed pair (identity matched).
 * Includes both exact_match and amount_mismatch decisions.
 * Amount mismatches still represent matched document identity.
 */
export interface MatchedPair {
  /**
   * Deterministic ID for this pair.
   * Format: "m:{recordA.id}:{recordB.id}"
   */
  id:          string;
  recordA:     CanonicalReconRecord;
  recordB:     CanonicalReconRecord;
  explanation: MatchExplanation;
  /** recordB.amount - recordA.amount. Positive = B is higher. */
  amountDelta: number;
  /** (amountDelta / recordA.amount) * 100. Null when recordA.amount = 0. */
  amountDeltaPct: number | null;
}

// ── Exception types ───────────────────────────────────────────────────────────

/**
 * Classification of a reconciliation exception.
 *
 *   only_in_a        — Record exists in source A, no match in source B.
 *   only_in_b        — Record exists in source B, no match in source A.
 *   duplicate_in_a   — Same document key appears multiple times in source A.
 *   duplicate_in_b   — Same document key appears multiple times in source B.
 *   probable_match   — Score 60–84: probable match, requires operator review.
 *   stale_record     — Record date is significantly older than the session period.
 *   orphan_payment   — Payment record with no corresponding invoice (future).
 *   unsupported_record — Record type not yet handled by any adapter.
 */
export type ExceptionType =
  | "only_in_a"
  | "only_in_b"
  | "duplicate_in_a"
  | "duplicate_in_b"
  | "probable_match"
  | "stale_record"
  | "orphan_payment"
  | "unsupported_record";

/** Severity of a reconciliation exception. */
export type ExceptionSeverity = "info" | "watch" | "elevated" | "critical";

/**
 * One reconciliation exception.
 *
 * Every exception is explainable:
 *   - `explanation` is a one-sentence summary (for tables and audit trails)
 *   - `reasons` are the specific signals that led to this classification
 *   - `recordA` / `recordB` are the raw records involved
 */
export interface ReconException {
  /**
   * Deterministic exception ID.
   * Format for single-record: "ex:{type}:{record.id}"
   * Format for pair: "ex:{type}:{recordA.id}:{recordB.id}"
   */
  id:          string;
  type:        ExceptionType;
  severity:    ExceptionSeverity;
  /** Record from source A involved in this exception (if any). */
  recordA?:    CanonicalReconRecord;
  /** Record from source B involved in this exception (if any). */
  recordB?:    CanonicalReconRecord;
  /** One-sentence explanation for display. */
  explanation: string;
  /** Specific reasons for this classification. */
  reasons:     string[];
  /** Score that led to probable_match (only for probable_match type). */
  score?:      MatchScore;
  amountA?:    number;
  amountB?:    number;
  amountDelta?: number;
}

// ── Duplicate groups ──────────────────────────────────────────────────────────

/**
 * A group of records with the same key in the same source.
 * Detected before matching; all members go to duplicate_in_a/b exceptions.
 */
export interface DuplicateGroup {
  /** The key that was duplicated (normalized document number). */
  duplicateKey: string;
  side:         "a" | "b";
  records:      CanonicalReconRecord[];
  count:        number;
}

// ── Engine metrics ─────────────────────────────────────────────────────────────

/**
 * Quantitative metrics from one engine run.
 * All values are computed from the result — never approximated.
 */
export interface EngineMetrics {
  /** Distinct records in source A (before duplicate removal). */
  totalInputA:      number;
  /** Distinct records in source B (before duplicate removal). */
  totalInputB:      number;
  /** Records that participated in matching (unique, after duplicate exclusion). */
  deduplicatedA:    number;
  deduplicatedB:    number;
  /** Pairs where identity matched AND amount is within tolerance. */
  exactMatches:     number;
  /** Pairs where identity matched BUT amount differs. */
  amountMismatches: number;
  /** Records in A with no match in B. */
  onlyInA:          number;
  /** Records in B with no match in A. */
  onlyInB:          number;
  /** Probable match pairs (score 60–84, need review). */
  probableMatches:  number;
  /** Unique keys that were duplicated in source A. */
  duplicateKeysA:   number;
  /** Unique keys that were duplicated in source B. */
  duplicateKeysB:   number;
  /** Sum of all amounts in source A (all input records). */
  totalAmountA:     number;
  /** Sum of all amounts in source B (all input records). */
  totalAmountB:     number;
  /** totalAmountB - totalAmountA. */
  deltaAmount:      number;
  /**
   * Match rate = exactMatches / (exactMatches + amountMismatches + onlyInA + onlyInB) * 100.
   * 0–100. excludes duplicates and probable matches from denominator.
   */
  matchRate:        number;
  /** Engine execution time in milliseconds. */
  executionMs:      number;
}

// ── Engine parameters ─────────────────────────────────────────────────────────

/**
 * Parameters for one engine run.
 * organizationId and sessionId enforce multi-tenant safety.
 */
export interface UniversalReconParams {
  /** Required. Enforces tenant isolation on every run. */
  organizationId: string;
  /** Optional. Links the run to a ReconciliationSession. */
  sessionId?:     string | null;
  /** Source type identifier for side A (from ReconciliationSourceType). */
  sourceAType:    string;
  /** Source type identifier for side B (from ReconciliationSourceType). */
  sourceBType:    string;
  /** Human-readable label for source A. */
  sourceALabel:   string;
  /** Human-readable label for source B. */
  sourceBLabel:   string;
  /** Normalized records from source A. */
  recordsA:       CanonicalReconRecord[];
  /** Normalized records from source B. */
  recordsB:       CanonicalReconRecord[];
  options?: {
    /**
     * Fractional tolerance for amount matching.
     * Default: 0.001 (0.1%). A pair is an "exact_match" if
     * |amountA - amountB| / |amountA| <= tolerance.
     */
    amountTolerance?: number;
    /**
     * Minimum fuzzy score (0–100) to classify a pair as probable_match.
     * Below this threshold the records are classified as orphans.
     * Default: 60.
     */
    minFuzzyScore?: number;
    /**
     * Maximum date difference in days for date proximity scoring.
     * Default: 3 days.
     */
    dateFuzzyDays?: number;
    /**
     * Maximum number of A×B comparisons in the fuzzy pass.
     * Prevents uncontrolled O(n²) on very large datasets.
     * Default: 50_000. A warning is emitted when exceeded.
     */
    maxFuzzyComparisons?: number;
    /** Whether to detect and report duplicates within each side. Default: true. */
    detectDuplicates?: boolean;
  };
}

// ── Engine result ─────────────────────────────────────────────────────────────

/**
 * Complete result from one universal engine run.
 *
 * Design:
 *   - `matches`    — ALL identity-matched pairs (exact_match + amount_mismatch)
 *   - `exceptions` — unmatched + duplicates + probable matches
 *   - `duplicates` — duplicate groups, separate from exceptions for grouping
 *   - `metrics`    — quantitative summary
 *   - `summary`    — ReconciliationSummarySnapshot-compatible shape for session layer
 *   - `warnings`   — non-fatal issues (capped fuzzy pass, missing fields, etc.)
 */
export interface ReconciliationEngineResult {
  /** Engine version — for audit trail compatibility. */
  engineVersion:  string;
  organizationId: string;
  sessionId:      string | null;
  sourceAType:    string;
  sourceBType:    string;
  sourceALabel:   string;
  sourceBLabel:   string;
  /** ISO timestamp when this run executed. */
  runAt:          string;
  matches:        MatchedPair[];
  exceptions:     ReconException[];
  duplicates:     DuplicateGroup[];
  metrics:        EngineMetrics;
  /**
   * ReconciliationSummarySnapshot-compatible summary.
   * Used by session layer (run-service.ts) to update session.summaryJson.
   */
  summary:        ReconciliationSummarySnapshot;
  warnings:       string[];
}
