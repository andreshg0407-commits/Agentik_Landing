/**
 * lib/copilot/suggestions/suggestion-generator.ts
 *
 * Agentik Copilot — Suggestion Generator
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Converts a CopilotRuntimeSnapshot into CopilotSuggestion[].
 *
 * Sources consumed (in order):
 *   1. Discovered capabilities (primary → secondary)
 *   2. Recommended actions (immediate → contextual)
 *
 * Guarantees:
 *   - No duplicate suggestion IDs
 *   - No external dependencies
 *   - Fully deterministic given same snapshot
 */

import type { CopilotRuntimeSnapshot } from "../runtime/runtime-snapshot";
import type { RankedCapability } from "../runtime/capability-discovery";
import type { RecommendedAction } from "../runtime/action-recommendation";
import type { CopilotSuggestion } from "./suggestion-types";
import { getTemplatesForCapability } from "./suggestion-registry";

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateSuggestions(
  snapshot: CopilotRuntimeSnapshot,
): CopilotSuggestion[] {
  if (!snapshot.context.isResolved) return [];

  const seen = new Set<string>();
  const suggestions: CopilotSuggestion[] = [];

  // 1. Suggestions from capabilities (primary first, then secondary)
  const rankedCapabilities = [
    ...snapshot.capabilities.primary,
    ...snapshot.capabilities.secondary,
  ];

  for (const ranked of rankedCapabilities) {
    const templates = getTemplatesForCapability(ranked.capability.id);

    templates.forEach((template, idx) => {
      const id = `cap:${ranked.capability.id}:${idx}`;
      if (seen.has(id)) return;
      seen.add(id);

      // Score = capability score × 10 + template priority weight
      const score = ranked.score * 10 + PRIORITY_WEIGHT[template.priority];

      suggestions.push({
        id,
        title:         template.title,
        descripcion:   template.descripcion,
        priority:      template.priority,
        category:      template.category,
        source:        "capability",
        capabilityRef: ranked.capability.id,
        domainRef:     ranked.capability.domain,
        agentRef:      snapshot.context.leadAgent?.id ?? undefined,
        score,
      });
    });
  }

  // 2. Suggestions from immediate recommended actions
  const immediateActions = snapshot.actions.immediate;
  for (const rec of immediateActions) {
    const id = `act:${rec.action.id}:0`;
    if (seen.has(id)) continue;
    seen.add(id);

    const priority = actionRiskToPriority(rec.action.riskLevel);
    const score    = rec.score * 10 + PRIORITY_WEIGHT[priority];

    suggestions.push({
      id,
      title:       rec.action.name,
      descripcion: rec.action.descripcion,
      priority,
      category:    "action",
      source:      "action",
      actionRef:   rec.action.id,
      agentRef:    snapshot.context.leadAgent?.id ?? undefined,
      score,
    });
  }

  return suggestions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<CopilotSuggestion["priority"], number> = {
  critical: 40,
  high:     30,
  medium:   20,
  low:      10,
};

function actionRiskToPriority(risk: "low" | "medium" | "high"): CopilotSuggestion["priority"] {
  if (risk === "high")   return "high";
  if (risk === "medium") return "medium";
  return "low";
}
