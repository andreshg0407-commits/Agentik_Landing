// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 23: Planning Integration

export interface DirectionPlanningContext {
  readonly orgSlug:          string;
  readonly planCount:        number;
  readonly hasConflictingPlans: boolean;
  readonly planningBoost:    number; // 0–0.08
}

export function buildDirectionPlanningContext(
  orgSlug: string,
  plans: Array<{ title?: string; status?: string }> = []
): DirectionPlanningContext {
  try {
    const titles    = plans.map((p) => (p.title ?? "").slice(0, 40));
    const unique    = new Set(titles);
    const hasConflict = unique.size < titles.length;
    const boost     = Math.min(0.08, plans.length * 0.01);
    return {
      orgSlug,
      planCount:           plans.length,
      hasConflictingPlans: hasConflict,
      planningBoost:       boost,
    };
  } catch {
    return {
      orgSlug,
      planCount:           0,
      hasConflictingPlans: false,
      planningBoost:       0,
    };
  }
}
