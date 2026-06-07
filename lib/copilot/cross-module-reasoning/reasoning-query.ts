/**
 * lib/copilot/cross-module-reasoning/reasoning-query.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Query Layer — Find reasoning results, hypotheses, recommendations, risks, opportunities.
 */

import type {
  ReasoningResult,
  ReasoningHypothesis,
  ReasoningRecommendation,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningChain,
  HypothesisCategory,
  RiskDomain,
  RiskSeverity,
  OpportunityType,
  RecommendationPriority,
} from "./cross-module-types";

// ── Find reasoning results ────────────────────────────────────────────────────

export function findReasoning(
  results: ReasoningResult[],
  orgSlug: string,
): ReasoningResult[] {
  return results.filter(r => r.orgSlug === orgSlug);
}

export function findReasoningById(
  results: ReasoningResult[],
  id: string,
): ReasoningResult | undefined {
  return results.find(r => r.id === id);
}

export function findSuccessfulReasoning(
  results: ReasoningResult[],
  orgSlug: string,
): ReasoningResult[] {
  return results.filter(r => r.orgSlug === orgSlug && r.status === "SUCCESS");
}

// ── Find hypotheses ───────────────────────────────────────────────────────────

export function findHypotheses(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningHypothesis[] {
  return chain.hypotheses.filter(h => h.orgSlug === orgSlug);
}

export function findSupportedHypotheses(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningHypothesis[] {
  return chain.hypotheses.filter(
    h => h.orgSlug === orgSlug && h.supported && !h.contradicted,
  );
}

export function findHypothesesByCategory(
  chain: ReasoningChain,
  orgSlug: string,
  category: HypothesisCategory,
): ReasoningHypothesis[] {
  return chain.hypotheses.filter(
    h => h.orgSlug === orgSlug && h.category === category,
  );
}

// ── Find recommendations ──────────────────────────────────────────────────────

export function findRecommendations(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningRecommendation[] {
  return chain.recommendations.filter(r => r.orgSlug === orgSlug);
}

export function findRecommendationsByPriority(
  chain: ReasoningChain,
  orgSlug: string,
  priority: RecommendationPriority,
): ReasoningRecommendation[] {
  return chain.recommendations.filter(
    r => r.orgSlug === orgSlug && r.priority === priority,
  );
}

export function findUrgentRecommendations(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningRecommendation[] {
  return chain.recommendations.filter(
    r => r.orgSlug === orgSlug && (r.priority === "URGENT" || r.priority === "HIGH"),
  );
}

// ── Find risks ────────────────────────────────────────────────────────────────

export function findRisks(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningRisk[] {
  return chain.risks.filter(r => r.orgSlug === orgSlug);
}

export function findRisksByDomain(
  chain: ReasoningChain,
  orgSlug: string,
  domain: RiskDomain,
): ReasoningRisk[] {
  return chain.risks.filter(
    r => r.orgSlug === orgSlug && r.domain === domain,
  );
}

export function findRisksBySeverity(
  chain: ReasoningChain,
  orgSlug: string,
  severity: RiskSeverity,
): ReasoningRisk[] {
  return chain.risks.filter(
    r => r.orgSlug === orgSlug && r.severity === severity,
  );
}

export function findCriticalRisks(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningRisk[] {
  return chain.risks.filter(
    r => r.orgSlug === orgSlug && (r.severity === "CRITICAL" || r.severity === "HIGH"),
  );
}

// ── Find opportunities ────────────────────────────────────────────────────────

export function findOpportunities(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningOpportunity[] {
  return chain.opportunities.filter(o => o.orgSlug === orgSlug);
}

export function findOpportunitiesByType(
  chain: ReasoningChain,
  orgSlug: string,
  type: OpportunityType,
): ReasoningOpportunity[] {
  return chain.opportunities.filter(
    o => o.orgSlug === orgSlug && o.type === type,
  );
}

export function findHighUrgencyOpportunities(
  chain: ReasoningChain,
  orgSlug: string,
): ReasoningOpportunity[] {
  return chain.opportunities.filter(
    o => o.orgSlug === orgSlug && o.urgency === "HIGH",
  );
}

// ── Chain statistics ──────────────────────────────────────────────────────────

export interface ChainQueryStats {
  orgSlug:             string;
  totalSignals:        number;
  totalEvidence:       number;
  supportedHypotheses: number;
  criticalRisks:       number;
  urgentRecs:          number;
  topOpportunities:    number;
}

export function queryChainStats(
  chain: ReasoningChain,
  orgSlug: string,
): ChainQueryStats {
  return {
    orgSlug,
    totalSignals:        chain.signals.filter(s => s.orgSlug === orgSlug).length,
    totalEvidence:       chain.evidence.filter(e => e.orgSlug === orgSlug).length,
    supportedHypotheses: findSupportedHypotheses(chain, orgSlug).length,
    criticalRisks:       findCriticalRisks(chain, orgSlug).length,
    urgentRecs:          findUrgentRecommendations(chain, orgSlug).length,
    topOpportunities:    findHighUrgencyOpportunities(chain, orgSlug).length,
  };
}
