// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 20: Executive Council Integration

export interface CouncilBoardSummary {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly topic:           string;
  readonly outcome:         string;
  readonly sessionScore:    number;
  readonly confidence:      string;
  readonly hasEscalation:   boolean;
  readonly hasConsensus:    boolean;
}

export interface CouncilBoardContext {
  readonly orgSlug:              string;
  readonly sessions:             CouncilBoardSummary[];
  readonly councilBoost:         number;
  readonly consensusCount:       number;
  readonly escalationCount:      number;
  readonly hasActiveEscalation:  boolean;
}

export function buildCouncilBoardContext(
  orgSlug:  string,
  sessions: CouncilBoardSummary[]
): CouncilBoardContext {
  try {
    const scoped        = sessions.filter((s) => s.orgSlug === orgSlug);
    const consensusSessions   = scoped.filter((s) => s.hasConsensus);
    const escalationSessions  = scoped.filter((s) => s.hasEscalation);
    const hasActiveEscalation = escalationSessions.length > 0;

    const councilBoost = Math.min(
      0.12,
      (consensusSessions.length > 0 ? 0.06 : 0) +
      (scoped.length > 0 ? 0.04 : 0) +
      (!hasActiveEscalation ? 0.02 : -0.04)
    );

    return {
      orgSlug,
      sessions:             scoped,
      councilBoost:         Math.max(0, councilBoost),
      consensusCount:       consensusSessions.length,
      escalationCount:      escalationSessions.length,
      hasActiveEscalation,
    };
  } catch {
    return buildEmptyCouncilBoardContext(orgSlug);
  }
}

export function buildEmptyCouncilBoardContext(orgSlug: string): CouncilBoardContext {
  return {
    orgSlug,
    sessions:             [],
    councilBoost:         0,
    consensusCount:       0,
    escalationCount:      0,
    hasActiveEscalation:  false,
  };
}

export function getCouncilTopics(ctx: CouncilBoardContext, limit = 3): string[] {
  return ctx.sessions.slice(0, limit).map((s) => s.topic);
}

export function shouldEscalateToBoardFromCouncil(ctx: CouncilBoardContext): boolean {
  return ctx.hasActiveEscalation || ctx.escalationCount >= 2;
}

export function getCouncilGovernanceSignal(ctx: CouncilBoardContext): number {
  if (ctx.sessions.length === 0) return 0.5;
  const avgScore = ctx.sessions.reduce((sum, s) => sum + s.sessionScore, 0) / ctx.sessions.length;
  const escalationPenalty = ctx.hasActiveEscalation ? 0.10 : 0;
  return Math.max(0, Math.min(1, avgScore - escalationPenalty));
}
