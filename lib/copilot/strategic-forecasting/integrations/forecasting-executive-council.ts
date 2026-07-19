// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 21: Executive Council Integration

export interface CouncilForecastContext {
  readonly orgSlug:           string;
  readonly councilSignals:    string[];
  readonly escalationFlags:   string[];
  readonly councilBoost:      number; // 0–0.10
  readonly hasCouncilData:    boolean;
  readonly hasActiveEscalation: boolean;
}

export interface CouncilForecastEntry {
  readonly title:       string;
  readonly isEscalated: boolean;
  readonly domain:      string;
  readonly severity:    "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export function buildCouncilForecastContext(
  orgSlug: string,
  entries: CouncilForecastEntry[]
): CouncilForecastContext {
  try {
    if (!entries || entries.length === 0) {
      return buildEmptyCouncilForecastContext(orgSlug);
    }

    const escalated = entries.filter((e) => e.isEscalated);
    const councilSignals  = entries.slice(0, 5).map((e) => e.title);
    const escalationFlags = escalated.slice(0, 3).map((e) => e.title);

    const councilBoost = Math.min(
      0.10,
      (entries.length > 0   ? 0.04 : 0) +
      (escalated.length > 0 ? 0.03 : 0) +
      Math.min(0.03, entries.length * 0.005)
    );

    return {
      orgSlug,
      councilSignals,
      escalationFlags,
      councilBoost,
      hasCouncilData:     true,
      hasActiveEscalation: escalated.length > 0,
    };
  } catch {
    return buildEmptyCouncilForecastContext(orgSlug);
  }
}

export function buildEmptyCouncilForecastContext(
  orgSlug: string
): CouncilForecastContext {
  return {
    orgSlug,
    councilSignals:      [],
    escalationFlags:     [],
    councilBoost:        0,
    hasCouncilData:      false,
    hasActiveEscalation: false,
  };
}

export function getCouncilForecastGovernanceSignal(
  ctx: CouncilForecastContext
): string {
  if (ctx.hasActiveEscalation) return "ESCALATION_ACTIVE";
  if (!ctx.hasCouncilData)     return "NO_COUNCIL_DATA";
  return "COUNCIL_STABLE";
}
