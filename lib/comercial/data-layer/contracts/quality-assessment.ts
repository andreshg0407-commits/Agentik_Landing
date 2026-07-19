/**
 * contracts/quality-assessment.ts
 *
 * Data quality assessment contract for canonical records.
 */

// ── Quality Assessment ──────────────────────────────────────────────────────

export interface QualityAssessment {
  /** Overall quality level */
  readonly level: QualityLevel;

  /** Individual quality dimensions */
  readonly dimensions: QualityDimensions;

  /** Specific issues found */
  readonly issues: QualityIssue[];

  /** When this assessment was performed */
  readonly assessedAt: Date;

  /** Adapter/validator that produced this assessment */
  readonly assessorId: string;
}

// ── Quality Dimensions ──────────────────────────────────────────────────────

export interface QualityDimensions {
  /** Data completeness (0..1): ratio of non-null required fields */
  readonly completeness: number;

  /** Data consistency (0..1): no contradictions between fields */
  readonly consistency: number;

  /** Data freshness (0..1): how recent relative to SLA */
  readonly freshness: number;

  /** Data validity (0..1): values within expected ranges/formats */
  readonly validity: number;

  /** Overall confidence (0..1): composite score */
  readonly confidence: number;
}

// ── Quality Level ───────────────────────────────────────────────────────────

export type QualityLevel =
  | "HIGH"
  | "ACCEPTABLE"
  | "LOW"
  | "REJECTED";

// ── Quality Issue ───────────────────────────────────────────────────────────

export interface QualityIssue {
  /** Which dimension is affected */
  readonly dimension: keyof QualityDimensions;

  /** Severity of the issue */
  readonly severity: QualityIssueSeverity;

  /** Human-readable description */
  readonly description: string;

  /** Field that triggered the issue (if applicable) */
  readonly field?: string;

  /** Expected value or constraint */
  readonly expected?: string;

  /** Actual value found */
  readonly actual?: string;
}

export type QualityIssueSeverity =
  | "CRITICAL"
  | "WARNING"
  | "INFO";
