/**
 * lib/copilot/viewmodel/suggestion-card-builder.ts
 *
 * Agentik Copilot — Suggestion Card Builder
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Transforms CopilotSuggestion → CopilotSuggestionCard.
 * Adds UI-ready fields (riskLabel, requiresConfirmation) by
 * looking up action definitions where an actionRef is present.
 *
 * No business logic. No scoring. Pure data projection.
 */

import type { CopilotSuggestion }    from "../suggestions/suggestion-types";
import type { CopilotSuggestionCard } from "./copilot-viewmodel-types";
import { ACTION_REGISTRY }            from "../knowledge/action-registry";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildSuggestionCard(s: CopilotSuggestion): CopilotSuggestionCard {
  // Resolve action-level metadata if an actionRef is present
  const actionDef = s.actionRef ? ACTION_REGISTRY[s.actionRef] : undefined;

  const requiresConfirmation = actionDef?.requiresConfirmation ?? false;
  const riskLabel             = resolveRiskLabel(actionDef?.riskLevel ?? "low");

  return {
    id:                   s.id,
    title:                s.title,
    description:          s.descripcion,
    priority:             s.priority,
    category:             s.category,
    domainRef:            s.domainRef,
    actionRef:            s.actionRef,
    requiresConfirmation,
    riskLabel,
    score:                s.score,
  };
}

export function buildSuggestionCards(suggestions: CopilotSuggestion[]): CopilotSuggestionCard[] {
  return suggestions.map(buildSuggestionCard);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveRiskLabel(risk: "low" | "medium" | "high"): "Bajo" | "Medio" | "Alto" {
  if (risk === "high")   return "Alto";
  if (risk === "medium") return "Medio";
  return "Bajo";
}
