// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 20: Tenant Profile Integration

import type { StrategicAdvisorBriefing, StrategicAdvisorDigest, StrategicAdviceConfidence } from "../strategic-advisor-types";

export interface StrategicAdvisorTenantProfile {
  readonly orgSlug:             string;
  readonly riskTolerance:       "LOW" | "MEDIUM" | "HIGH";
  readonly decisionStyle:       "CAUTIOUS" | "BALANCED" | "AGGRESSIVE";
  readonly preferredDomains:    string[];
  readonly confidenceMultiplier: number;    // 0.8–1.2
  readonly advisorPersonality:  "CONSERVATIVE" | "BALANCED" | "PROACTIVE";
}

const TENANT_PROFILES: Record<string, StrategicAdvisorTenantProfile> = {
  castillitos: {
    orgSlug:             "castillitos",
    riskTolerance:       "MEDIUM",
    decisionStyle:       "BALANCED",
    preferredDomains:    ["FINANCE", "COMMERCIAL", "OPERATIONS"],
    confidenceMultiplier: 1.0,
    advisorPersonality:  "BALANCED",
  },
};

const DEFAULT_PROFILE: StrategicAdvisorTenantProfile = {
  orgSlug:             "default",
  riskTolerance:       "MEDIUM",
  decisionStyle:       "BALANCED",
  preferredDomains:    [],
  confidenceMultiplier: 1.0,
  advisorPersonality:  "BALANCED",
};

export function getAdvisorTenantProfile(orgSlug: string): StrategicAdvisorTenantProfile {
  return TENANT_PROFILES[orgSlug] ?? { ...DEFAULT_PROFILE, orgSlug };
}

export function alignBriefingToTenant(
  briefing: StrategicAdvisorBriefing,
  profile: StrategicAdvisorTenantProfile
): StrategicAdvisorBriefing {
  if (profile.advisorPersonality === "CONSERVATIVE") {
    // Filter to preferred domains
    const preferred = new Set(profile.preferredDomains);
    return {
      ...briefing,
      topConcerns:        briefing.topConcerns.filter((c) => preferred.has(c.domain) || c.severity === "CRITICAL"),
      topRecommendations: briefing.topRecommendations.filter((r) => preferred.has(r.domain) || r.priority === "CRITICAL"),
    };
  }
  return briefing;
}

export function alignDigestToTenant(
  digest: StrategicAdvisorDigest,
  profile: StrategicAdvisorTenantProfile
): StrategicAdvisorDigest {
  return digest; // Pass-through for now; future: filter/reorder by tenant preferences
}

export function applyAdvisorConfidenceMultiplier(
  score: number,
  profile: StrategicAdvisorTenantProfile
): number {
  return Math.min(1, Math.max(0, score * profile.confidenceMultiplier));
}
