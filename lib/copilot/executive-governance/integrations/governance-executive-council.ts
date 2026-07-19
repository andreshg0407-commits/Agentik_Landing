// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 27: Executive Council Integration

export interface GovernanceCouncilContext {
  readonly orgSlug:        string;
  readonly councilSignal:  GovernanceCouncilSignal;
  readonly councilBoost:   number; // 0–1
  readonly hasCouncil:     boolean;
}

export type GovernanceCouncilSignal =
  | "ESCALATION_ACTIVE"
  | "COUNCIL_STABLE"
  | "NO_COUNCIL_DATA";

export interface CouncilDeliberation {
  readonly id:       string;
  readonly status:   string;
  readonly isUrgent?: boolean;
}

export function getGovernanceCouncilSignal(
  deliberations: CouncilDeliberation[]
): GovernanceCouncilSignal {
  try {
    if (deliberations.length === 0) return "NO_COUNCIL_DATA";
    const hasUrgent = deliberations.some((d) => d.isUrgent || d.status === "ESCALATED");
    return hasUrgent ? "ESCALATION_ACTIVE" : "COUNCIL_STABLE";
  } catch {
    return "NO_COUNCIL_DATA";
  }
}

export function buildGovernanceCouncilContext(
  orgSlug: string,
  deliberations?: CouncilDeliberation[]
): GovernanceCouncilContext {
  try {
    const signal    = getGovernanceCouncilSignal(deliberations ?? []);
    const boost     = signal === "COUNCIL_STABLE" ? 0.05 : 0;
    return {
      orgSlug,
      councilSignal: signal,
      councilBoost:  boost,
      hasCouncil:    (deliberations ?? []).length > 0,
    };
  } catch {
    return { orgSlug, councilSignal: "NO_COUNCIL_DATA", councilBoost: 0, hasCouncil: false };
  }
}
