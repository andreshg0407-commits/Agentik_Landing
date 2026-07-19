/**
 * lib/copilot/intelligence/reasoning/executive-impact.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Executive Impact Engine
 *
 * Classifies the executive-level impact of insights and conclusions.
 * Impact levels: LOW | MEDIUM | HIGH | CRITICAL
 *
 * Classification rules are deterministic and based on:
 *   - Insight type (RISK vs OPPORTUNITY vs TREND)
 *   - Confidence score
 *   - Number of affected domains
 *   - Presence of financial signals
 *   - Contradiction severity
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningInsight,
  ReasoningHypothesis,
  ContradictionRecord,
  ExecutiveImpactLevel,
  ReasoningEvidence,
} from "./reasoning-types";
import { EXECUTIVE_IMPACT_RANK } from "./reasoning-types";

// ── Impact classification rules ────────────────────────────────────────────────

/**
 * classifyInsightImpact — determine the executive impact of a single insight.
 *
 * Rules (in priority order):
 *   1. Financial risk + HIGH confidence → CRITICAL
 *   2. Multi-domain systemic risk → CRITICAL
 *   3. RISK type + HIGH confidence → HIGH
 *   4. CAUSAL type + multi-domain → HIGH
 *   5. RISK type + MEDIUM confidence → MEDIUM
 *   6. TREND or ANOMALY type → MEDIUM or LOW based on confidence
 *   7. OPPORTUNITY type → MEDIUM (actionable) or LOW
 *   8. Everything else → LOW
 */
export function classifyInsightImpact(
  insight:  ReasoningInsight,
): ExecutiveImpactLevel {
  const { type, category, confidenceScore, domains } = insight;
  const isMultiDomain  = domains.length >= 2;
  const isHighConf     = confidenceScore >= 75;
  const isMediumConf   = confidenceScore >= 40;
  const isFinancial    = domains.includes("FINANCIAL");
  const isCollections  = domains.includes("COLLECTIONS");

  // CRITICAL rules
  if (type === "RISK" && isFinancial && isHighConf)        return "CRITICAL";
  if (type === "RISK" && isMultiDomain && domains.length >= 3) return "CRITICAL";
  if (type === "CAUSAL" && isFinancial && isHighConf)      return "CRITICAL";

  // HIGH rules
  if (type === "RISK"        && isHighConf)      return "HIGH";
  if (type === "CAUSAL"      && isMultiDomain)   return "HIGH";
  if (type === "CORRELATION" && isHighConf && isMultiDomain) return "HIGH";
  if (type === "RISK"        && isCollections && isMediumConf) return "HIGH";

  // MEDIUM rules
  if (type === "RISK"        && isMediumConf)    return "MEDIUM";
  if (type === "CAUSAL"      && isMediumConf)    return "MEDIUM";
  if (type === "TREND"       && isHighConf)      return "MEDIUM";
  if (type === "ANOMALY"     && isMediumConf)    return "MEDIUM";
  if (type === "OPPORTUNITY" && isHighConf)      return "MEDIUM";
  if (type === "CORRELATION" && isMediumConf)    return "MEDIUM";

  return "LOW";
}

// ── classifyConclusionImpact ───────────────────────────────────────────────────

/**
 * classifyConclusionImpact — determine the overall executive impact
 * of a full reasoning conclusion.
 *
 * Takes the maximum impact across all insights, then adjusts:
 *   - If multiple HIGH or CRITICAL insights exist → escalate
 *   - If severe contradictions exist → flag uncertainty
 */
