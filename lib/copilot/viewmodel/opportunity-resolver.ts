/**
 * lib/copilot/viewmodel/opportunity-resolver.ts
 *
 * Agentik Copilot — Opportunity Resolver
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Builds CopilotOpportunityItem[] from opportunities already identified
 * by the Suggestions and Insights engines.
 *
 * Sources:
 *   - CopilotSuggestion[] — category = "opportunity"
 *   - CopilotInsight[]    — type = "opportunity" OR type = "trend" (positive)
 *
 * No new intelligence. No new scoring. Classification and grouping only.
 */

import type { CopilotInsight }          from "../insights/insight-types";
import type { CopilotSuggestion }        from "../suggestions/suggestion-types";
import type { CopilotOpportunityItem }   from "./copilot-viewmodel-types";

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveOpportunities(
  insights:    CopilotInsight[],
  suggestions: CopilotSuggestion[],
): CopilotOpportunityItem[] {
  const items: CopilotOpportunityItem[] = [];

  // 1. Opportunity-type insights
  for (const insight of insights) {
    if (insight.type !== "opportunity") continue;

    items.push({
      id:          `opp:ins:${insight.id}`,
      title:       insight.title,
      description: insight.description,
      source:      "insight",
      domainRef:   insight.domainId,
      insightRef:  insight.id,
      score:       insight.score,
    });
  }

  // 2. Opportunity-category suggestions
  for (const s of suggestions) {
    if (s.category !== "opportunity") continue;

    items.push({
      id:            `opp:sug:${s.id}`,
      title:         s.title,
      description:   s.descripcion,
      source:        "suggestion",
      domainRef:     s.domainRef,
      suggestionRef: s.id,
      score:         s.score,
    });
  }

  // Sort by score descending
  items.sort((a, b) => b.score - a.score);

  // Deduplicate by id
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
