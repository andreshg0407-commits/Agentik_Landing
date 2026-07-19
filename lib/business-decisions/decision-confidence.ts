/**
 * decision-confidence.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Rich confidence model — more than just a number.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ConfidenceLevel } from "./decision-types";

// -- Decision Confidence ------------------------------------------------------

/** Rich confidence assessment for a decision. */
export interface DecisionConfidence {
  /** Numeric score (0–100). */
  score: number;
  /** Qualitative level. */
  level: ConfidenceLevel;
  /** Why the confidence is at this level. */
  reason: string;
  /** Quality of the underlying evidence. */
  evidenceQuality: string;
  /** How fresh the data is. */
  dataFreshness: string;
  /** Information that was missing. */
  missingInformation: string[];
  /** Assumptions that affect confidence. */
  assumptions: string[];
  /** How sensitive the decision is to small changes in data. */
  sensitivity: string;
}

// -- Builder ------------------------------------------------------------------

/** Derive confidence level from numeric score. */
export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "very_low";
}

/** Build a decision confidence. */
export function buildDecisionConfidence(opts: {
  score: number;
  reason: string;
  evidenceQuality?: string;
  dataFreshness?: string;
  missingInformation?: string[];
  assumptions?: string[];
  sensitivity?: string;
}): DecisionConfidence {
  return {
    score: opts.score,
    level: confidenceLevelFromScore(opts.score),
    reason: opts.reason,
    evidenceQuality: opts.evidenceQuality ?? "",
    dataFreshness: opts.dataFreshness ?? "",
    missingInformation: opts.missingInformation ?? [],
    assumptions: opts.assumptions ?? [],
    sensitivity: opts.sensitivity ?? "",
  };
}
