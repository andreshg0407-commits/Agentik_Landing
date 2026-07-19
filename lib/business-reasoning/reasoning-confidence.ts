/**
 * reasoning-confidence.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Confidence model for all reasoning elements.
 *
 * A single number is not enough. Every confidence assessment
 * must explain WHY it is high or low, what data is missing,
 * and what assumptions were made.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

// -- Confidence Level ------------------------------------------------------

export type ConfidenceLevel =
  | "very_high"
  | "high"
  | "moderate"
  | "low"
  | "very_low"
  | "unknown";

// -- Reasoning Confidence --------------------------------------------------

/**
 * Structured confidence assessment for any reasoning element.
 *
 * Every Finding, Insight, Risk, Opportunity, Decision, and Recommendation
 * carries one of these to explain confidence.
 */
export interface ReasoningConfidence {
  /** Numeric confidence score (0-100). */
  score: number;
  /** Human-readable confidence level. */
  level: ConfidenceLevel;
  /** Why the confidence is at this level. */
  reason: string;
  /** What information is missing that could improve confidence. */
  missingInformation: string[];
  /** Assumptions made during reasoning. */
  assumptions: string[];
  /** Number of evidence items supporting this conclusion. */
  evidenceCount: number;
  /** Whether all data sources were available. */
  dataComplete: boolean;
}

// -- Helpers ---------------------------------------------------------------

/** Derive confidence level from a numeric score. */
export function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 90) return "very_high";
  if (score >= 75) return "high";
  if (score >= 50) return "moderate";
  if (score >= 25) return "low";
  if (score > 0) return "very_low";
  return "unknown";
}

/** Build a ReasoningConfidence with sensible defaults. */
export function buildConfidence(opts: {
  score: number;
  reason: string;
  missingInformation?: string[];
  assumptions?: string[];
  evidenceCount?: number;
  dataComplete?: boolean;
}): ReasoningConfidence {
  return {
    score: opts.score,
    level: scoreToLevel(opts.score),
    reason: opts.reason,
    missingInformation: opts.missingInformation ?? [],
    assumptions: opts.assumptions ?? [],
    evidenceCount: opts.evidenceCount ?? 0,
    dataComplete: opts.dataComplete ?? true,
  };
}

/** Combine multiple confidences into an aggregate. */
export function aggregateConfidence(
  confidences: ReasoningConfidence[],
): ReasoningConfidence {
  if (confidences.length === 0) {
    return buildConfidence({
      score: 0,
      reason: "Sin datos de confianza",
      dataComplete: false,
    });
  }

  const avgScore = Math.round(
    confidences.reduce((sum, c) => sum + c.score, 0) / confidences.length,
  );
  const allMissing = confidences.flatMap(c => c.missingInformation);
  const allAssumptions = confidences.flatMap(c => c.assumptions);
  const totalEvidence = confidences.reduce((sum, c) => sum + c.evidenceCount, 0);
  const allComplete = confidences.every(c => c.dataComplete);

  return buildConfidence({
    score: avgScore,
    reason: `Agregado de ${confidences.length} evaluaciones`,
    missingInformation: [...new Set(allMissing)],
    assumptions: [...new Set(allAssumptions)],
    evidenceCount: totalEvidence,
    dataComplete: allComplete,
  });
}
