// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning dashboard contract — pure domain payload (no server-only)

import type {
  LearningPattern,
  LearningOutcome,
  LearningAdjustment,
  LearningResult,
  TenantLearningProfile,
  AgentLearningProfile,
  LearningDomain,
} from "./learning-types";

export interface LearningDomainSummary {
  readonly domain: LearningDomain;
  readonly activePatterns: number;
  readonly totalEvents: number;
  readonly successRate: number; // 0–1
  readonly confidenceScore: number; // 0–1
}

export interface LearningDashboardPayload {
  readonly orgSlug: string;
  readonly tenantProfile: TenantLearningProfile;
  readonly agentProfiles: AgentLearningProfile[];
  readonly domainSummaries: LearningDomainSummary[];
  readonly topPatterns: LearningPattern[];
  readonly recentOutcomes: LearningOutcome[];
  readonly pendingAdjustments: LearningAdjustment[];
  readonly latestResult: LearningResult | null;
  readonly overallConfidence: number; // 0–1
  readonly totalEvents: number;
  readonly totalPatterns: number;
  readonly generatedAt: string; // ISO8601
}

export function buildLearningDashboard(
  orgSlug: string,
  tenantProfile: TenantLearningProfile,
  agentProfiles: AgentLearningProfile[],
  patterns: LearningPattern[],
  outcomes: LearningOutcome[],
  adjustments: LearningAdjustment[],
  latestResult: LearningResult | null
): LearningDashboardPayload {
  const activePatterns = patterns.filter(
    (p) => p.status === "ACTIVE" || p.status === "REINFORCED"
  );

  const topPatterns = [...activePatterns]
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 10);

  const pendingAdjustments = adjustments.filter((a) => !a.applied);

  // Build domain summaries
  const domainSet = new Set<LearningDomain>(
    [...patterns.map((p) => p.domain), ...outcomes.map((o) => o.domain)] as LearningDomain[]
  );

  const domainSummaries: LearningDomainSummary[] = Array.from(domainSet).map((domain) => {
    const domainPatterns = activePatterns.filter((p) => p.domain === domain);
    const domainOutcomes = outcomes.filter((o) => o.domain === domain);
    const positiveOutcomes = domainOutcomes.filter((o) => o.result === "POSITIVE").length;
    const successRate = domainOutcomes.length > 0
      ? positiveOutcomes / domainOutcomes.length
      : 0;
    const confidenceScore = domainPatterns.length > 0
      ? domainPatterns.reduce((sum, p) => sum + p.confidenceScore, 0) / domainPatterns.length
      : 0;

    return {
      domain,
      activePatterns: domainPatterns.length,
      totalEvents: domainOutcomes.length,
      successRate,
      confidenceScore,
    };
  });

  const overallConfidence = activePatterns.length > 0
    ? activePatterns.reduce((sum, p) => sum + p.confidenceScore, 0) / activePatterns.length
    : 0;

  return {
    orgSlug,
    tenantProfile,
    agentProfiles,
    domainSummaries,
    topPatterns,
    recentOutcomes: outcomes.slice(0, 20),
    pendingAdjustments,
    latestResult,
    overallConfidence,
    totalEvents: tenantProfile.totalEvents,
    totalPatterns: patterns.length,
    generatedAt: new Date().toISOString(),
  };
}
