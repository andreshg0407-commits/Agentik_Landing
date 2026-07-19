// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 20: Planning Integration

export interface PlanningForecastContext {
  readonly orgSlug:          string;
  readonly planTitles:       string[];
  readonly conflictingPlans: string[];
  readonly planningBoost:    number; // 0–0.08
  readonly hasPlanningData:  boolean;
  readonly hasConflicts:     boolean;
}

export interface PlanningForecastEntry {
  readonly title:    string;
  readonly horizon:  string;
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
  readonly domain:   string;
}

export function buildPlanningForecastContext(
  orgSlug: string,
  plans: PlanningForecastEntry[]
): PlanningForecastContext {
  try {
    if (!plans || plans.length === 0) {
      return buildEmptyPlanningForecastContext(orgSlug);
    }

    const planTitles = plans.slice(0, 6).map((p) => p.title);

    // Detect conflicts: same title prefix (first 30 chars) from different domains
    const conflictingPlans = detectConflictingPlanTitles(plans);

    const planningBoost = Math.min(
      0.08,
      (plans.length > 0          ? 0.04 : 0) +
      (conflictingPlans.length === 0 ? 0.04 : 0.01)
    );

    return {
      orgSlug,
      planTitles,
      conflictingPlans,
      planningBoost,
      hasPlanningData: true,
      hasConflicts:    conflictingPlans.length > 0,
    };
  } catch {
    return buildEmptyPlanningForecastContext(orgSlug);
  }
}

function detectConflictingPlanTitles(plans: PlanningForecastEntry[]): string[] {
  try {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const plan of plans) {
      const prefix = plan.title.slice(0, 30);
      const existing = seen.get(prefix);
      if (existing && existing !== plan.domain) {
        conflicts.push(plan.title);
      } else {
        seen.set(prefix, plan.domain);
      }
    }
    return conflicts;
  } catch {
    return [];
  }
}

export function buildEmptyPlanningForecastContext(
  orgSlug: string
): PlanningForecastContext {
  return {
    orgSlug,
    planTitles:       [],
    conflictingPlans: [],
    planningBoost:    0,
    hasPlanningData:  false,
    hasConflicts:     false,
  };
}

export function hasConflictingForecastPlans(ctx: PlanningForecastContext): boolean {
  return ctx.hasConflicts;
}
