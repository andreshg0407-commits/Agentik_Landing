/**
 * quality/quality-types.ts
 *
 * Reusable data quality types for the Commercial Data Layer.
 */

// ── Confidence ──────────────────────────────────────────────────────────────

export interface Confidence {
  /** Score between 0 and 1 */
  readonly score: number;

  /** Source of the confidence calculation */
  readonly source: ConfidenceSource;

  /** When this confidence was calculated */
  readonly calculatedAt: Date;

  /** Factors that influenced this score */
  readonly factors: ConfidenceFactor[];
}

export type ConfidenceSource =
  | "ADAPTER"
  | "QUALITY_ENGINE"
  | "FRESHNESS_CHECK"
  | "MANUAL_OVERRIDE";

export interface ConfidenceFactor {
  readonly name: string;
  readonly weight: number;
  readonly contribution: number;
}

// ── Completeness ────────────────────────────────────────────────────────────

export interface Completeness {
  /** Ratio of present fields vs required fields (0..1) */
  readonly score: number;

  /** Fields that are missing */
  readonly missingFields: string[];

  /** Fields that are present but empty/null */
  readonly emptyFields: string[];

  /** Total required fields */
  readonly totalRequired: number;
}

// ── Consistency ─────────────────────────────────────────────────────────────

export interface Consistency {
  /** Score (0..1): no contradictions between fields */
  readonly score: number;

  /** Contradictions found */
  readonly contradictions: Contradiction[];
}

export interface Contradiction {
  readonly fieldA: string;
  readonly fieldB: string;
  readonly description: string;
}

// ── Freshness ───────────────────────────────────────────────────────────────

export interface Freshness {
  /** Score (0..1): how recent relative to SLA */
  readonly score: number;

  /** Age of the data in milliseconds */
  readonly ageMs: number;

  /** Expected maximum age (SLA) in milliseconds */
  readonly slaMs: number;

  /** Whether data is within SLA */
  readonly withinSla: boolean;
}

// ── Validity ────────────────────────────────────────────────────────────────

export interface Validity {
  /** Score (0..1): values within expected ranges/formats */
  readonly score: number;

  /** Validation errors */
  readonly errors: ValidityError[];
}

export interface ValidityError {
  readonly field: string;
  readonly constraint: string;
  readonly value: string;
}

// ── Origin ──────────────────────────────────────────────────────────────────

export interface Origin {
  /** External system that produced this data */
  readonly system: string;

  /** Adapter that processed it */
  readonly adapter: string;

  /** Sync run that captured it */
  readonly correlationId: string;

  /** Extraction timestamp */
  readonly extractedAt: Date;
}
