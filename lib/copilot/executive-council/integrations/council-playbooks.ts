// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 27: Playbooks Integration

import type { Playbook } from "../../playbooks/playbook-types";

export interface PlaybookCouncilContext {
  readonly activePlaybooks:     Playbook[];
  readonly criticalPlaybooks:   Playbook[];
  readonly playbookBoost:       number;
  readonly activeCount:         number;
}

export function buildPlaybookCouncilContext(
  orgSlug:   string,
  playbooks: Playbook[]
): PlaybookCouncilContext {
  try {
    const scoped   = playbooks.filter((p) => p.orgSlug === orgSlug);
    const active   = scoped.filter((p) => p.status === "ACTIVE");
    const critical = active.filter((p) => p.priority === "CRITICAL");

    const playbookBoost = Math.min(
      0.08,
      (active.length > 0 ? 0.04 : 0) + (critical.length > 0 ? 0.04 : 0)
    );

    return { activePlaybooks: active, criticalPlaybooks: critical, playbookBoost, activeCount: active.length };
  } catch {
    return { activePlaybooks: [], criticalPlaybooks: [], playbookBoost: 0, activeCount: 0 };
  }
}

export function getPlaybookTitlesForCouncil(
  orgSlug:   string,
  playbooks: Playbook[],
  limit = 3
): string[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .slice(0, limit)
    .map((p) => p.title);
}
