// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Tenant Profile

import type { StrategicMemoryEntry } from "../strategic-memory-types";

// ── Tenant Profile Types ──────────────────────────────────────────────────────

export interface StrategicTenantProfile {
  readonly orgSlug: string;
  readonly strategicMaturity: "NASCENT" | "DEVELOPING" | "ESTABLISHED" | "ADVANCED";
  readonly primaryDomains: string[];
  readonly riskProfile: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  readonly activeGoalCount: number;
  readonly activeRiskCount: number;
  readonly avgStrategicScore: number;
  readonly lastUpdated: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function buildStrategicTenantProfile(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicTenantProfile {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");

  const goals = scoped.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const risks = scoped.filter((e) => e.type === "RISK");
  const critical = scoped.filter((e) => e.priority === "CRITICAL");

  const avgScore =
    scoped.length > 0
      ? scoped.reduce((s, e) => s + e.strategicScore, 0) / scoped.length
      : 0;

  // Domain frequency
  const domainCounts = new Map<string, number>();
  for (const e of scoped) {
    domainCounts.set(e.domain, (domainCounts.get(e.domain) ?? 0) + 1);
  }
  const primaryDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);

  const strategicMaturity: StrategicTenantProfile["strategicMaturity"] =
    scoped.length >= 50 ? "ADVANCED" :
    scoped.length >= 20 ? "ESTABLISHED" :
    scoped.length >= 5 ? "DEVELOPING" :
    "NASCENT";

  const riskProfile: StrategicTenantProfile["riskProfile"] =
    critical.length > 5 ? "CONSERVATIVE" :
    goals.length > risks.length * 2 ? "AGGRESSIVE" :
    "BALANCED";

  return {
    orgSlug,
    strategicMaturity,
    primaryDomains,
    riskProfile,
    activeGoalCount: goals.length,
    activeRiskCount: risks.length,
    avgStrategicScore: avgScore,
    lastUpdated: new Date().toISOString(),
  };
}

export function getTenantStrategicMaturityLabel(profile: StrategicTenantProfile): string {
  switch (profile.strategicMaturity) {
    case "NASCENT": return "Beginning to establish strategic memory";
    case "DEVELOPING": return "Building strategic knowledge base";
    case "ESTABLISHED": return "Mature strategic memory — well-structured";
    case "ADVANCED": return "Advanced strategic intelligence — full coverage";
  }
}

export function isStrategicProfileMature(profile: StrategicTenantProfile): boolean {
  return profile.strategicMaturity === "ESTABLISHED" || profile.strategicMaturity === "ADVANCED";
}

export function getTenantConfidenceMultiplier(profile: StrategicTenantProfile): number {
  switch (profile.strategicMaturity) {
    case "NASCENT": return 0.7;
    case "DEVELOPING": return 0.85;
    case "ESTABLISHED": return 1.0;
    case "ADVANCED": return 1.1;
  }
}

export function shouldEscalateToExecutive(
  profile: StrategicTenantProfile,
  entries: StrategicMemoryEntry[],
  orgSlug: string
): boolean {
  const critical = entries.filter(
    (e) => e.orgSlug === orgSlug && e.priority === "CRITICAL" && e.status === "ACTIVE"
  );
  return critical.length >= 2 || profile.riskProfile === "CONSERVATIVE";
}
