/**
 * rule-result.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Complete result of evaluating all applicable rules against a context.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleEvaluation } from "./rule-evaluation";
import type { RuleSuggestedOutcome, RuleSuggestedAction } from "./rule";

// -- Rule Evaluation Result ---------------------------------------------------

/** Complete result of evaluating all applicable rules for a trigger. */
export interface RuleEvaluationResult {
  /** Unique result ID. */
  resultId: string;
  /** Organization scope. */
  orgSlug: string;
  /** Correlation ID linking to the triggering event chain. */
  correlationId: string | null;
  /** All rule evaluations performed. */
  evaluations: RuleEvaluation[];
  /** Only evaluations that matched (convenience). */
  matchedEvaluations: RuleEvaluation[];
  /** All suggested outcomes from matched rules. */
  suggestedOutcomes: RuleSuggestedOutcome[];
  /** All suggested actions from matched rules (flattened). */
  suggestedActions: RuleSuggestedAction[];
  /** Total rules evaluated. */
  totalEvaluated: number;
  /** Total rules matched. */
  totalMatched: number;
  /** Total rules skipped. */
  totalSkipped: number;
  /** Total rules with errors. */
  totalErrors: number;
  /** Overall evaluation duration in milliseconds. */
  durationMs: number;
  /** Evaluation timestamp. */
  evaluatedAt: string;
  /** MANDATORY: all results are suggestions only. */
  suggestedOnly: true;
}

// -- Builder ------------------------------------------------------------------

/** Build a RuleEvaluationResult from individual evaluations. */
export function buildRuleEvaluationResult(opts: {
  orgSlug: string;
  evaluations: RuleEvaluation[];
  correlationId?: string | null;
  durationMs: number;
}): RuleEvaluationResult {
  const matched = opts.evaluations.filter(e => e.status === "matched");
  const skipped = opts.evaluations.filter(e => e.status === "skipped");
  const errors = opts.evaluations.filter(e => e.status === "error");

  const suggestedOutcomes = matched
    .map(e => e.suggestedOutcome)
    .filter((o): o is RuleSuggestedOutcome => o !== null);

  const suggestedActions = suggestedOutcomes.flatMap(o => o.suggestedActions);

  return {
    resultId: `rr-${Date.now()}-${++_seq}`,
    orgSlug: opts.orgSlug,
    correlationId: opts.correlationId ?? null,
    evaluations: opts.evaluations,
    matchedEvaluations: matched,
    suggestedOutcomes,
    suggestedActions,
    totalEvaluated: opts.evaluations.length,
    totalMatched: matched.length,
    totalSkipped: skipped.length,
    totalErrors: errors.length,
    durationMs: opts.durationMs,
    evaluatedAt: new Date().toISOString(),
    suggestedOnly: true,
  };
}

let _seq = 0;
