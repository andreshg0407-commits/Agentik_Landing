// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 22: Simulations Integration

export interface DirectionSimulationSummary {
  readonly orgSlug:         string;
  readonly scenarioCount:   number;
  readonly bestCaseScore:   number; // 0–1
  readonly worstCaseScore:  number; // 0–1
  readonly simulationBoost: number; // 0–0.08
  readonly suggestedOnly:   true;
}

export function buildDirectionSimulationSummary(
  orgSlug: string,
  scenarios: Array<{ score?: number; type?: string }> = []
): DirectionSimulationSummary {
  try {
    const scores     = scenarios.map((s) => s.score ?? 0.5);
    const bestCase   = scores.length > 0 ? Math.max(...scores) : 0;
    const worstCase  = scores.length > 0 ? Math.min(...scores) : 0;
    const boost      = Math.min(0.08, scenarios.length * 0.015);
    return {
      orgSlug,
      scenarioCount:   scenarios.length,
      bestCaseScore:   Math.min(1, bestCase),
      worstCaseScore:  Math.max(0, worstCase),
      simulationBoost: boost,
      suggestedOnly:   true,
    };
  } catch {
    return {
      orgSlug,
      scenarioCount:   0,
      bestCaseScore:   0,
      worstCaseScore:  0,
      simulationBoost: 0,
      suggestedOnly:   true,
    };
  }
}
