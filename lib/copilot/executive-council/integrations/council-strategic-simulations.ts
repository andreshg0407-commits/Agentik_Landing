// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 20: Strategic Simulations Integration

// Simulation types kept minimal to avoid coupling to the simulations sprint.
export interface SimulationSummary {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly outcome:         string;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly suggestedOnly:   true;
}

export interface SimulationCouncilContext {
  readonly simulations:      SimulationSummary[];
  readonly simulationBoost:  number;
  readonly topOutcomeLabels: string[];
}

export function buildSimulationCouncilContext(
  orgSlug:     string,
  simulations: SimulationSummary[]
): SimulationCouncilContext {
  try {
    const scoped = simulations.filter((s) => s.orgSlug === orgSlug);

    const simulationBoost = Math.min(
      0.10,
      scoped.length > 0 ? 0.05 + Math.min(0.05, scoped.length * 0.01) : 0
    );

    const topOutcomeLabels = scoped
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 3)
      .map((s) => s.title);

    return { simulations: scoped, simulationBoost, topOutcomeLabels };
  } catch {
    return { simulations: [], simulationBoost: 0, topOutcomeLabels: [] };
  }
}

export function getHighImpactSimulations(
  orgSlug:     string,
  simulations: SimulationSummary[],
  threshold = 0.7
): SimulationSummary[] {
  return simulations.filter((s) => s.orgSlug === orgSlug && s.impactScore >= threshold);
}
