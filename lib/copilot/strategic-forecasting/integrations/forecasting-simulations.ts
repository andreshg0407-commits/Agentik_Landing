// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 19: Simulations Integration

export interface SimulationForecastSummary {
  readonly orgSlug:           string;
  readonly scenarioCount:     number;
  readonly averageProbability: number; // 0–1
  readonly topScenarioTitle:  string;
  readonly riskScenarios:     string[];
  readonly opportunityScenarios: string[];
  readonly simulationBoost:   number; // 0–0.10
  readonly hasSimulationData: boolean;
  readonly suggestedOnly:     true; // literal
}

export interface SimulationForecastEntry {
  readonly title:       string;
  readonly probability: number; // 0–1
  readonly isRisk:      boolean;
  readonly isOpportunity: boolean;
}

export function buildSimulationForecastSummary(
  orgSlug: string,
  simulations: SimulationForecastEntry[]
): SimulationForecastSummary {
  try {
    if (!simulations || simulations.length === 0) {
      return buildEmptySimulationForecastSummary(orgSlug);
    }

    const averageProbability =
      simulations.reduce((s, sim) => s + sim.probability, 0) / simulations.length;

    const sorted = [...simulations].sort((a, b) => b.probability - a.probability);
    const topScenarioTitle = sorted[0]?.title ?? "";

    const riskScenarios = simulations
      .filter((s) => s.isRisk)
      .slice(0, 3)
      .map((s) => s.title);

    const opportunityScenarios = simulations
      .filter((s) => s.isOpportunity)
      .slice(0, 3)
      .map((s) => s.title);

    const simulationBoost = Math.min(
      0.10,
      (simulations.length > 0     ? 0.04 : 0) +
      (riskScenarios.length > 0    ? 0.03 : 0) +
      (opportunityScenarios.length > 0 ? 0.03 : 0)
    );

    return {
      orgSlug,
      scenarioCount:        simulations.length,
      averageProbability,
      topScenarioTitle,
      riskScenarios,
      opportunityScenarios,
      simulationBoost,
      hasSimulationData:    true,
      suggestedOnly:        true,
    };
  } catch {
    return buildEmptySimulationForecastSummary(orgSlug);
  }
}

export function buildEmptySimulationForecastSummary(
  orgSlug: string
): SimulationForecastSummary {
  return {
    orgSlug,
    scenarioCount:          0,
    averageProbability:     0,
    topScenarioTitle:       "",
    riskScenarios:          [],
    opportunityScenarios:   [],
    simulationBoost:        0,
    hasSimulationData:      false,
    suggestedOnly:          true,
  };
}
