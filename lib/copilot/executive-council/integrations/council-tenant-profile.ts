// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 26: Tenant Profile Integration

import type { CouncilPerspective } from "../executive-council-types";

export interface CouncilTenantProfile {
  readonly orgSlug:            string;
  readonly riskTolerance:      "LOW" | "MEDIUM" | "HIGH";
  readonly primaryDomains:     string[];
  readonly preferredPerspectives: CouncilPerspective[];
  readonly escalationThreshold: number; // agreement score below which escalation is forced
}

const _tenantProfiles = new Map<string, CouncilTenantProfile>();

const DEFAULT_PROFILE: Omit<CouncilTenantProfile, "orgSlug"> = {
  riskTolerance:        "MEDIUM",
  primaryDomains:       ["FINANCE", "COMMERCIAL"],
  preferredPerspectives: ["FINANCE", "COMMERCIAL", "OPERATIONS", "STRATEGY", "RISK"],
  escalationThreshold:  0.35,
};

export function registerCouncilTenantProfile(profile: CouncilTenantProfile): void {
  _tenantProfiles.set(profile.orgSlug, profile);
}

export function getCouncilTenantProfile(orgSlug: string): CouncilTenantProfile {
  return _tenantProfiles.get(orgSlug) ?? { orgSlug, ...DEFAULT_PROFILE };
}

export function shouldEscalate(orgSlug: string, agreementScore: number): boolean {
  const profile = getCouncilTenantProfile(orgSlug);
  return agreementScore < profile.escalationThreshold;
}

export function getPreferredPerspectives(orgSlug: string): CouncilPerspective[] {
  return getCouncilTenantProfile(orgSlug).preferredPerspectives;
}

export function getRiskToleranceMultiplier(orgSlug: string): number {
  const tolerance = getCouncilTenantProfile(orgSlug).riskTolerance;
  return tolerance === "HIGH" ? 1.2 : tolerance === "LOW" ? 0.8 : 1.0;
}
