// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 31: Tenant Profile Integration

import type { GovernanceDomain } from "../executive-governance-types";

export interface GovernanceTenantProfile {
  readonly orgSlug:                 string;
  readonly riskTolerance:           "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  readonly escalationThreshold:     number; // 0–1
  readonly primaryDomain:           GovernanceDomain;
  readonly governanceFrameworks:    string[];
  readonly requiredApprovalLevels:  string[];
}

const DEFAULT_PROFILES: Record<string, GovernanceTenantProfile> = {
  castillitos: {
    orgSlug:                "castillitos",
    riskTolerance:          "MODERATE",
    escalationThreshold:    0.65,
    primaryDomain:          "FINANCIAL",
    governanceFrameworks:   ["INTERNAL_POLICY", "FINANCIAL_THRESHOLD"],
    requiredApprovalLevels: ["DIRECTOR", "EXECUTIVE"],
  },
};

const DEFAULT_PROFILE: GovernanceTenantProfile = {
  orgSlug:                "default",
  riskTolerance:          "MODERATE",
  escalationThreshold:    0.70,
  primaryDomain:          "CROSS_DOMAIN",
  governanceFrameworks:   ["INTERNAL_POLICY"],
  requiredApprovalLevels: ["MANAGER"],
};

export function getGovernanceTenantProfile(orgSlug: string): GovernanceTenantProfile {
  try {
    return DEFAULT_PROFILES[orgSlug] ?? { ...DEFAULT_PROFILE, orgSlug };
  } catch {
    return { ...DEFAULT_PROFILE, orgSlug };
  }
}

export function isGovernanceEscalationRequired(
  profile: GovernanceTenantProfile,
  overallScore: number
): boolean {
  try {
    return overallScore < (1 - profile.escalationThreshold);
  } catch {
    return false;
  }
}
