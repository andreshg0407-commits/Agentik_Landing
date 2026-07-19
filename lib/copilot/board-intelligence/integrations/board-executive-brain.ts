// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 16: Executive Brain Integration

export interface ExecutiveBrainBoardContext {
  readonly orgSlug:           string;
  readonly contextScore:      number;
  readonly priorities:        string[];
  readonly risks:             string[];
  readonly opportunities:     string[];
  readonly focusAreas:        string[];
  readonly boardBoost:        number;
}

export function buildExecutiveBrainBoardContext(
  orgSlug:      string,
  priorities:   string[],
  risks:        string[],
  opportunities: string[],
  focusAreas:   string[],
  contextScore  = 0.6
): ExecutiveBrainBoardContext {
  try {
    const scoped = { priorities, risks, opportunities, focusAreas };
    const boardBoost = Math.min(0.15, contextScore * 0.15);
    return {
      orgSlug,
      contextScore,
      priorities:   scoped.priorities,
      risks:        scoped.risks,
      opportunities: scoped.opportunities,
      focusAreas:   scoped.focusAreas,
      boardBoost,
    };
  } catch {
    return buildEmptyExecutiveBrainBoardContext(orgSlug);
  }
}

export function buildEmptyExecutiveBrainBoardContext(orgSlug: string): ExecutiveBrainBoardContext {
  return {
    orgSlug,
    contextScore:  0,
    priorities:    [],
    risks:         [],
    opportunities: [],
    focusAreas:    [],
    boardBoost:    0,
  };
}

export function getBoardConfidenceBoostFromBrain(ctx: ExecutiveBrainBoardContext): number {
  return Math.min(0.15, ctx.boardBoost);
}

export function getBrainPriorityLabels(ctx: ExecutiveBrainBoardContext, limit = 3): string[] {
  return ctx.priorities.slice(0, limit);
}

export function getBrainRiskLabels(ctx: ExecutiveBrainBoardContext, limit = 3): string[] {
  return ctx.risks.slice(0, limit);
}
