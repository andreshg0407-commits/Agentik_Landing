/**
 * decision-tradeoff.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Tradeoff model — what is gained and what is sacrificed.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { DecisionSeverity, DecisionEntityRef } from "./decision-types";
import { nextDecisionId } from "./decision-types";

// -- Decision Tradeoff --------------------------------------------------------

/** A tradeoff associated with a decision option. */
export interface DecisionTradeoff {
  /** Unique tradeoff ID. */
  tradeoffId: string;
  /** Option this tradeoff applies to. */
  optionId: string;
  /** What is gained. */
  gain: string;
  /** What is sacrificed. */
  sacrifice: string;
  /** Severity of the sacrifice. */
  severity: DecisionSeverity;
  /** Detailed explanation. */
  explanation: string;
  /** Entity affected by this tradeoff. */
  relatedEntity: DecisionEntityRef | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision tradeoff. */
export function buildDecisionTradeoff(opts: {
  optionId: string;
  gain: string;
  sacrifice: string;
  severity?: DecisionSeverity;
  explanation?: string;
  relatedEntity?: DecisionEntityRef | null;
  metadata?: Record<string, unknown>;
}): DecisionTradeoff {
  return {
    tradeoffId: nextDecisionId("dto"),
    optionId: opts.optionId,
    gain: opts.gain,
    sacrifice: opts.sacrifice,
    severity: opts.severity ?? "medium",
    explanation: opts.explanation ?? "",
    relatedEntity: opts.relatedEntity ?? null,
    metadata: opts.metadata ?? {},
  };
}
