// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 23: Planning Integration

export interface GovernancePlanningContext {
  readonly orgSlug:     string;
  readonly planTitles:  string[];
  readonly planBoost:   number; // 0–1
  readonly hasPlanning: boolean;
}

export interface PlanningPlan {
  readonly title:    string;
  readonly status?:  string;
  readonly priority?: string;
}

export function buildGovernancePlanningContext(
  orgSlug: string,
  plans?: PlanningPlan[]
): GovernancePlanningContext {
  try {
    const activePlans = (plans ?? []).filter((p) => p.title && p.title.length > 0);
    const titles      = activePlans.slice(0, 5).map((p) => p.title);
    const boost       = Math.min(0.08, titles.length * 0.015);
    return {
      orgSlug,
      planTitles:  titles,
      planBoost:   boost,
      hasPlanning: titles.length > 0,
    };
  } catch {
    return { orgSlug, planTitles: [], planBoost: 0, hasPlanning: false };
  }
}