export function classifyConclusionImpact(
  insights:        ReasoningInsight[],
  hypotheses:      ReasoningHypothesis[],
  contradictions:  ContradictionRecord[],
): ExecutiveImpactLevel {
  if (insights.length === 0) return "LOW";

  // Get the maximum impact from all insights
  let maxImpact: ExecutiveImpactLevel = "LOW";
  for (const insight of insights) {
    const impact = classifyInsightImpact(insight);
    if (EXECUTIVE_IMPACT_RANK[impact] > EXECUTIVE_IMPACT_RANK[maxImpact]) {
      maxImpact = impact;
    }
  }

  // Escalation: multiple HIGH/CRITICAL insights → push toward CRITICAL
  const highOrCritical = insights.filter(
    i => EXECUTIVE_IMPACT_RANK[classifyInsightImpact(i)] >= EXECUTIVE_IMPACT_RANK["HIGH"],
  );
  if (highOrCritical.length >= 3 && maxImpact === "HIGH") {
    maxImpact = "CRITICAL";
  }

  // Systemic hypothesis + high confidence → push to CRITICAL
  const systemicHyp = hypotheses.find(h => h.patternKey === "SYSTEMIC_BUSINESS_PRESSURE");
  if (systemicHyp && systemicHyp.confidenceScore >= 75 && maxImpact !== "CRITICAL") {
    maxImpact = "CRITICAL";
  }

  // Severe contradictions reduce impact by one level (uncertainty)
  const severeContradict = contradictions.filter(c => c.severity === "SEVERE" && c.resolution === "UNRESOLVED");
  if (severeContradict.length > 0 && maxImpact === "CRITICAL") {
    maxImpact = "HIGH";  // can't call it CRITICAL with unresolved contradictions
  }

  return maxImpact;
}

// ── getImpactSummary ───────────────────────────────────────────────────────────

export interface ExecutiveImpactSummary {
  overall:          ExecutiveImpactLevel;
  criticalCount:    number;
  highCount:        number;
  mediumCount:      number;
  lowCount:         number;
  requiresAttention: boolean;
  summaryText:      string;
}

/**
 * getImpactSummary — full executive impact breakdown.
 */
export function getImpactSummary(
  insights:       ReasoningInsight[],
  hypotheses:     ReasoningHypothesis[],
  contradictions: ContradictionRecord[],
): ExecutiveImpactSummary {
  const overall = classifyConclusionImpact(insights, hypotheses, contradictions);

  const classified = insights.map(i => classifyInsightImpact(i));
  const criticalCount = classified.filter(l => l === "CRITICAL").length;
  const highCount     = classified.filter(l => l === "HIGH").length;
  const mediumCount   = classified.filter(l => l === "MEDIUM").length;
  const lowCount      = classified.filter(l => l === "LOW").length;

  const requiresAttention = overall === "CRITICAL" || overall === "HIGH";

  const summaryText = _buildSummaryText(overall, criticalCount, highCount, insights);

  return {
    overall,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    requiresAttention,
    summaryText,
  };
}

// ── filterByMinImpact ──────────────────────────────────────────────────────────

/**
 * filterInsightsByMinImpact — return only insights at or above the threshold.
 */
export function filterInsightsByMinImpact(
  insights:   ReasoningInsight[],
  minImpact:  ExecutiveImpactLevel,
): ReasoningInsight[] {
  return insights.filter(
    i => EXECUTIVE_IMPACT_RANK[classifyInsightImpact(i)] >= EXECUTIVE_IMPACT_RANK[minImpact],
  );
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _buildSummaryText(
  overall:       ExecutiveImpactLevel,
  criticalCount: number,
  highCount:     number,
  insights:      ReasoningInsight[],
): string {
  if (insights.length === 0) return "Sin insights ejecutivos generados.";

  switch (overall) {
    case "CRITICAL":
      return `CRÍTICO — ${criticalCount} situación(es) que requieren atención inmediata. ${insights.length} insight(s) generado(s).`;
    case "HIGH":
      return `ALTO — ${highCount + criticalCount} situación(es) de alta prioridad. ${insights.length} insight(s) generado(s).`;
    case "MEDIUM":
      return `MEDIO — ${insights.length} insight(s) relevante(s) que vale la pena monitorear.`;
    case "LOW":
    default:
      return `BAJO — ${insights.length} insight(s) informativo(s).`;
  }
}
