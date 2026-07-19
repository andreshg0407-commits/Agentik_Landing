/**
 * lib/copilot/cross-module-reasoning/cross-module-dashboard-contract.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Dashboard Contract — Pure domain, no server deps.
 */

import type {
  ReasoningResult,
  ReasoningConfidence,
  ReasoningChain,
} from "./cross-module-types";

// ── Payload types ─────────────────────────────────────────────────────────────

export interface ConfidenceDistribution {
  LOW:       number;
  MEDIUM:    number;
  HIGH:      number;
  VERY_HIGH: number;
}

export interface CrossModuleDashboardPayload {
  orgSlug:              string;
  reasoningRuns:        number;
  successfulRuns:       number;
  partialRuns:          number;
  totalHypotheses:      number;
  supportedHypotheses:  number;
  totalRisks:           number;
  criticalRisks:        number;
  totalOpportunities:   number;
  highUrgencyOpp:       number;
  totalRecommendations: number;
  urgentRecommendations: number;
  avgConfidenceScore:   number;
  confidenceDistribution: ConfidenceDistribution;
  topDomains:           string[];
  lastRunAt:            string | null;
  computedAt:           string;
}

// ── Build dashboard from results ──────────────────────────────────────────────

export function buildCrossModuleDashboard(
  orgSlug: string,
  results: ReasoningResult[],
): CrossModuleDashboardPayload {
  const scoped = results.filter(r => r.orgSlug === orgSlug);

  if (scoped.length === 0) {
    return buildEmptyCrossModuleDashboard(orgSlug);
  }

  const successful = scoped.filter(r => r.status === "SUCCESS").length;
  const partial    = scoped.filter(r => r.status === "PARTIAL").length;

  const allChains  = scoped.map(r => r.chain);
  const hypStats   = _aggregateHypotheses(orgSlug, allChains);
  const riskStats  = _aggregateRisks(orgSlug, allChains);
  const oppStats   = _aggregateOpportunities(orgSlug, allChains);
  const recStats   = _aggregateRecommendations(orgSlug, allChains);

  const avgConfidence = scoped.reduce((s, r) => s + r.confidence.score, 0) / scoped.length;
  const confidenceDist = _buildConfidenceDistribution(scoped);

  const lastRunAt = scoped.length > 0
    ? scoped.sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0].completedAt
    : null;

  const topDomains = _computeTopDomains(orgSlug, allChains);

  return {
    orgSlug,
    reasoningRuns:         scoped.length,
    successfulRuns:        successful,
    partialRuns:           partial,
    totalHypotheses:       hypStats.total,
    supportedHypotheses:   hypStats.supported,
    totalRisks:            riskStats.total,
    criticalRisks:         riskStats.critical,
    totalOpportunities:    oppStats.total,
    highUrgencyOpp:        oppStats.highUrgency,
    totalRecommendations:  recStats.total,
    urgentRecommendations: recStats.urgent,
    avgConfidenceScore:    avgConfidence,
    confidenceDistribution: confidenceDist,
    topDomains,
    lastRunAt,
    computedAt:            new Date().toISOString(),
  };
}

export function buildEmptyCrossModuleDashboard(
  orgSlug: string,
): CrossModuleDashboardPayload {
  return {
    orgSlug,
    reasoningRuns:         0,
    successfulRuns:        0,
    partialRuns:           0,
    totalHypotheses:       0,
    supportedHypotheses:   0,
    totalRisks:            0,
    criticalRisks:         0,
    totalOpportunities:    0,
    highUrgencyOpp:        0,
    totalRecommendations:  0,
    urgentRecommendations: 0,
    avgConfidenceScore:    0,
    confidenceDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 },
    topDomains:            [],
    lastRunAt:             null,
    computedAt:            new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _aggregateHypotheses(orgSlug: string, chains: ReasoningChain[]) {
  let total = 0;
  let supported = 0;
  for (const chain of chains) {
    const scoped = chain.hypotheses.filter(h => h.orgSlug === orgSlug);
    total += scoped.length;
    supported += scoped.filter(h => h.supported && !h.contradicted).length;
  }
  return { total, supported };
}

function _aggregateRisks(orgSlug: string, chains: ReasoningChain[]) {
  let total = 0;
  let critical = 0;
  for (const chain of chains) {
    const scoped = chain.risks.filter(r => r.orgSlug === orgSlug);
    total += scoped.length;
    critical += scoped.filter(r => r.severity === "CRITICAL" || r.severity === "HIGH").length;
  }
  return { total, critical };
}

function _aggregateOpportunities(orgSlug: string, chains: ReasoningChain[]) {
  let total = 0;
  let highUrgency = 0;
  for (const chain of chains) {
    const scoped = chain.opportunities.filter(o => o.orgSlug === orgSlug);
    total += scoped.length;
    highUrgency += scoped.filter(o => o.urgency === "HIGH").length;
  }
  return { total, highUrgency };
}

function _aggregateRecommendations(orgSlug: string, chains: ReasoningChain[]) {
  let total = 0;
  let urgent = 0;
  for (const chain of chains) {
    const scoped = chain.recommendations.filter(r => r.orgSlug === orgSlug);
    total += scoped.length;
    urgent += scoped.filter(r => r.priority === "URGENT" || r.priority === "HIGH").length;
  }
  return { total, urgent };
}

function _buildConfidenceDistribution(
  results: ReasoningResult[],
): ConfidenceDistribution {
  const dist: ConfidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 };
  for (const r of results) {
    const level = r.confidence.level as ReasoningConfidence;
    dist[level] = (dist[level] ?? 0) + 1;
  }
  return dist;
}

function _computeTopDomains(orgSlug: string, chains: ReasoningChain[]): string[] {
  const domainCount = new Map<string, number>();
  for (const chain of chains) {
    for (const signal of chain.signals.filter(s => s.orgSlug === orgSlug)) {
      domainCount.set(signal.domain, (domainCount.get(signal.domain) ?? 0) + 1);
    }
  }
  return [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain]) => domain);
}
