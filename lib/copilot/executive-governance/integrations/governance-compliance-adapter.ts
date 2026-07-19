// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 29: Compliance Adapter Integration

export interface GovernanceComplianceAdapterContext {
  readonly orgSlug:          string;
  readonly frameworkCount:   number;
  readonly passingCount:     number;
  readonly complianceBoost:  number; // 0–1
  readonly hasCompliance:    boolean;
}

export interface ExternalComplianceFinding {
  readonly id:       string;
  readonly status:   "PASS" | "FAIL" | "WARNING" | string;
  readonly severity?: string;
}

export function buildGovernanceComplianceAdapterContext(
  orgSlug: string,
  findings?: ExternalComplianceFinding[]
): GovernanceComplianceAdapterContext {
  try {
    const all      = findings ?? [];
    const passing  = all.filter((f) => f.status === "PASS").length;
    const boost    = all.length > 0 ? Math.min(0.08, (passing / all.length) * 0.08) : 0;
    return {
      orgSlug,
      frameworkCount:  all.length,
      passingCount:    passing,
      complianceBoost: boost,
      hasCompliance:   all.length > 0,
    };
  } catch {
    return { orgSlug, frameworkCount: 0, passingCount: 0, complianceBoost: 0, hasCompliance: false };
  }
}
