// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 17: Strategic Advisor Integration

export interface AdvisorBoardContext {
  readonly orgSlug:           string;
  readonly recommendations:   string[];
  readonly concerns:          string[];
  readonly risks:             string[];
  readonly advisorBoost:      number;
  readonly criticalRecCount:  number;
  readonly emergentCount:     number;
}

export function buildAdvisorBoardContext(
  orgSlug:        string,
  recommendations: string[],
  concerns:        string[],
  risks:           string[]
): AdvisorBoardContext {
  try {
    const criticalRecCount = recommendations.filter(
      (r) => r.toLowerCase().includes("crítico") || r.toLowerCase().includes("critical") || r.toLowerCase().includes("urgent")
    ).length;
    const emergentCount = concerns.filter(
      (c) => c.toLowerCase().includes("emergente") || c.toLowerCase().includes("emergent")
    ).length;

    const advisorBoost = Math.min(
      0.10,
      (recommendations.length > 0 ? 0.03 : 0) +
      (criticalRecCount > 0 ? 0.04 : 0) +
      (emergentCount > 0 ? 0.03 : 0)
    );

    return {
      orgSlug,
      recommendations,
      concerns,
      risks,
      advisorBoost,
      criticalRecCount,
      emergentCount,
    };
  } catch {
    return buildEmptyAdvisorBoardContext(orgSlug);
  }
}

export function buildEmptyAdvisorBoardContext(orgSlug: string): AdvisorBoardContext {
  return {
    orgSlug,
    recommendations: [],
    concerns:        [],
    risks:           [],
    advisorBoost:    0,
    criticalRecCount: 0,
    emergentCount:   0,
  };
}

export function getAdvisorTopRecommendationLabels(ctx: AdvisorBoardContext, limit = 3): string[] {
  return ctx.recommendations.slice(0, limit);
}

export function hasEmergentAdvisorConcerns(ctx: AdvisorBoardContext): boolean {
  return ctx.emergentCount > 0;
}
