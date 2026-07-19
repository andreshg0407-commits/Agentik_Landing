// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 30: Advisor Integration

export interface GovernanceAdvisorContext {
  readonly orgSlug:         string;
  readonly advisorHints:    string[];
  readonly advisorBoost:    number; // 0–1
  readonly hasAdvisor:      boolean;
}

export interface AdvisorRecommendation {
  readonly title:       string;
  readonly confidence?: number;
  readonly domain?:     string;
}

export function buildGovernanceAdvisorContext(
  orgSlug: string,
  recommendations?: AdvisorRecommendation[]
): GovernanceAdvisorContext {
  try {
    const active = (recommendations ?? []).filter((r) => r.title && r.title.length > 0);
    const hints  = active.slice(0, 5).map((r) => r.title);
    const boost  = Math.min(0.08, hints.length * 0.015);
    return {
      orgSlug,
      advisorHints: hints,
      advisorBoost: boost,
      hasAdvisor:   hints.length > 0,
    };
  } catch {
    return { orgSlug, advisorHints: [], advisorBoost: 0, hasAdvisor: false };
  }
}
