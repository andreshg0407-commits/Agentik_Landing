// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 19: Strategic Planning Integration

export interface PlanBoardSummary {
  readonly id:        string;
  readonly orgSlug:   string;
  readonly title:     string;
  readonly status:    string;
  readonly score:     number;
}

export interface InitiativeBoardSummary {
  readonly id:        string;
  readonly orgSlug:   string;
  readonly title:     string;
  readonly status:    string;
}

export interface PlanningBoardContext {
  readonly orgSlug:       string;
  readonly plans:         PlanBoardSummary[];
  readonly initiatives:   InitiativeBoardSummary[];
  readonly planningBoost: number;
  readonly activePlanCount:      number;
  readonly activeInitiativeCount: number;
  readonly hasConflictingPlans:   boolean;
}

export function buildPlanningBoardContext(
  orgSlug:     string,
  plans:       PlanBoardSummary[],
  initiatives: InitiativeBoardSummary[]
): PlanningBoardContext {
  try {
    const scopedPlans  = plans.filter((p) => p.orgSlug === orgSlug);
    const scopedInits  = initiatives.filter((i) => i.orgSlug === orgSlug);
    const activePlans  = scopedPlans.filter((p) => p.status === "ACTIVE" || p.status === "IN_PROGRESS");
    const activeInits  = scopedInits.filter((i) => i.status === "ACTIVE" || i.status === "IN_PROGRESS");
    const hasConflicts = hasConflictingBoardPlans(orgSlug, scopedPlans);

    const planningBoost = Math.min(
      0.10,
      (activePlans.length > 0 ? 0.05 : 0) +
      (activeInits.length > 0 ? 0.03 : 0) +
      (!hasConflicts ? 0.02 : -0.02)
    );

    return {
      orgSlug,
      plans:         scopedPlans,
      initiatives:   scopedInits,
      planningBoost: Math.max(0, planningBoost),
      activePlanCount:       activePlans.length,
      activeInitiativeCount: activeInits.length,
      hasConflictingPlans:   hasConflicts,
    };
  } catch {
    return buildEmptyPlanningBoardContext(orgSlug);
  }
}

export function buildEmptyPlanningBoardContext(orgSlug: string): PlanningBoardContext {
  return {
    orgSlug,
    plans:         [],
    initiatives:   [],
    planningBoost: 0,
    activePlanCount:       0,
    activeInitiativeCount: 0,
    hasConflictingPlans:   false,
  };
}

export function hasConflictingBoardPlans(orgSlug: string, plans: PlanBoardSummary[]): boolean {
  try {
    const active = plans.filter((p) => p.orgSlug === orgSlug && (p.status === "ACTIVE" || p.status === "IN_PROGRESS"));
    // Detect duplicate title prefixes as a proxy for conflicts
    const titleKeys = active.map((p) => p.title.slice(0, 20).toLowerCase());
    return new Set(titleKeys).size < titleKeys.length;
  } catch {
    return false;
  }
}

export function getActivePlanTitles(ctx: PlanningBoardContext, limit = 3): string[] {
  return ctx.plans
    .filter((p) => p.status === "ACTIVE" || p.status === "IN_PROGRESS")
    .slice(0, limit)
    .map((p) => p.title);
}
