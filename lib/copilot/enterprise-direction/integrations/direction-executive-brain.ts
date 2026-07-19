// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 20: Executive Brain Integration

export interface DirectionBrainContext {
  readonly orgSlug:      string;
  readonly brainBoost:   number; // 0–0.12
  readonly hasInsights:  boolean;
  readonly insightCount: number;
}

export function buildDirectionBrainContext(
  orgSlug: string,
  insights: Array<{ priority?: string; confidence?: number }> = []
): DirectionBrainContext {
  try {
    const highPriorityCount = insights.filter(
      (i) => i.priority === "HIGH" || i.priority === "CRITICAL"
    ).length;
    const brainBoost = Math.min(0.12, highPriorityCount * 0.02 + insights.length * 0.01);
    return {
      orgSlug,
      brainBoost,
      hasInsights:  insights.length > 0,
      insightCount: insights.length,
    };
  } catch {
    return { orgSlug, brainBoost: 0, hasInsights: false, insightCount: 0 };
  }
}
