// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 21: Strategic Planning Integration

import type { StrategicPlan, StrategicInitiative } from "../../strategic-planning/strategic-planning-types";

export interface PlanningCouncilContext {
  readonly activePlans:         StrategicPlan[];
  readonly criticalInitiatives: StrategicInitiative[];
  readonly planningBoost:       number;
  readonly activePlanCount:     number;
  readonly criticalInitiativeCount: number;
}

export function buildPlanningCouncilContext(
  orgSlug:     string,
  plans:       StrategicPlan[],
  initiatives: StrategicInitiative[]
): PlanningCouncilContext {
  try {
    const activePlans = plans.filter((p) =>
      p.orgSlug === orgSlug && p.status === "ACTIVE"
    );
    const criticalInitiatives = initiatives.filter((i) =>
      i.orgSlug === orgSlug && i.priority === "CRITICAL"
    );

    const planningBoost = Math.min(
      0.12,
      (activePlans.length > 0 ? 0.07 : 0) + (criticalInitiatives.length > 0 ? 0.05 : 0)
    );

    return {
      activePlans,
      criticalInitiatives,
      planningBoost,
      activePlanCount:          activePlans.length,
      criticalInitiativeCount:  criticalInitiatives.length,
    };
  } catch {
    return { activePlans: [], criticalInitiatives: [], planningBoost: 0, activePlanCount: 0, criticalInitiativeCount: 0 };
  }
}

export function getActivePlanLabels(
  orgSlug: string,
  plans:   StrategicPlan[],
  limit = 3
): string[] {
  return plans
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .sort((a, b) => (b.planScore ?? 0) - (a.planScore ?? 0))
    .slice(0, limit)
    .map((p) => p.title);
}

export function hasConflictingPlans(
  orgSlug: string,
  plans:   StrategicPlan[]
): boolean {
  const active = plans.filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE");
  const domains = active.map((p) => p.initiatives?.[0]?.domain).filter(Boolean);
  const uniqueDomains = new Set(domains);
  // Rough heuristic: if ≥ 3 active plans but < 3 unique domains → possible overlap
  return active.length >= 3 && uniqueDomains.size < 3;
}
