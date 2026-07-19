// AGENTIK-STRATEGIC-PLANNING-01 — Phase 20: Tenant Profile Integration

import type { StrategicDomain, PlanningPriority } from "../strategic-planning-types";

export interface TenantStrategyProfile {
  readonly orgSlug:          string;
  readonly primaryDomains:   StrategicDomain[];
  readonly riskTolerance:    "LOW" | "MEDIUM" | "HIGH";
  readonly growthPriority:   PlanningPriority;
  readonly complianceLevel:  "BASIC" | "STANDARD" | "STRICT";
  readonly planningHorizon:  "QUARTERLY" | "ANNUAL" | "THREE_YEAR";
  readonly metadata:         Record<string, unknown>;
}

const DEFAULT_TENANT_PROFILE: Omit<TenantStrategyProfile, "orgSlug"> = {
  primaryDomains:  ["OPERATIONS", "FINANCE", "COMMERCIAL"],
  riskTolerance:   "MEDIUM",
  growthPriority:  "HIGH",
  complianceLevel: "STANDARD",
  planningHorizon: "ANNUAL",
  metadata:        {},
};

const _registry = new Map<string, TenantStrategyProfile>();

export function registerTenantStrategyProfile(profile: TenantStrategyProfile): void {
  _registry.set(profile.orgSlug, profile);
}

export function getTenantStrategyProfile(orgSlug: string): TenantStrategyProfile {
  return _registry.get(orgSlug) ?? { orgSlug, ...DEFAULT_TENANT_PROFILE };
}

export function alignPlanWithTenantProfile(
  orgSlug:     string,
  planDomains: StrategicDomain[]
): {
  alignedDomains:     StrategicDomain[];
  unalignedDomains:   StrategicDomain[];
  alignmentScore:     number;
} {
  const profile  = getTenantStrategyProfile(orgSlug);
  const aligned  = planDomains.filter((d) => profile.primaryDomains.includes(d));
  const unaligned = planDomains.filter((d) => !profile.primaryDomains.includes(d));
  const score = planDomains.length === 0 ? 0
    : Math.round(aligned.length / planDomains.length * 100) / 100;
  return { alignedDomains: aligned, unalignedDomains: unaligned, alignmentScore: score };
}

export function getRiskToleranceBoost(orgSlug: string): number {
  const profile = getTenantStrategyProfile(orgSlug);
  if (profile.riskTolerance === "HIGH")   return 0.05;
  if (profile.riskTolerance === "MEDIUM") return 0.02;
  return 0.00;
}

export function isWithinPlanningHorizon(
  orgSlug: string,
  horizon: "SHORT" | "MEDIUM" | "LONG"
): boolean {
  const profile = getTenantStrategyProfile(orgSlug);
  if (profile.planningHorizon === "QUARTERLY") return horizon === "SHORT";
  if (profile.planningHorizon === "ANNUAL")    return horizon === "SHORT" || horizon === "MEDIUM";
  return true;
}
