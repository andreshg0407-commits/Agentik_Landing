// AGENTIK-STRATEGIC-PLANNING-01 — Phase 22: Compliance Gate Integration

import type { StrategicPlan, StrategicInitiative } from "../strategic-planning-types";

export type PlanningComplianceStatus = "PASS" | "WARN" | "FAIL";

export interface PlanningComplianceCheck {
  readonly rule:        string;
  readonly status:      PlanningComplianceStatus;
  readonly description: string;
}

export interface PlanningComplianceResult {
  readonly orgSlug:   string;
  readonly status:    PlanningComplianceStatus;
  readonly checks:    PlanningComplianceCheck[];
  readonly passed:    number;
  readonly warned:    number;
  readonly failed:    number;
  readonly evaluatedAt: string;
}

export function evaluatePlanningComplianceGate(
  orgSlug: string,
  plan:    StrategicPlan
): PlanningComplianceResult {
  const checks: PlanningComplianceCheck[] = [];

  // 1. Tenant isolation
  checks.push({
    rule:        "TENANT_ISOLATION",
    status:      plan.orgSlug === orgSlug ? "PASS" : "FAIL",
    description: plan.orgSlug === orgSlug
      ? "Plan belongs to correct tenant."
      : "Plan orgSlug does not match evaluating tenant — isolation violation.",
  });

  // 2. suggestedOnly
  checks.push({
    rule:        "SUGGESTED_ONLY",
    status:      plan.suggestedOnly === true ? "PASS" : "FAIL",
    description: plan.suggestedOnly === true
      ? "Plan is marked suggestedOnly."
      : "Plan missing suggestedOnly flag — execution guard violated.",
  });

  // 3. Has objectives
  checks.push({
    rule:        "HAS_OBJECTIVES",
    status:      plan.objectives.length > 0 ? "PASS" : "WARN",
    description: plan.objectives.length > 0
      ? `Plan has ${plan.objectives.length} objective(s).`
      : "Plan has no objectives — planning completeness degraded.",
  });

  // 4. Has evidence
  checks.push({
    rule:        "HAS_EVIDENCE",
    status:      plan.evidenceIds.length > 0 ? "PASS" : "WARN",
    description: plan.evidenceIds.length > 0
      ? `Plan references ${plan.evidenceIds.length} evidence item(s).`
      : "Plan has no evidence references — traceability degraded.",
  });

  // 5. Has origin
  checks.push({
    rule:        "HAS_ORIGIN",
    status:      plan.metadata?.origin ? "PASS" : "WARN",
    description: plan.metadata?.origin
      ? `Plan origin declared: ${plan.metadata.origin}.`
      : "Plan origin not declared in metadata.",
  });

  // 6. Has narrative (proxy for limitations disclosure)
  checks.push({
    rule:        "HAS_LIMITATIONS",
    status:      plan.narrative?.length > 0 ? "PASS" : "WARN",
    description: plan.narrative?.length > 0
      ? "Plan narrative includes limitations disclosure."
      : "Plan narrative empty — explicability degraded.",
  });

  const passed  = checks.filter((c) => c.status === "PASS").length;
  const warned  = checks.filter((c) => c.status === "WARN").length;
  const failed  = checks.filter((c) => c.status === "FAIL").length;
  const overall: PlanningComplianceStatus = failed > 0 ? "FAIL" : warned > 0 ? "WARN" : "PASS";

  return { orgSlug, status: overall, checks, passed, warned, failed, evaluatedAt: new Date().toISOString() };
}

export function assertAllInitiativesSuggestedOnly(initiatives: StrategicInitiative[]): void {
  for (const i of initiatives) {
    if (i.suggestedOnly !== true) {
      throw new Error(`Initiative ${i.id} is missing suggestedOnly: true — compliance violation.`);
    }
  }
}

export function assertPlanTenantIsolation(orgSlug: string, plan: StrategicPlan): void {
  if (plan.orgSlug !== orgSlug) {
    throw new Error(`Tenant isolation violation: plan ${plan.id} belongs to ${plan.orgSlug}, not ${orgSlug}.`);
  }
}
