/**
 * lib/copilot/suggestions/suggestion-ranking.ts
 *
 * Agentik Copilot — Suggestion Ranking
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Deterministic ranking for CopilotSuggestion[].
 *
 * Ranking factors (weighted composite score):
 *   1. Priority weight       (40 / 30 / 20 / 10)
 *   2. Suggestion score      (from generator — capability × action relevance)
 *   3. Agent relevance bonus (+5 if domainRef is in lead agent's primaryDomains)
 *   4. Category urgency      (alert > action > review > analysis > opportunity)
 *   5. Source bonus          (capability +2 | action +1 | domain +0 | agent +3)
 *
 * Tie-break: alphabetical by id (stable sort).
 *
 * No I/O. No randomness. Fully deterministic.
 */

import type { CopilotSuggestion, SuggestionCategory, SuggestionSource } from "./suggestion-types";
import type { CopilotRuntimeContext } from "../runtime/context-builder";

// ── Ranking weights ───────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<CopilotSuggestion["priority"], number> = {
  critical: 400,
  high:     300,
  medium:   200,
  low:      100,
};

const CATEGORY_URGENCY: Record<SuggestionCategory, number> = {
  alert:       50,
  action:      40,
  review:      30,
  analysis:    20,
  opportunity: 10,
};

const SOURCE_BONUS: Record<SuggestionSource, number> = {
  agent:      30,
  capability: 20,
  action:     10,
  domain:      0,
};

const AGENT_PRIMARY_DOMAIN_BONUS = 50;

// ── Ranker ────────────────────────────────────────────────────────────────────

/**
 * Returns a new array of suggestions sorted by composite rank (descending).
 * Does not mutate the input.
 */
export function rankSuggestions(
  suggestions: CopilotSuggestion[],
  ctx: CopilotRuntimeContext,
): CopilotSuggestion[] {
  const primaryDomainSet = new Set(ctx.leadAgent?.primaryDomains ?? []);

  const scored = suggestions.map(s => ({
    suggestion:     s,
    compositeScore: computeCompositeScore(s, primaryDomainSet),
  }));

  scored.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    // Stable tie-break: alphabetical by suggestion id
    return a.suggestion.id.localeCompare(b.suggestion.id);
  });

  return scored.map(s => ({
    ...s.suggestion,
    score: s.compositeScore,  // Update score to reflect composite ranking
  }));
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeCompositeScore(
  suggestion:       CopilotSuggestion,
  primaryDomainSet: Set<string>,
): number {
  let score = 0;

  // 1. Priority weight (dominant factor)
  score += PRIORITY_WEIGHT[suggestion.priority];

  // 2. Generator score contribution (normalized)
  score += Math.min(suggestion.score, 200);

  // 3. Agent primary domain bonus
  if (suggestion.domainRef && primaryDomainSet.has(suggestion.domainRef)) {
    score += AGENT_PRIMARY_DOMAIN_BONUS;
  }

  // 4. Category urgency
  score += CATEGORY_URGENCY[suggestion.category];

  // 5. Source bonus
  score += SOURCE_BONUS[suggestion.source];

  return score;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns only suggestions above a minimum priority.
 */
export function filterByMinPriority(
  suggestions: CopilotSuggestion[],
  min: CopilotSuggestion["priority"],
): CopilotSuggestion[] {
  const threshold = PRIORITY_WEIGHT[min];
  return suggestions.filter(s => PRIORITY_WEIGHT[s.priority] >= threshold);
}

/**
 * Returns the top N suggestions after ranking.
 */
export function getTopN(
  suggestions: CopilotSuggestion[],
  ctx: CopilotRuntimeContext,
  n: number,
): CopilotSuggestion[] {
  return rankSuggestions(suggestions, ctx).slice(0, n);
}
