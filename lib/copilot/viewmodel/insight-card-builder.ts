/**
 * lib/copilot/viewmodel/insight-card-builder.ts
 *
 * Agentik Copilot — Insight Card Builder
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Transforms CopilotInsight → CopilotInsightCard.
 * Adds UI-ready fields: confidenceLabel.
 *
 * No business logic. No scoring. Pure data projection.
 */

import type { CopilotInsight }    from "../insights/insight-types";
import type { CopilotInsightCard } from "./copilot-viewmodel-types";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildInsightCard(insight: CopilotInsight): CopilotInsightCard {
  return {
    id:                    insight.id,
    title:                 insight.title,
    description:           insight.description,
    type:                  insight.type,
    severity:              insight.severity,
    confidence:            insight.confidence,
    confidenceLabel:       resolveConfidenceLabel(insight.confidence),
    domainRef:             insight.domainId,
    evidence:              insight.evidence,
    relatedSuggestionIds:  insight.relatedSuggestionIds,
    score:                 insight.score,
  };
}

export function buildInsightCards(insights: CopilotInsight[]): CopilotInsightCard[] {
  return insights.map(buildInsightCard);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveConfidenceLabel(confidence: number): "Alta" | "Media" | "Baja" {
  if (confidence >= 0.7) return "Alta";
  if (confidence >= 0.4) return "Media";
  return "Baja";
}
