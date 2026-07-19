/**
 * lib/copilot/insights/insight-ranking.ts
 *
 * Agentik Copilot — Insight Ranking
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Deterministic ranking for CopilotInsight[].
 *
 * Composite score factors:
 *   1. Severity weight          (500 / 400 / 300 / 200 / 100)
 *   2. Confidence               (× 200 — higher confidence = stronger signal)
 *   3. Source priority          (signal +80 | domain +60 | action +40 | capability +30 | suggestion +10)
 *   4. Type urgency             (alert > risk > anomaly > trend > observation > opportunity > explanation > summary)
 *   5. Lead agent domain match  (+100 if domainId is in lead agent's primaryDomains)
 *   6. Suggestion linkage bonus (+20 per linked suggestion, max +60)
 *   7. Action linkage bonus     (+15 per linked action, max +45)
 *
 * Tie-break: alphabetical by insight id (stable).
 *
 * No I/O. No randomness. Fully deterministic.
 */

import type { CopilotInsight, InsightSeverity, InsightSource, InsightType } from "./insight-types";
import type { CopilotRuntimeContext } from "../runtime/context-builder";

// ── Weights ───────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<InsightSeverity, number> = {
  critical: 500,
  high:     400,
  medium:   300,
  low:      200,
  info:     100,
};

const SOURCE_BONUS: Record<InsightSource, number> = {
  signal:     80,
  domain:     60,
  action:     40,
  capability: 30,
  suggestion: 10,
};

const TYPE_URGENCY: Record<InsightType, number> = {
  alert:       70,
  risk:        60,
  anomaly:     50,
  trend:       40,
  observation: 30,
  opportunity: 25,
  explanation: 20,
  summary:     10,
};

const LEAD_DOMAIN_BONUS    = 100;
const MAX_SUGGESTION_BONUS = 60;
const SUGGESTION_BONUS     = 20;
const MAX_ACTION_BONUS     = 45;
const ACTION_BONUS         = 15;

// ── Ranker ────────────────────────────────────────────────────────────────────

/**
 * Returns a new array of insights sorted by composite rank (descending).
 * Updates the score field on each insight to reflect composite ranking.
 * Does not mutate the input array.
 */
export function rankInsights(
  insights: CopilotInsight[],
  ctx:      CopilotRuntimeContext,
): CopilotInsight[] {
  const primaryDomainSet = new Set(ctx.leadAgent?.primaryDomains ?? []);

  const scored = insights.map(insight => ({
    insight,
    compositeScore: computeScore(insight, primaryDomainSet),
  }));

  scored.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    return a.insight.id.localeCompare(b.insight.id);
  });

  return scored.map(s => ({
    ...s.insight,
    score: s.compositeScore,
  }));
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeScore(
  insight:          CopilotInsight,
  primaryDomainSet: Set<string>,
): number {
  let score = 0;

  // 1. Severity (dominant factor)
  score += SEVERITY_WEIGHT[insight.severity];

  // 2. Confidence (0–1 × 200)
  score += Math.round(insight.confidence * 200);

  // 3. Source priority
  score += SOURCE_BONUS[insight.source];

  // 4. Type urgency
  score += TYPE_URGENCY[insight.type];

  // 5. Lead agent primary domain bonus
  if (insight.domainId && primaryDomainSet.has(insight.domainId)) {
    score += LEAD_DOMAIN_BONUS;
  }

  // 6. Suggestion linkage bonus
  const suggestionCount = insight.relatedSuggestionIds?.length ?? 0;
  score += Math.min(suggestionCount * SUGGESTION_BONUS, MAX_SUGGESTION_BONUS);

  // 7. Action linkage bonus
  const actionCount = insight.relatedActionIds?.length ?? 0;
  score += Math.min(actionCount * ACTION_BONUS, MAX_ACTION_BONUS);

  return score;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns insights at or above a minimum severity.
 */
export function filterBySeverity(
  insights: CopilotInsight[],
  min:      InsightSeverity,
): CopilotInsight[] {
  const threshold = SEVERITY_WEIGHT[min];
  return insights.filter(i => SEVERITY_WEIGHT[i.severity] >= threshold);
}

/**
 * Returns insights above a confidence threshold (0–1).
 */
export function filterByConfidence(
  insights:   CopilotInsight[],
  threshold:  number,
): CopilotInsight[] {
  return insights.filter(i => i.confidence >= threshold);
}

/**
 * Returns top N insights after ranking.
 */
export function getTopInsights(
  insights: CopilotInsight[],
  ctx:      CopilotRuntimeContext,
  n:        number,
): CopilotInsight[] {
  return rankInsights(insights, ctx).slice(0, n);
}
