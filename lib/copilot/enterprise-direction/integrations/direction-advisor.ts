// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 21: Advisor Integration

export interface DirectionAdvisorContext {
  readonly orgSlug:         string;
  readonly criticalRecCount: number;
  readonly advisorBoost:    number; // 0–0.10
}

export function buildDirectionAdvisorContext(
  orgSlug: string,
  recommendations: Array<{ priority?: string; confidence?: number }> = []
): DirectionAdvisorContext {
  try {
    const criticalRecCount = recommendations.filter(
      (r) => r.priority === "CRITICAL"
    ).length;
    const advisorBoost = Math.min(0.10, criticalRecCount * 0.03 + recommendations.length * 0.005);
    return { orgSlug, criticalRecCount, advisorBoost };
  } catch {
    return { orgSlug, criticalRecCount: 0, advisorBoost: 0 };
  }
}

export function hasAdvisorSignals(ctx: DirectionAdvisorContext): boolean {
  try {
    return ctx.criticalRecCount > 0;
  } catch {
    return false;
  }
}
