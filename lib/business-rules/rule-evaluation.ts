/**
 * rule-evaluation.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Evaluation execution record — the result of running a rule against a context.
 *
 * This is the audit trail: which rule was evaluated, what conditions matched,
 * what evidence was collected, and what outcome was suggested.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleCondition, ConditionEvalResult } from "./rule-condition";
import type { RuleEvidence } from "./rule-evidence";
import type { RuleSuggestedOutcome } from "./rule";
import type { nextRuleId } from "./rule-types";

// -- Evaluation Status --------------------------------------------------------

/** Result status of a single rule evaluation. */
export type RuleEvaluationStatus =
  | "matched"        // All conditions met — outcome applies
  | "not_matched"    // Conditions not met — no outcome
  | "skipped"        // Rule skipped (scope mismatch, paused, etc.)
  | "error";         // Evaluation failed (missing data, runtime error)

// -- Rule Evaluation ----------------------------------------------------------

/** Record of evaluating a single rule against a context. */
export interface RuleEvaluation {
  /** Unique evaluation ID. */
  evaluationId: string;
  /** Rule that was evaluated. */
  ruleId: string;
  /** Rule name (denormalized for audit). */
  ruleName: string;
  /** Evaluation result status. */
  status: RuleEvaluationStatus;
  /** Whether the root condition matched. */
  conditionMatched: boolean;
  /** Detailed condition evaluation results. */
  conditionResults: ConditionEvalResult[];
  /** Evidence collected. */
  evidence: RuleEvidence;
  /** Suggested outcome (only present when status = "matched"). */
  suggestedOutcome: RuleSuggestedOutcome | null;
  /** Why the rule was skipped (only present when status = "skipped"). */
  skipReason: string | null;
  /** Error message (only present when status = "error"). */
  errorMessage: string | null;
  /** Evaluation duration in milliseconds. */
  durationMs: number;
  /** Evaluation timestamp. */
  evaluatedAt: string;
}
