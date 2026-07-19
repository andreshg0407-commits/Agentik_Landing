// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 28: Dashboard Contract

import type { StrategicConcern, StrategicOpportunityAssessment, StrategicRecommendation, StrategicFocusArea, StrategicAdvisorReport } from "./strategic-advisor-types";

export interface StrategicAdvisorDashboardMetrics {
  readonly advisorScore:       number;
  readonly alignmentScore:     number;
  readonly concernCount:       number;
  readonly criticalConcernCount: number;
  readonly opportunityCount:   number;
  readonly recommendationCount: number;
  readonly questionCount:      number;
  readonly focusAreaCount:     number;
  readonly executiveCoverage:  number;  // 0–1 fraction of domains with data
}

export interface StrategicConcernRow {
  readonly id:      string;
  readonly title:   string;
  readonly domain:  string;
  readonly severity: string;
  readonly confidence: string;
  readonly isEmergent: boolean;
}

export interface StrategicOpportunityRow {
  readonly id:          string;
  readonly title:       string;
  readonly domain:      string;
  readonly magnitude:   string;
  readonly captureScore: number;
  readonly isIgnored:   boolean;
}

export interface StrategicRecommendationRow {
  readonly id:       string;
  readonly title:    string;
  readonly domain:   string;
  readonly priority: string;
  readonly confidence: string;
}

export interface StrategicFocusAreaRow {
  readonly id:             string;
  readonly rank:           number;
  readonly title:          string;
  readonly domain:         string;
  readonly compositeScore: number;
}

export interface StrategicAdvisorDashboardContract {
  readonly orgSlug:         string;
  readonly metrics:         StrategicAdvisorDashboardMetrics;
  readonly topConcerns:     StrategicConcernRow[];
  readonly topOpportunities: StrategicOpportunityRow[];
  readonly topRecommendations: StrategicRecommendationRow[];
  readonly topFocusAreas:   StrategicFocusAreaRow[];
  readonly generatedAt:     string;
}

export function buildStrategicDashboardContract(report: StrategicAdvisorReport): StrategicAdvisorDashboardContract {
  const domainSet = new Set([
    ...report.concerns.map((c) => c.domain),
    ...report.opportunities.map((o) => o.domain),
  ]);

  const metrics: StrategicAdvisorDashboardMetrics = {
    advisorScore:         report.advisorScore,
    alignmentScore:       report.alignmentScore,
    concernCount:         report.concerns.length,
    criticalConcernCount: report.concerns.filter((c) => c.severity === "CRITICAL").length,
    opportunityCount:     report.opportunities.length,
    recommendationCount:  report.recommendations.length,
    questionCount:        report.questions.length,
    focusAreaCount:       report.focusAreas.length,
    executiveCoverage:    Math.min(domainSet.size / 5, 1),
  };

  return {
    orgSlug:      report.orgSlug,
    metrics,
    topConcerns:  report.concerns.slice(0, 5).map((c) => ({
      id: c.id, title: c.title, domain: c.domain, severity: c.severity, confidence: c.confidence, isEmergent: c.isEmergent,
    })),
    topOpportunities: report.opportunities.slice(0, 5).map((o) => ({
      id: o.id, title: o.title, domain: o.domain, magnitude: o.magnitude, captureScore: o.captureScore, isIgnored: o.isIgnored,
    })),
    topRecommendations: report.recommendations.slice(0, 5).map((r) => ({
      id: r.id, title: r.title, domain: r.domain, priority: r.priority, confidence: r.confidence,
    })),
    topFocusAreas: report.focusAreas.slice(0, 5).map((f) => ({
      id: f.id, rank: f.rank, title: f.title, domain: f.domain, compositeScore: f.compositeScore,
    })),
    generatedAt: report.generatedAt,
  };
}

export function buildEmptyStrategicDashboard(orgSlug: string): StrategicAdvisorDashboardContract {
  return {
    orgSlug,
    metrics: { advisorScore: 0, alignmentScore: 0, concernCount: 0, criticalConcernCount: 0, opportunityCount: 0, recommendationCount: 0, questionCount: 0, focusAreaCount: 0, executiveCoverage: 0 },
    topConcerns: [], topOpportunities: [], topRecommendations: [], topFocusAreas: [],
    generatedAt: new Date().toISOString(),
  };
}
