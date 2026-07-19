// AGENTIK-STRATEGIC-PLANNING-01 — Phase 29: Health Check

import type { StrategicPlan, StrategicObjective, StrategicInitiative } from "./strategic-planning-types";

export type PlanningHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "EMPTY";

export interface PlanningHealthReport {
  readonly orgSlug:     string;
  readonly status:      PlanningHealthStatus;
  readonly planCount:   number;
  readonly activePlans: number;
  readonly issues:      string[];
  readonly checkedAt:   string;
}

export function checkStrategicPlanningHealth(
  orgSlug:     string,
  plans:       StrategicPlan[],
  objectives:  StrategicObjective[],
  initiatives: StrategicInitiative[]
): PlanningHealthReport {
  const issues: string[] = [];
  const scoped = plans.filter((p) => p.orgSlug === orgSlug);
  const active = scoped.filter((p) => p.status === "ACTIVE");

  if (scoped.length === 0) {
    return {
      orgSlug, status: "EMPTY", planCount: 0, activePlans: 0,
      issues:    ["No strategic plans found."],
      checkedAt: new Date().toISOString(),
    };
  }

  // Cross-tenant isolation check
  const crossTenant = plans.filter((p) => p.orgSlug !== orgSlug);
  if (crossTenant.length > 0) {
    issues.push(`Tenant isolation violation: ${crossTenant.length} plan(s) from other orgs.`);
  }

  // suggestedOnly check
  const nonSuggested = scoped.filter((p) => p.suggestedOnly !== true);
  if (nonSuggested.length > 0) {
    issues.push(`${nonSuggested.length} plan(s) missing suggestedOnly flag.`);
  }

  // No objectives
  const noObjs = scoped.filter((p) => p.objectives.length === 0);
  if (noObjs.length > 0) {
    issues.push(`${noObjs.length} plan(s) have no objectives.`);
  }

  // Low score plans
  const lowScore = scoped.filter((p) => p.planScore < 0.20);
  if (lowScore.length > 0) {
    issues.push(`${lowScore.length} plan(s) have critically low plan score.`);
  }

  // All initiatives missing suggestedOnly
  const scopedInits = initiatives.filter((i) => i.orgSlug === orgSlug);
  const badInits    = scopedInits.filter((i) => i.suggestedOnly !== true);
  if (badInits.length > 0) {
    issues.push(`${badInits.length} initiative(s) missing suggestedOnly flag.`);
  }

  const status: PlanningHealthStatus =
    issues.some((i) => i.includes("isolation") || i.includes("suggestedOnly")) ? "UNAVAILABLE"
    : issues.length > 2 ? "DEGRADED"
    : issues.length > 0 ? "DEGRADED"
    : "HEALTHY";

  return {
    orgSlug,
    status,
    planCount:   scoped.length,
    activePlans: active.length,
    issues,
    checkedAt:   new Date().toISOString(),
  };
}

export function isStrategicPlanningHealthy(report: PlanningHealthReport): boolean {
  return report.status === "HEALTHY";
}
