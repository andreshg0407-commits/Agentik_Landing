// AGENTIK-STRATEGIC-PLANNING-01 — Phase 21: Playbooks Integration

import type { Playbook } from "../../playbooks/playbook-types";
import type { StrategicInitiative } from "../strategic-planning-types";

export interface PlaybookPlanningContext {
  readonly activePlaybookCount:    number;
  readonly criticalPlaybookCount:  number;
  readonly relatedPlaybookIds:     string[];
  readonly playbookConfidenceBoost: number;
}

export function buildPlaybookPlanningContext(
  orgSlug:    string,
  playbooks:  Playbook[]
): PlaybookPlanningContext {
  const scoped   = playbooks.filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE");
  const critical = scoped.filter((p) => p.priority === "CRITICAL");
  const boost    = Math.min(0.08, scoped.length * 0.02);

  return {
    activePlaybookCount:     scoped.length,
    criticalPlaybookCount:   critical.length,
    relatedPlaybookIds:      scoped.map((p) => p.id),
    playbookConfidenceBoost: boost,
  };
}

export function getRelatedPlaybooksForInitiative(
  orgSlug:    string,
  initiative: StrategicInitiative,
  playbooks:  Playbook[]
): Playbook[] {
  const domainMap: Record<string, string[]> = {
    FINANCE:     ["FINANCE", "TREASURY"],
    COMMERCIAL:  ["COMMERCIAL", "SALES"],
    MARKETING:   ["MARKETING"],
    OPERATIONS:  ["OPERATIONS"],
    TECHNOLOGY:  ["TECHNOLOGY"],
    PEOPLE:      ["PEOPLE"],
    RISK:        ["RISK"],
    COMPLIANCE:  ["COMPLIANCE"],
  };

  const relevantCategories = domainMap[initiative.domain] ?? [];

  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .filter((p) => relevantCategories.includes(p.category))
    .sort((a, b) => {
      const rank: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0);
    })
    .slice(0, 3);
}

export function getActivePlaybookLabels(
  orgSlug:   string,
  playbooks: Playbook[],
  limit    = 4
): string[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .sort((a, b) => {
      const rank: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0);
    })
    .slice(0, limit)
    .map((p) => p.title);
}
