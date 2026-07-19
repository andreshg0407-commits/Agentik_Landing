// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 18 — Tenant Profile Integration

import type { ExecutiveBriefing, ExecutiveDigest, ExecutiveDomain } from "../executive-brain-types";

export interface ExecutiveTenantProfile {
  readonly orgSlug: string;
  readonly riskTolerance: "LOW" | "MEDIUM" | "HIGH";
  readonly decisionStyle: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  readonly primaryDomains: ExecutiveDomain[];
  readonly executiveFocusPreference: "RISKS" | "OPPORTUNITIES" | "BALANCED";
  readonly briefingVerbosity: "CONCISE" | "STANDARD" | "DETAILED";
  readonly confidenceMultiplier: number; // 0.5–1.5
}

const DEFAULT_EXECUTIVE_PROFILE: Omit<ExecutiveTenantProfile, "orgSlug"> = {
  riskTolerance: "MEDIUM",
  decisionStyle: "BALANCED",
  primaryDomains: ["FINANCE", "COMMERCIAL", "OPERATIONS"],
  executiveFocusPreference: "BALANCED",
  briefingVerbosity: "STANDARD",
  confidenceMultiplier: 1.0,
};

// In-memory tenant registry — no DB
const EXECUTIVE_TENANT_REGISTRY: Record<string, ExecutiveTenantProfile> = {
  castillitos: {
    orgSlug: "castillitos",
    riskTolerance: "MEDIUM",
    decisionStyle: "BALANCED",
    primaryDomains: ["FINANCE", "COMMERCIAL", "OPERATIONS", "COMPLIANCE"],
    executiveFocusPreference: "RISKS",
    briefingVerbosity: "STANDARD",
    confidenceMultiplier: 1.0,
  },
};

export function getExecutiveTenantProfile(orgSlug: string): ExecutiveTenantProfile {
  return EXECUTIVE_TENANT_REGISTRY[orgSlug] ?? { orgSlug, ...DEFAULT_EXECUTIVE_PROFILE };
}

export function alignBriefingToTenant(
  briefing: ExecutiveBriefing,
  profile: ExecutiveTenantProfile
): ExecutiveBriefing {
  // Filter to primary domains if not CEO briefing
  if (briefing.type === "CEO") return briefing;

  const scoped = profile.primaryDomains;
  const filteredPriorities = briefing.priorities.filter(
    (p) => scoped.includes(p.domain) || p.domain === "CROSS_DOMAIN"
  );
  const filteredConcerns = briefing.concerns.filter(
    (c) => scoped.includes(c.domain) || c.domain === "CROSS_DOMAIN"
  );

  return {
    ...briefing,
    priorities: filteredPriorities,
    concerns: filteredConcerns,
    metadata: { ...briefing.metadata, tenantAligned: true, primaryDomains: scoped },
  };
}

export function alignDigestToTenant(
  digest: ExecutiveDigest,
  profile: ExecutiveTenantProfile
): ExecutiveDigest {
  const scoped = profile.primaryDomains;

  const topPriorities = digest.topPriorities.filter(
    (p) => scoped.includes(p.domain) || p.domain === "CROSS_DOMAIN"
  );
  const topRisks = profile.executiveFocusPreference === "OPPORTUNITIES"
    ? digest.topRisks.slice(0, 2)
    : digest.topRisks;

  return {
    ...digest,
    topPriorities,
    topRisks,
    metadata: { ...digest.metadata, tenantAligned: true },
  };
}

export function applyConfidenceMultiplier(score: number, profile: ExecutiveTenantProfile): number {
  const adjusted = score * profile.confidenceMultiplier;
  return Math.round(Math.min(Math.max(adjusted, 0), 1) * 100) / 100;
}

export function getExecutiveTenantConfidenceMultiplier(orgSlug: string): number {
  return getExecutiveTenantProfile(orgSlug).confidenceMultiplier;
}
