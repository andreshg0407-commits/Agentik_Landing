// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 20: Executive Brain Integration

export interface GovernanceBrainContext {
  readonly orgSlug:      string;
  readonly insights:     string[];
  readonly brainBoost:   number; // 0–1, max 0.12
  readonly hasBrain:     boolean;
}

export interface ExecutiveInsight {
  readonly priority:    string;
  readonly categories: string[];
  readonly description?: string;
}

export function buildGovernanceBrainContext(
  orgSlug: string,
  insights?: ExecutiveInsight[]
): GovernanceBrainContext {
  try {
    const active   = (insights ?? []).filter((i) => i.priority && i.categories.length > 0);
    const snippets = active.slice(0, 5).map((i) => i.description ?? i.categories.join(", "));
    const boost    = Math.min(0.12, active.length * 0.02);
    return {
      orgSlug,
      insights:   snippets,
      brainBoost: boost,
      hasBrain:   active.length > 0,
    };
  } catch {
    return { orgSlug, insights: [], brainBoost: 0, hasBrain: false };
  }
}

export function applyBrainBoostToGovernanceScore(
  baseScore: number,
  brainContext: GovernanceBrainContext
): number {
  try {
    return Math.min(1, baseScore + brainContext.brainBoost);
  } catch {
    return baseScore;
  }
}
