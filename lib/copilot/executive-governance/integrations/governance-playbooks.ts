// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 25: Playbooks Integration
// CRITICAL: uses .title NOT .name on playbooks

export interface GovernancePlaybookContext {
  readonly orgSlug:        string;
  readonly playbookTitles: string[];
  readonly playbookBoost:  number; // 0–1
  readonly hasPlaybooks:   boolean;
}

export interface GovernancePlaybook {
  readonly title:    string; // NOTE: .title not .name
  readonly domain?:  string;
  readonly priority?: string;
}

export function getGovernancePlaybookTitles(
  playbooks: GovernancePlaybook[],
  limit: number = 5
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

export function buildGovernancePlaybookContext(
  orgSlug: string,
  playbooks?: GovernancePlaybook[]
): GovernancePlaybookContext {
  try {
    const titles = getGovernancePlaybookTitles(playbooks ?? [], 5);
    const boost  = Math.min(0.08, titles.length * 0.015);
    return {
      orgSlug,
      playbookTitles: titles,
      playbookBoost:  boost,
      hasPlaybooks:   titles.length > 0,
    };
  } catch {
    return { orgSlug, playbookTitles: [], playbookBoost: 0, hasPlaybooks: false };
  }
}
