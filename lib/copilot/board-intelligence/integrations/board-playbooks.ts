// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 26: Playbooks Integration

export interface PlaybookBoardSummary {
  readonly id:      string;
  readonly orgSlug: string;
  readonly title:   string;    // CRITICAL: .title not .name
  readonly status:  string;
  readonly domain:  string;
}

export interface PlaybookBoardContext {
  readonly orgSlug:          string;
  readonly playbooks:        PlaybookBoardSummary[];
  readonly playbookBoost:    number;
  readonly activeCount:      number;
  readonly governanceCount:  number;
}

export function buildPlaybookBoardContext(
  orgSlug:   string,
  playbooks: PlaybookBoardSummary[]
): PlaybookBoardContext {
  try {
    const scoped          = playbooks.filter((p) => p.orgSlug === orgSlug);
    const active          = scoped.filter((p) => p.status === "ACTIVE");
    const governancePBs   = scoped.filter((p) =>
      p.domain.toLowerCase().includes("governance") ||
      p.domain.toLowerCase().includes("gobierno") ||
      p.domain.toLowerCase().includes("compliance")
    );

    const playbookBoost = Math.min(
      0.08,
      (active.length > 0 ? 0.04 : 0) +
      (governancePBs.length > 0 ? 0.04 : 0)
    );

    return {
      orgSlug,
      playbooks:       scoped,
      playbookBoost,
      activeCount:     active.length,
      governanceCount: governancePBs.length,
    };
  } catch {
    return buildEmptyPlaybookBoardContext(orgSlug);
  }
}

export function buildEmptyPlaybookBoardContext(orgSlug: string): PlaybookBoardContext {
  return {
    orgSlug,
    playbooks:       [],
    playbookBoost:   0,
    activeCount:     0,
    governanceCount: 0,
  };
}

export function getPlaybookTitlesForBoard(
  orgSlug:   string,
  playbooks: PlaybookBoardSummary[],
  limit = 3
): string[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .slice(0, limit)
    .map((p) => p.title);   // CRITICAL: .title not .name
}
