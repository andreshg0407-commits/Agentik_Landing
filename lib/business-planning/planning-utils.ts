/**
 * planning-utils.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Utility functions for working with business plans.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessPlan } from "./plan";
import type { PlanAlternative } from "./plan-alternative";
import type { PlanStatus, PlanSeverity, PlanStrategy } from "./planning-types";

// -- Plan Queries -------------------------------------------------------------

/** Get the recommended alternative from a plan. */
export function recommendedAlternative(plan: BusinessPlan): PlanAlternative | null {
  if (!plan.selectedAlternativeId) return null;
  return plan.alternatives.find(a => a.alternativeId === plan.selectedAlternativeId) ?? null;
}

/** Get alternatives sorted by rank (best first). */
export function rankedAlternatives(plan: BusinessPlan): PlanAlternative[] {
  return [...plan.alternatives].sort((a, b) => a.rank - b.rank);
}

/** Get alternatives that have blocking constraints. */
export function blockedAlternatives(plan: BusinessPlan): PlanAlternative[] {
  return plan.alternatives.filter(a => a.constraints.some(c => c.blocking));
}

/** Get alternatives that have no blocking constraints or dependencies. */
export function feasibleAlternatives(plan: BusinessPlan): PlanAlternative[] {
  return plan.alternatives.filter(a =>
    !a.constraints.some(c => c.blocking) &&
    !a.dependencies.some(d => d.required && d.status === "unmet"),
  );
}

/** Get all unique strategies used across alternatives. */
export function usedStrategies(plan: BusinessPlan): PlanStrategy[] {
  const strategies = new Set(plan.alternatives.map(a => a.strategy));
  return Array.from(strategies);
}

/** Check if a plan requires any approvals. */
export function requiresApproval(plan: BusinessPlan): boolean {
  return plan.alternatives.some(a =>
    a.approvalRequirements.some(ar => ar.required && ar.blocking),
  );
}

/** Total step count across all alternatives. */
export function totalStepCount(plan: BusinessPlan): number {
  return plan.alternatives.reduce((sum, a) => sum + a.steps.length, 0);
}

/** Total risk count across all alternatives. */
export function totalRiskCount(plan: BusinessPlan): number {
  return plan.alternatives.reduce((sum, a) => sum + a.risks.length, 0);
}

// -- Multi-Plan Queries -------------------------------------------------------

/** Filter plans by status. */
export function plansByStatus(plans: BusinessPlan[], status: PlanStatus): BusinessPlan[] {
  return plans.filter(p => p.status === status);
}

/** Filter plans by minimum severity. */
export function plansBySeverity(plans: BusinessPlan[], minSeverity: PlanSeverity): BusinessPlan[] {
  const rank: Record<PlanSeverity, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  const minRank = rank[minSeverity];
  return plans.filter(p => rank[p.severity] >= minRank);
}

/** Sort plans by severity (most severe first). */
export function sortPlansBySeverity(plans: BusinessPlan[]): BusinessPlan[] {
  const rank: Record<PlanSeverity, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  return [...plans].sort((a, b) => rank[b.severity] - rank[a.severity]);
}

/** Count plans by status. */
export function countPlansByStatus(plans: BusinessPlan[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of plans) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
  }
  return counts;
}

// -- Plan Summary -------------------------------------------------------------

/** Human-readable summary of a plan. */
export function planSummary(plan: BusinessPlan): string {
  const rec = recommendedAlternative(plan);
  const parts: string[] = [
    `"${plan.title}"`,
    `${plan.alternatives.length} alternativa(s)`,
    `severidad: ${plan.severity}`,
    `confianza: ${plan.confidence}%`,
  ];
  if (rec) parts.push(`recomendada: "${rec.title}" (score: ${rec.score})`);
  return parts.join(" | ");
}

/** Average confidence across all alternatives in a plan. */
export function averageAlternativeConfidence(plan: BusinessPlan): number {
  if (plan.alternatives.length === 0) return 0;
  const total = plan.alternatives.reduce((sum, a) => sum + a.confidence, 0);
  return Math.round(total / plan.alternatives.length);
}
