/**
 * lib/copilot/viewmodel/attention-resolver.ts
 *
 * Agentik Copilot — Attention Resolver
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Identifies items requiring immediate attention from the user.
 * Aggregates critical/high-severity insights and suggestions.
 *
 * Sources:
 *   - CopilotInsight[] — critical/high severity
 *   - CopilotSuggestion[] — critical/high priority, alert/action category
 *
 * No new intelligence. No new scoring. Classification only.
 * Items are ordered: critical first, then high; by score within each tier.
 */

import type { CopilotInsight }         from "../insights/insight-types";
import type { CopilotSuggestion }       from "../suggestions/suggestion-types";
import type { CopilotAttentionItem }    from "./copilot-viewmodel-types";

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveAttentionItems(
  insights:    CopilotInsight[],
  suggestions: CopilotSuggestion[],
): CopilotAttentionItem[] {
  const items: CopilotAttentionItem[] = [];

  // 1. Critical and high-severity insights
  for (const insight of insights) {
    if (insight.severity !== "critical" && insight.severity !== "high") continue;

    items.push({
      id:           `attn:ins:${insight.id}`,
      title:        insight.title,
      description:  insight.description,
      severity:     insight.severity === "critical" ? "critical" : "high",
      source:       "insight",
      domainRef:    insight.domainId,
      insightRef:   insight.id,
      score:        insight.score,
    });
  }

  // 2. Critical/high-priority alert or action suggestions
  for (const s of suggestions) {
    if (s.priority !== "critical" && s.priority !== "high") continue;
    if (s.category !== "alert" && s.category !== "action" && s.category !== "review") continue;

    items.push({
      id:            `attn:sug:${s.id}`,
      title:         s.title,
      description:   s.descripcion,
      severity:      s.priority === "critical" ? "critical" : "high",
      source:        "suggestion",
      domainRef:     s.domainRef,
      suggestionRef: s.id,
      score:         s.score,
    });
  }

  // Sort: critical first, then by score descending
  items.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1;
    }
    return b.score - a.score;
  });

  // Deduplicate by id
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
