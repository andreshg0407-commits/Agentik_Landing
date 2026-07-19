/**
 * decision-utils.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Utility functions for working with business decisions.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessDecision } from "./decision";
import type { DecisionOption } from "./decision-option";
import type { DecisionStatus, DecisionSeverity } from "./decision-types";

// -- Decision Queries ---------------------------------------------------------

/** Get the recommended option from a decision. */
export function recommendedOption(decision: BusinessDecision): DecisionOption | null {
  if (!decision.recommendedOptionId) return null;
  return decision.options.find(o => o.optionId === decision.recommendedOptionId) ?? null;
}

/** Get options sorted by rank (best first). */
export function rankedOptions(decision: BusinessDecision): DecisionOption[] {
  return [...decision.options].sort((a, b) => a.rank - b.rank);
}

/** Get feasible options only. */
export function feasibleOptions(decision: BusinessDecision): DecisionOption[] {
  return decision.options.filter(o => o.feasible && !o.blocked);
}

/** Get blocked options. */
export function blockedOptions(decision: BusinessDecision): DecisionOption[] {
  return decision.options.filter(o => o.blocked);
}

/** Check if the decision requires approval. */
export function decisionRequiresApproval(decision: BusinessDecision): boolean {
  return decision.approval.required;
}

/** Get all unique strategies across options. */
export function usedStrategies(decision: BusinessDecision): string[] {
  const s = new Set(decision.options.map(o => o.strategy));
  return Array.from(s);
}

// -- Multi-Decision Queries ---------------------------------------------------

/** Filter decisions by status. */
export function decisionsByStatus(decisions: BusinessDecision[], status: DecisionStatus): BusinessDecision[] {
  return decisions.filter(d => d.status === status);
}

/** Filter decisions by minimum severity. */
export function decisionsBySeverity(decisions: BusinessDecision[], minSeverity: DecisionSeverity): BusinessDecision[] {
  const rank: Record<DecisionSeverity, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  const minRank = rank[minSeverity];
  return decisions.filter(d => rank[d.severity] >= minRank);
}

/** Sort decisions by severity (most severe first). */
export function sortDecisionsBySeverity(decisions: BusinessDecision[]): BusinessDecision[] {
  const rank: Record<DecisionSeverity, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  return [...decisions].sort((a, b) => rank[b.severity] - rank[a.severity]);
}

/** Count decisions by status. */
export function countDecisionsByStatus(decisions: BusinessDecision[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of decisions) {
    counts[d.status] = (counts[d.status] ?? 0) + 1;
  }
  return counts;
}

// -- Summary ------------------------------------------------------------------

/** Human-readable summary of a decision. */
export function decisionSummary(decision: BusinessDecision): string {
  const rec = recommendedOption(decision);
  const parts: string[] = [
    `"${decision.title}"`,
    `${decision.options.length} opcion(es)`,
    `severidad: ${decision.severity}`,
    `confianza: ${decision.confidence.score}% (${decision.confidence.level})`,
  ];
  if (rec) parts.push(`recomendada: "${rec.title}" (score: ${rec.score})`);
  if (decision.approval.required) parts.push(`aprobacion: ${decision.approval.approvalType}`);
  return parts.join(" | ");
}

/** Average score across all options. */
export function averageOptionScore(decision: BusinessDecision): number {
  if (decision.options.length === 0) return 0;
  const total = decision.options.reduce((sum, o) => sum + o.score, 0);
  return Math.round(total / decision.options.length);
}

/** Score gap between the recommended and second-best option. */
export function recommendationGap(decision: BusinessDecision): number {
  const ranked = rankedOptions(decision);
  if (ranked.length < 2) return 0;
  return ranked[0].score - ranked[1].score;
}
