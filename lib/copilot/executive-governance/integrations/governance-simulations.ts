// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 26: Simulations Integration

export interface GovernanceSimulationContext {
  readonly orgSlug:         string;
  readonly scenarioTitles:  string[];
  readonly simulationBoost: number; // 0–1
  readonly hasSimulations:  boolean;
  readonly suggestedOnly:   true;
}

export interface SimulationScenario {
  readonly title:       string;
  readonly confidence?: number;
  readonly outcome?:    string;
}

export function buildGovernanceSimulationContext(
  orgSlug: string,
  scenarios?: SimulationScenario[]
): GovernanceSimulationContext {
  try {
    const active = (scenarios ?? []).filter((s) => s.title && s.title.length > 0);
    const titles = active.slice(0, 5).map((s) => s.title);
    const boost  = Math.min(0.08, titles.length * 0.015);
    return {
      orgSlug,
      scenarioTitles:  titles,
      simulationBoost: boost,
      hasSimulations:  titles.length > 0,
      suggestedOnly:   true,
    };
  } catch {
    return { orgSlug, scenarioTitles: [], simulationBoost: 0, hasSimulations: false, suggestedOnly: true };
  }
}
