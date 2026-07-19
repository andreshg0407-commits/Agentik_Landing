// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 21: Playbook Integration

import type { Playbook } from "../../playbooks/playbook-types";
import type { StrategicRecommendation, StrategicDomain } from "../strategic-advisor-types";

export interface PlaybookAdvisorSummary {
  readonly activePlaybooks:     Playbook[];
  readonly effectivePlaybooks:  Playbook[];
  readonly obsoletePlaybooks:   Playbook[];
  readonly playbookCount:       number;
}

export function buildPlaybookAdvisorSummary(orgSlug: string, playbooks: Playbook[]): PlaybookAdvisorSummary {
  const scoped    = playbooks.filter((p) => p.orgSlug === orgSlug);
  const active    = scoped.filter((p) => p.status === "ACTIVE");
  const effective = active.filter((p) => p.priority === "HIGH" || p.priority === "CRITICAL");
  const obsolete  = scoped.filter((p) => p.status !== "ACTIVE" && p.status !== "DRAFT");
  return { activePlaybooks: active, effectivePlaybooks: effective, obsoletePlaybooks: obsolete, playbookCount: scoped.length };
}

export function extractAdvisorRecommendationsFromPlaybooks(
  orgSlug: string,
  playbooks: Playbook[]
): Partial<StrategicRecommendation>[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .map((p) => ({
      orgSlug,
      title:          `Aplicar playbook: ${p.title}`,
      description:    p.description,
      rationale:      `Playbook activo con prioridad ${p.priority}`,
      domain:         _mapPlaybookDomain(p.category ?? ""),
      playbookIds:    [p.id],
      suggestedOnly:  true as const,
    }));
}

export function findAdvisorRelatedPlaybooks(
  orgSlug: string,
  domain: StrategicDomain,
  playbooks: Playbook[]
): Playbook[] {
  return playbooks.filter((p) =>
    p.orgSlug === orgSlug &&
    p.status === "ACTIVE" &&
    _mapPlaybookDomain(p.category ?? "") === domain
  ).slice(0, 5);
}

function _mapPlaybookDomain(category: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", COMPLIANCE: "COMPLIANCE", EXECUTIVE: "EXECUTIVE",
  };
  return map[category] ?? "CROSS_DOMAIN";
}
