// AGENTIK-STRATEGIC-PLANNING-01
// Phase 11 — Plan Prioritization Engine

import type { StrategicPlan, PlanningPriority } from "./strategic-planning-types";
import { PLANNING_PRIORITY_RANK, planningPriorityFromScore } from "./strategic-planning-types";

// ── Factors ───────────────────────────────────────────────────────────────────

export interface PlanPrioritizationFactors {
  readonly impactWeight:       number;    // 0–1
  readonly urgencyWeight:      number;
  readonly alignmentWeight:    number;
  readonly learningWeight:     number;
  readonly simulationWeight:   number;
  readonly riskWeight:         number;
}

export const DEFAULT_PRIORITIZATION_FACTORS: PlanPrioritizationFactors = {
  impactWeight:     0.30,
  urgencyWeight:    0.20,
  alignmentWeight:  0.20,
  learningWeight:   0.10,
  simulationWeight: 0.10,
  riskWeight:       0.10,
};

// ── Score ─────────────────────────────────────────────────────────────────────

export function scorePlan(
  plan:    StrategicPlan,
  factors: PlanPrioritizationFactors = DEFAULT_PRIORITIZATION_FACTORS
): number {
  const impactScore     = plan.objectives.length > 0
    ? plan.objectives.reduce((s, o) => s + o.impactScore, 0) / plan.objectives.length
    : 0;
  const urgencyScore    = PLANNING_PRIORITY_RANK[plan.priority] / 4;
  const alignmentScore  = plan.alignmentScore;
  const riskPenalty     = Math.min(0.25, plan.risks.filter((r) => r.level === "CRITICAL").length * 0.10);
  const riskCovBonus    = plan.riskCoverage * factors.riskWeight;

  const raw = (
    impactScore    * factors.impactWeight +
    urgencyScore   * factors.urgencyWeight +
    alignmentScore * factors.alignmentWeight +
    riskCovBonus
  ) - riskPenalty;

  return Math.min(1, Math.max(0, Math.round(raw * 100) / 100));
}

// ── Prioritize ────────────────────────────────────────────────────────────────

export function prioritizePlan(
  plan:    StrategicPlan,
  factors: PlanPrioritizationFactors = DEFAULT_PRIORITIZATION_FACTORS
): StrategicPlan {
  const score    = scorePlan(plan, factors);
  const priority = planningPriorityFromScore(score);
  return { ...plan, priority, planScore: score };
}

// ── Rank ─────────────────────────────────────────────────────────────────────

export function rankPlans(
  plans:   StrategicPlan[],
  factors: PlanPrioritizationFactors = DEFAULT_PRIORITIZATION_FACTORS
): StrategicPlan[] {
  return [...plans].sort((a, b) => {
    const pDiff = PLANNING_PRIORITY_RANK[b.priority] - PLANNING_PRIORITY_RANK[a.priority];
    if (pDiff !== 0) return pDiff;
    return scorePlan(b, factors) - scorePlan(a, factors);
  });
}
