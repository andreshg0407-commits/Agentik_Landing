// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 30: Playbooks Integration
// CRITICAL: uses .title NOT .name on playbooks

export interface DirectionPlaybookContext {
  readonly orgSlug:       string;
  readonly playbookTitles: string[];
  readonly playbookBoost: number; // 0–0.08
}

export function getDirectionPlaybookTitles(
  playbooks: Array<{ title: string; domain?: string; status?: string }>,
  limit = 5
): string[] {
  try {
    return playbooks
      .filter((p) => p.title && p.title.length > 0)
      .slice(0, limit)
      .map((p) => p.title); // .title NOT .name
  } catch {
    return [];
  }
}

export function buildDirectionPlaybookContext(
  orgSlug: string,
  playbooks: Array<{ title: string; domain?: string; status?: string }> = []
): DirectionPlaybookContext {
  try {
    const playbookTitles = getDirectionPlaybookTitles(playbooks);
    const playbookBoost  = Math.min(0.08, playbookTitles.length * 0.015);
    return { orgSlug, playbookTitles, playbookBoost };
  } catch {
    return { orgSlug, playbookTitles: [], playbookBoost: 0 };
  }
}
