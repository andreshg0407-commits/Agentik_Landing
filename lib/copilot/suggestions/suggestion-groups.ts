/**
 * lib/copilot/suggestions/suggestion-groups.ts
 *
 * Agentik Copilot — Suggestion Groups
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Groups ranked suggestions into logical UI sections.
 *
 * Group definitions:
 *
 *   today        — critical priority suggestions. Act now.
 *   recommended  — high priority, immediately actionable (action/review category).
 *   attention    — high/medium priority alerts and reviews.
 *   opportunities — medium/low priority analysis and opportunity categories.
 *
 * Rules:
 *   - Each suggestion belongs to exactly one group.
 *   - Assignment is deterministic based on priority + category.
 *   - Order within a group preserves the ranking order.
 *   - Empty groups are included (empty suggestions array).
 */

import type {
  CopilotSuggestion,
  SuggestionGroup,
  SuggestionGroupKey,
} from "./suggestion-types";

// ── Group definitions ─────────────────────────────────────────────────────────

const GROUP_DEFINITIONS: Record<SuggestionGroupKey, { label: string; descripcion: string }> = {
  today: {
    label:       "Para hoy",
    descripcion: "Situaciones críticas que requieren atención inmediata.",
  },
  recommended: {
    label:       "Recomendado",
    descripcion: "Acciones de alto valor listas para ejecutar.",
  },
  attention: {
    label:       "Requiere atención",
    descripcion: "Alertas y revisiones pendientes que no deben ignorarse.",
  },
  opportunities: {
    label:       "Oportunidades",
    descripcion: "Análisis y oportunidades de mejora para considerar.",
  },
};

// ── Assignment logic ──────────────────────────────────────────────────────────

/**
 * Assigns a suggestion to exactly one group key.
 *
 * Assignment rules (in order of precedence):
 *  1. critical priority                → today
 *  2. high priority + action/review    → recommended
 *  3. high/medium priority + alert     → attention
 *  4. medium/low + analysis/opportunity → opportunities
 *  5. fallback                         → recommended
 */
function assignGroup(s: CopilotSuggestion): SuggestionGroupKey {
  if (s.priority === "critical") {
    return "today";
  }

  if (s.priority === "high") {
    if (s.category === "action" || s.category === "review") {
      return "recommended";
    }
    if (s.category === "alert") {
      return "attention";
    }
    // high + analysis/opportunity
    return "recommended";
  }

  if (s.priority === "medium") {
    if (s.category === "alert" || s.category === "review") {
      return "attention";
    }
    if (s.category === "analysis" || s.category === "opportunity") {
      return "opportunities";
    }
    return "attention";
  }

  // low priority
  return "opportunities";
}

// ── Grouper ───────────────────────────────────────────────────────────────────

/**
 * Groups a ranked list of suggestions into SuggestionGroup[].
 * Preserves order within each group.
 * Always returns all 4 groups (even if empty).
 */
export function groupSuggestions(
  suggestions: CopilotSuggestion[],
): SuggestionGroup[] {
  const buckets: Record<SuggestionGroupKey, CopilotSuggestion[]> = {
    today:         [],
    recommended:   [],
    attention:     [],
    opportunities: [],
  };

  for (const s of suggestions) {
    buckets[assignGroup(s)].push(s);
  }

  // Return in display order
  const ORDER: SuggestionGroupKey[] = ["today", "recommended", "attention", "opportunities"];

  return ORDER.map(key => ({
    key,
    label:       GROUP_DEFINITIONS[key].label,
    descripcion: GROUP_DEFINITIONS[key].descripcion,
    suggestions: buckets[key],
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a specific group by key, or undefined if not found.
 */
export function getGroup(
  groups: SuggestionGroup[],
  key: SuggestionGroupKey,
): SuggestionGroup | undefined {
  return groups.find(g => g.key === key);
}

/**
 * Returns the total count of suggestions across all groups.
 */
export function countGrouped(groups: SuggestionGroup[]): number {
  return groups.reduce((sum, g) => sum + g.suggestions.length, 0);
}

/**
 * Returns the non-empty groups only.
 */
export function getNonEmptyGroups(groups: SuggestionGroup[]): SuggestionGroup[] {
  return groups.filter(g => g.suggestions.length > 0);
}
