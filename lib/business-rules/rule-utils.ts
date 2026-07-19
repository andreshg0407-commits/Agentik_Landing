/**
 * rule-utils.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Utility functions for working with rule evaluation results.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleEvaluation } from "./rule-evaluation";
import type { RuleEvaluationResult } from "./rule-result";
import type { BusinessRule, RuleSuggestedAction } from "./rule";
import type { RuleCategory, RuleSeverity } from "./rule-types";

// -- Result Queries -----------------------------------------------------------

/** Get only matched evaluations. */
export function matchedEvaluations(result: RuleEvaluationResult): RuleEvaluation[] {
  return result.evaluations.filter(e => e.status === "matched");
}

/** Get evaluations that had errors. */
export function errorEvaluations(result: RuleEvaluationResult): RuleEvaluation[] {
  return result.evaluations.filter(e => e.status === "error");
}

/** Get all suggested actions sorted by priority. */
export function sortedSuggestedActions(result: RuleEvaluationResult): RuleSuggestedAction[] {
  return [...result.suggestedActions].sort((a, b) => a.priority - b.priority);
}

/** Check if any rule matched at or above a severity. */
export function hasMatchAtSeverity(
  result: RuleEvaluationResult,
  minSeverity: RuleSeverity,
): boolean {
  const rank: Record<RuleSeverity, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  const minRank = rank[minSeverity];
  return result.suggestedOutcomes.some(o => rank[o.severity] >= minRank);
}

/** Get unique action types from results. */
export function uniqueActionTypes(result: RuleEvaluationResult): string[] {
  const types = new Set(result.suggestedActions.map(a => a.actionType));
  return Array.from(types);
}

// -- Rule Queries -------------------------------------------------------------

/** Count rules by category. */
export function countRulesByCategory(rules: BusinessRule[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of rules) {
    counts[rule.category] = (counts[rule.category] ?? 0) + 1;
  }
  return counts;
}

/** Get active rules only. */
export function activeRules(rules: BusinessRule[]): BusinessRule[] {
  return rules.filter(r => r.status === "active");
}

/** Get tenant-configurable rules. */
export function configurableRules(rules: BusinessRule[]): BusinessRule[] {
  return rules.filter(r => r.tenantConfigurable);
}

// -- Evaluation Summary -------------------------------------------------------

/** Human-readable summary of an evaluation result. */
export function evaluationSummary(result: RuleEvaluationResult): string {
  const parts: string[] = [
    `${result.totalEvaluated} rule(s) evaluated`,
    `${result.totalMatched} matched`,
  ];
  if (result.totalSkipped > 0) parts.push(`${result.totalSkipped} skipped`);
  if (result.totalErrors > 0) parts.push(`${result.totalErrors} error(s)`);
  parts.push(`${result.suggestedActions.length} action(s) suggested`);
  parts.push(`${result.durationMs}ms`);
  return parts.join(", ");
}

/** Average confidence across matched evaluations. */
export function averageConfidence(result: RuleEvaluationResult): number {
  const matched = result.matchedEvaluations;
  if (matched.length === 0) return 0;
  const total = matched.reduce((sum, e) => sum + e.evidence.confidence, 0);
  return Math.round(total / matched.length);
}
