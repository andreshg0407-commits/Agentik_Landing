// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 22: Board Intelligence Integration

export interface BoardIntelligenceForecastContext {
  readonly orgSlug:             string;
  readonly boardFindings:       string[];
  readonly boardRisks:          string[];
  readonly boardOpportunities:  string[];
  readonly governanceScore:     number; // 0–1
  readonly boardBoost:          number; // 0–0.12
  readonly hasBoardData:        boolean;
}

export interface BoardIntelligenceForecastEntry {
  readonly title:          string;
  readonly type:           "FINDING" | "RISK" | "OPPORTUNITY";
  readonly domain:         string;
  readonly score:          number; // 0–1
  readonly isBlocker:      boolean;
}

export function buildBoardIntelligenceForecastContext(
  orgSlug: string,
  entries: BoardIntelligenceForecastEntry[],
  governanceScore: number
): BoardIntelligenceForecastContext {
  try {
    if (!entries || entries.length === 0) {
      return buildEmptyBoardIntelligenceForecastContext(orgSlug);
    }

    const findings     = entries.filter((e) => e.type === "FINDING").slice(0, 5).map((e) => e.title);
    const risks        = entries.filter((e) => e.type === "RISK").slice(0, 5).map((e) => e.title);
    const opportunities = entries.filter((e) => e.type === "OPPORTUNITY").slice(0, 5).map((e) => e.title);

    const govScore = Math.max(0, Math.min(1, governanceScore));

    const boardBoost = Math.min(
      0.12,
      (entries.length > 0  ? 0.04 : 0) +
      (govScore >= 0.6     ? 0.04 : 0.01) +
      Math.min(0.04, entries.length * 0.005)
    );

    return {
      orgSlug,
      boardFindings:      findings,
      boardRisks:         risks,
      boardOpportunities: opportunities,
      governanceScore:    govScore,
      boardBoost,
      hasBoardData:       true,
    };
  } catch {
    return buildEmptyBoardIntelligenceForecastContext(orgSlug);
  }
}

export function buildEmptyBoardIntelligenceForecastContext(
  orgSlug: string
): BoardIntelligenceForecastContext {
  return {
    orgSlug,
    boardFindings:       [],
    boardRisks:          [],
    boardOpportunities:  [],
    governanceScore:     0,
    boardBoost:          0,
    hasBoardData:        false,
  };
}

export function getBoardForecastRiskLabels(
  ctx: BoardIntelligenceForecastContext,
  limit = 3
): string[] {
  return ctx.boardRisks.slice(0, limit);
}
