// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 26: Playbooks Integration
// CRITICAL: uses .title not .name

export interface ForecastPlaybookContext {
  readonly orgSlug:        string;
  readonly playbookTitles: string[]; // CRITICAL: .title not .name
  readonly activeCount:    number;
  readonly playbookBoost:  number; // 0–0.07
  readonly hasPlaybookData: boolean;
}

export interface ForecastPlaybookEntry {
  readonly title:    string; // CRITICAL: .title not .name
  readonly isActive: boolean;
  readonly domain:   string;
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
}

export function buildForecastPlaybookContext(
  orgSlug: string,
  playbooks: ForecastPlaybookEntry[]
): ForecastPlaybookContext {
  try {
    if (!playbooks || playbooks.length === 0) {
      return buildEmptyForecastPlaybookContext(orgSlug);
    }

    const active = playbooks.filter((p) => p.isActive);
    // CRITICAL: uses .title not .name
    const playbookTitles = active.slice(0, 5).map((p) => p.title);

    const playbookBoost = Math.min(
      0.07,
      (active.length > 0    ? 0.03 : 0) +
      Math.min(0.04, active.length * 0.01)
    );

    return {
      orgSlug,
      playbookTitles, // .title used
      activeCount:    active.length,
      playbookBoost,
      hasPlaybookData: true,
    };
  } catch {
    return buildEmptyForecastPlaybookContext(orgSlug);
  }
}

export function buildEmptyForecastPlaybookContext(
  orgSlug: string
): ForecastPlaybookContext {
  return {
    orgSlug,
    playbookTitles:  [],
    activeCount:     0,
    playbookBoost:   0,
    hasPlaybookData: false,
  };
}

export function getPlaybookTitlesForForecast(
  orgSlug: string,
  playbooks: ForecastPlaybookEntry[],
  limit = 3
): string[] {
  try {
    return playbooks
      .filter((p) => p.isActive)
      .map((p) => p.title) // CRITICAL: .title not .name
      .slice(0, limit);
  } catch {
    return [];
  }
}
