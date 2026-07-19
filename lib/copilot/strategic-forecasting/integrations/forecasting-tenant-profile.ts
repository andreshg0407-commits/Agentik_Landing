// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 25: Tenant Profile Integration

export type ForecastRiskTolerance = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";

export interface TenantForecastProfile {
  readonly orgSlug:              string;
  readonly riskTolerance:        ForecastRiskTolerance;
  readonly forecastHorizonBias:  "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
  readonly escalationThreshold:  number; // 0–1: risk above this → escalate
  readonly industryVertical:     string;
  readonly regulatoryEnvironment: "HIGH" | "MEDIUM" | "LOW";
  readonly hasTenantProfile:     boolean;
}

const DEFAULT_TENANT_PROFILES: Record<string, TenantForecastProfile> = {
  castillitos: {
    orgSlug:               "castillitos",
    riskTolerance:         "MODERATE",
    forecastHorizonBias:   "MEDIUM_TERM",
    escalationThreshold:   0.65,
    industryVertical:      "Retail",
    regulatoryEnvironment: "MEDIUM",
    hasTenantProfile:      true,
  },
};

const FALLBACK_PROFILE: Omit<TenantForecastProfile, "orgSlug"> = {
  riskTolerance:         "MODERATE",
  forecastHorizonBias:   "MEDIUM_TERM",
  escalationThreshold:   0.70,
  industryVertical:      "General",
  regulatoryEnvironment: "MEDIUM",
  hasTenantProfile:      false,
};

export function getTenantForecastProfile(orgSlug: string): TenantForecastProfile {
  try {
    return DEFAULT_TENANT_PROFILES[orgSlug] ?? { ...FALLBACK_PROFILE, orgSlug };
  } catch {
    return { ...FALLBACK_PROFILE, orgSlug };
  }
}

export function getForecastEscalationThreshold(orgSlug: string): number {
  return getTenantForecastProfile(orgSlug).escalationThreshold;
}

export function getForecastRiskTolerance(orgSlug: string): ForecastRiskTolerance {
  return getTenantForecastProfile(orgSlug).riskTolerance;
}
