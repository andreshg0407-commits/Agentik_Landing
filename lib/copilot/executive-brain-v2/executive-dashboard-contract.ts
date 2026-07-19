// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 27 — Executive Dashboard Contract
// Pure domain types for UI consumption — no server-only, no DB

import type {
  ExecutivePriorityLevel,
  ExecutiveDomain,
  ExecutiveDigestPeriod,
  ExecutiveConfidence,
} from "./executive-brain-types";

// ── Dashboard Metrics ─────────────────────────────────────────────────────────

export interface ExecutiveDashboardMetrics {
  readonly orgSlug: string;
  readonly executiveScore: number; // 0–1
  readonly executiveScoreTrend: "UP" | "DOWN" | "STABLE";
  readonly priorityCount: number;
  readonly criticalPriorityCount: number;
  readonly riskCount: number;
  readonly criticalRiskCount: number;
  readonly opportunityCount: number;
  readonly conflictCount: number;
  readonly strategicAlignmentScore: number; // 0–1
  readonly focusAreaCount: number;
  readonly confidence: ExecutiveConfidence;
  readonly computedAt: string;
}

export interface ExecutivePriorityRow {
  readonly id: string;
  readonly rank: number;
  readonly title: string;
  readonly domain: ExecutiveDomain;
  readonly level: ExecutivePriorityLevel;
  readonly priorityScore: number;
  readonly rationale: string;
  readonly computedAt: string;
}

export interface ExecutiveRiskRow {
  readonly id: string;
  readonly title: string;
  readonly domain: ExecutiveDomain;
  readonly level: string;
  readonly compositeRisk: number;
  readonly likelihood: number;
  readonly impact: number;
}

export interface ExecutiveOpportunityRow {
  readonly id: string;
  readonly title: string;
  readonly domain: ExecutiveDomain;
  readonly magnitude: string;
  readonly captureScore: number;
}

export interface ExecutiveFocusAreaRow {
  readonly id: string;
  readonly rank: number;
  readonly title: string;
  readonly domain: ExecutiveDomain;
  readonly compositeScore: number;
  readonly urgencyScore: number;
  readonly impactScore: number;
}

export interface ExecutiveConflictRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly domain: ExecutiveDomain;
  readonly severity: ExecutivePriorityLevel;
  readonly detectedAt: string;
}

export interface ExecutiveDashboardContract {
  readonly orgSlug: string;
  readonly metrics: ExecutiveDashboardMetrics;
  readonly topPriorities: ExecutivePriorityRow[];
  readonly topRisks: ExecutiveRiskRow[];
  readonly topOpportunities: ExecutiveOpportunityRow[];
  readonly focusAreas: ExecutiveFocusAreaRow[];
  readonly conflicts: ExecutiveConflictRow[];
  readonly digestPeriod: ExecutiveDigestPeriod;
  readonly headline: string;
  readonly generatedAt: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildExecutiveDashboardContract(
  orgSlug: string,
  metrics: ExecutiveDashboardMetrics,
  options: {
    topPriorities?: ExecutivePriorityRow[];
    topRisks?: ExecutiveRiskRow[];
    topOpportunities?: ExecutiveOpportunityRow[];
    focusAreas?: ExecutiveFocusAreaRow[];
    conflicts?: ExecutiveConflictRow[];
    digestPeriod?: ExecutiveDigestPeriod;
    headline?: string;
  } = {}
): ExecutiveDashboardContract {
  return {
    orgSlug,
    metrics,
    topPriorities: options.topPriorities ?? [],
    topRisks: options.topRisks ?? [],
    topOpportunities: options.topOpportunities ?? [],
    focusAreas: options.focusAreas ?? [],
    conflicts: options.conflicts ?? [],
    digestPeriod: options.digestPeriod ?? "DAILY",
    headline: options.headline ?? `Score ejecutivo: ${Math.round(metrics.executiveScore * 100)}%`,
    generatedAt: new Date().toISOString(),
  };
}

export function buildEmptyDashboardContract(orgSlug: string): ExecutiveDashboardContract {
  return buildExecutiveDashboardContract(orgSlug, {
    orgSlug,
    executiveScore: 0,
    executiveScoreTrend: "STABLE",
    priorityCount: 0,
    criticalPriorityCount: 0,
    riskCount: 0,
    criticalRiskCount: 0,
    opportunityCount: 0,
    conflictCount: 0,
    strategicAlignmentScore: 0,
    focusAreaCount: 0,
    confidence: "LOW",
    computedAt: new Date().toISOString(),
  });
}
