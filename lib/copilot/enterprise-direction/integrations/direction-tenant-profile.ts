// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 29: Tenant Profile Integration

export type DirectionRiskTolerance = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";

export interface DirectionTenantProfile {
  readonly orgSlug:            string;
  readonly riskTolerance:      DirectionRiskTolerance;
  readonly escalationThreshold: number; // 0–1
  readonly maxPriorities:      number;
  readonly horizonPreference:  "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
}

const TENANT_PROFILES: Record<string, DirectionTenantProfile> = {
  castillitos: {
    orgSlug:              "castillitos",
    riskTolerance:        "MODERATE",
    escalationThreshold:  0.65,
    maxPriorities:        7,
    horizonPreference:    "MEDIUM_TERM",
  },
};

const DEFAULT_PROFILE: Omit<DirectionTenantProfile, "orgSlug"> = {
  riskTolerance:        "MODERATE",
  escalationThreshold:  0.70,
  maxPriorities:        5,
  horizonPreference:    "MEDIUM_TERM",
};

export function getDirectionTenantProfile(orgSlug: string): DirectionTenantProfile {
  try {
    return TENANT_PROFILES[orgSlug] ?? { orgSlug, ...DEFAULT_PROFILE };
  } catch {
    return { orgSlug, ...DEFAULT_PROFILE };
  }
}

export function isDirectionEscalationRequired(
  profile: DirectionTenantProfile,
  overallScore: number
): boolean {
  try {
    return overallScore < (1 - profile.escalationThreshold);
  } catch {
    return false;
  }
}
