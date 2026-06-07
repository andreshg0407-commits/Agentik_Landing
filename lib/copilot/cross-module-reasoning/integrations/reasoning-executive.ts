/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-executive.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Executive Adapter — formats reasoning output for the Executive module surface.
 * No DB. No server-only.
 */

import type {
  ReasoningResult,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningRecommendation,
  ReasoningChain,
} from "../cross-module-types";

// ── Executive surface payload ─────────────────────────────────────────────────

export interface ExecutiveReasoningPayload {
  orgSlug:       string;
  available:     boolean;
  status:        string;
  confidence:    ExecutiveConfidenceSummary;
  alertSummary:  ExecutiveAlertSummary;
  opportunities: ExecutiveOpportunitySummary[];
  actions:       ExecutiveActionItem[];
  narrative:     string | null;
  computedAt:    string;
}

export interface ExecutiveConfidenceSummary {
  level:         string;
  score:         number;
  evidenceCount: number;
  signalCount:   number;
}

export interface ExecutiveAlertSummary {
  criticalCount: number;
  highCount:     number;
  topRisk:       string | null;
  domains:       string[];
}

export interface ExecutiveOpportunitySummary {
  id:          string;
  title:       string;
  description: string;
  urgency:     string;
  type:        string;
  potential:   number;
}

export interface ExecutiveActionItem {
  id:          string;
  title:       string;
  description: string;
  priority:    string;
  type:        string;
}

// ── Build executive payload from reasoning result ─────────────────────────────

export function buildExecutiveReasoningPayload(
  result: ReasoningResult,
): ExecutiveReasoningPayload {
  if (result.status === "ERROR") {
    return _buildEmptyPayload(result.orgSlug, result.status);
  }

  const chain  = result.chain;
  const scoped = _scopeChain(chain, result.orgSlug);

  const confidence: ExecutiveConfidenceSummary = {
    level:         result.confidence.level,
    score:         result.confidence.score,
    evidenceCount: chain.evidence.filter(e => e.orgSlug === result.orgSlug).length,
    signalCount:   chain.signals.filter(s => s.orgSlug === result.orgSlug).length,
  };

  const alertSummary = _buildAlertSummary(scoped.risks);
  const opportunities = scoped.opportunities.slice(0, 5).map(_toOpportunitySummary);
  const actions = scoped.recommendations.slice(0, 8).map(_toActionItem);

  // Use top-level result.narrative (not chain.conclusions.narrative which doesn't exist)
  const narrative = result.narrative || null;

  return {
    orgSlug:       result.orgSlug,
    available:     true,
    status:        result.status,
    confidence,
    alertSummary,
    opportunities,
    actions,
    narrative,
    computedAt:    result.completedAt,
  };
}

function _buildEmptyPayload(orgSlug: string, status: string): ExecutiveReasoningPayload {
  return {
    orgSlug,
    available:     false,
    status,
    confidence:    { level: "LOW", score: 0, evidenceCount: 0, signalCount: 0 },
    alertSummary:  { criticalCount: 0, highCount: 0, topRisk: null, domains: [] },
    opportunities: [],
    actions:       [],
    narrative:     null,
    computedAt:    new Date().toISOString(),
  };
}

function _scopeChain(chain: ReasoningChain, orgSlug: string) {
  return {
    risks:           chain.risks.filter(r => r.orgSlug === orgSlug),
    opportunities:   chain.opportunities.filter(o => o.orgSlug === orgSlug),
    recommendations: chain.recommendations.filter(r => r.orgSlug === orgSlug),
  };
}

function _buildAlertSummary(risks: ReasoningRisk[]): ExecutiveAlertSummary {
  const sorted = [...risks].sort((a, b) => _sevRank(b.severity) - _sevRank(a.severity));
  return {
    criticalCount: risks.filter(r => r.severity === "CRITICAL").length,
    highCount:     risks.filter(r => r.severity === "HIGH").length,
    topRisk:       sorted[0]?.title ?? null,
    domains:       [...new Set(risks.map(r => r.domain))],
  };
}

function _toOpportunitySummary(opp: ReasoningOpportunity): ExecutiveOpportunitySummary {
  return {
    id:          opp.id,
    title:       opp.title,
    description: opp.description,
    urgency:     opp.urgency,
    type:        opp.type,
    potential:   opp.potential,
  };
}

function _toActionItem(rec: ReasoningRecommendation): ExecutiveActionItem {
  return {
    id:          rec.id,
    title:       rec.title,
    description: rec.description,
    priority:    rec.priority,
    type:        rec.type,
  };
}

function _sevRank(s: string): number {
  const ranks: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return ranks[s] ?? 0;
}
