// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 18: Strategic Simulations Integration

export interface SimulationBoardSummary {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly outcome:         string;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly suggestedOnly:   true;
}

export interface SimulationBoardContext {
  readonly orgSlug:         string;
  readonly simulations:     SimulationBoardSummary[];
  readonly simulationBoost: number;
  readonly highImpactCount: number;
  readonly totalCount:      number;
}

export function buildSimulationBoardContext(
  orgSlug:     string,
  simulations: SimulationBoardSummary[]
): SimulationBoardContext {
  try {
    const scoped         = simulations.filter((s) => s.orgSlug === orgSlug);
    const highImpact     = scoped.filter((s) => s.impactScore >= 0.70);
    const simulationBoost = Math.min(0.08, (scoped.length > 0 ? 0.04 : 0) + (highImpact.length > 0 ? 0.04 : 0));

    return {
      orgSlug,
      simulations:     scoped,
      simulationBoost,
      highImpactCount: highImpact.length,
      totalCount:      scoped.length,
    };
  } catch {
    return buildEmptySimulationBoardContext(orgSlug);
  }
}

export function buildEmptySimulationBoardContext(orgSlug: string): SimulationBoardContext {
  return {
    orgSlug,
    simulations:     [],
    simulationBoost: 0,
    highImpactCount: 0,
    totalCount:      0,
  };
}

export function getSimulationTitlesForBoard(ctx: SimulationBoardContext, limit = 3): string[] {
  return ctx.simulations.slice(0, limit).map((s) => s.title);
}

export function hasHighImpactSimulations(ctx: SimulationBoardContext): boolean {
  return ctx.highImpactCount > 0;
}
