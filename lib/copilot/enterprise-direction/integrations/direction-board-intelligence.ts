// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 25: Board Intelligence Integration

export interface DirectionBoardContext {
  readonly orgSlug:          string;
  readonly governanceScore:  number; // 0–1
  readonly boardBoost:       number; // 0–0.10
  readonly hasBoardData:     boolean;
}

export function buildDirectionBoardContext(
  orgSlug: string,
  boardItems: Array<{ score?: number; priority?: string }> = []
): DirectionBoardContext {
  try {
    if (boardItems.length === 0) {
      return { orgSlug, governanceScore: 0, boardBoost: 0, hasBoardData: false };
    }
    const avgScore      = boardItems.reduce((s, b) => s + (b.score ?? 0.5), 0) / boardItems.length;
    const govScore      = Math.min(1, avgScore);
    const boardBoost    = Math.min(0.10, boardItems.length * 0.015);
    return {
      orgSlug,
      governanceScore: govScore,
      boardBoost,
      hasBoardData:    true,
    };
  } catch {
    return { orgSlug, governanceScore: 0, boardBoost: 0, hasBoardData: false };
  }
}
