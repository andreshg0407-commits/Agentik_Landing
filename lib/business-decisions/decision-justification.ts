/**
 * decision-justification.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Justification — explains WHY an option was recommended.
 *
 * No decision is valid without justification.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Rejected Alternative Summary ---------------------------------------------

/** Why an alternative was not selected. */
export interface RejectedAlternativeSummary {
  /** Option ID. */
  optionId: string;
  /** Option title. */
  title: string;
  /** Why it was not selected. */
  reason: string;
  /** Score it received. */
  score: number;
}

// -- Decision Justification ---------------------------------------------------

/** Complete justification for a decision. */
export interface DecisionJustification {
  /** One-line summary. */
  summary: string;
  /** Main reasons the selected option is recommended. */
  mainReasons: string[];
  /** Supporting evidence references. */
  supportingEvidence: string[];
  /** What specifically makes the selected option better. */
  selectedBecause: string;
  /** Why other alternatives were not chosen. */
  rejectedAlternatives: RejectedAlternativeSummary[];
  /** Information that was missing during decision-making. */
  missingInformation: string[];
  /** Assumptions made during the decision. */
  assumptions: string[];
  /** Explanation of confidence level. */
  confidenceExplanation: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision justification. */
export function buildDecisionJustification(opts: {
  summary: string;
  mainReasons: string[];
  supportingEvidence?: string[];
  selectedBecause: string;
  rejectedAlternatives?: RejectedAlternativeSummary[];
  missingInformation?: string[];
  assumptions?: string[];
  confidenceExplanation?: string;
  metadata?: Record<string, unknown>;
}): DecisionJustification {
  return {
    summary: opts.summary,
    mainReasons: opts.mainReasons,
    supportingEvidence: opts.supportingEvidence ?? [],
    selectedBecause: opts.selectedBecause,
    rejectedAlternatives: opts.rejectedAlternatives ?? [],
    missingInformation: opts.missingInformation ?? [],
    assumptions: opts.assumptions ?? [],
    confidenceExplanation: opts.confidenceExplanation ?? "",
    metadata: opts.metadata ?? {},
  };
}
