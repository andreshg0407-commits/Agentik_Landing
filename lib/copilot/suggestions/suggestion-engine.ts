/**
 * lib/copilot/suggestions/suggestion-engine.ts
 *
 * Agentik Copilot — Suggestion Engine
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Primary entry point for the suggestion layer.
 *
 * Pipeline:
 *   1. generateSuggestions(snapshot)  → raw CopilotSuggestion[]
 *   2. rankSuggestions(suggestions)   → sorted CopilotSuggestion[]
 *   3. groupSuggestions(ranked)       → SuggestionGroup[]
 *   4. Return SuggestionEngineResult
 *
 * Contract:
 *   - Input:  CopilotRuntimeSnapshot (already built by runtime layer)
 *   - Output: SuggestionEngineResult (suggestions + groups + meta)
 *   - Pure:   no side effects, no I/O, fully deterministic
 *
 * Usage:
 *   const snapshot = buildRuntimeSnapshot(input);
 *   const result   = generateSuggestions(snapshot);
 */

import type { CopilotRuntimeSnapshot } from "../runtime/runtime-snapshot";
import type { SuggestionEngineResult } from "./suggestion-types";
import { generateSuggestions as generate } from "./suggestion-generator";
import { rankSuggestions }                  from "./suggestion-ranking";
import { groupSuggestions }                 from "./suggestion-groups";
import { getTotalRegisteredTemplates }       from "./suggestion-registry";

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Generates a complete set of contextual suggestions from a runtime snapshot.
 *
 * @param snapshot - A fully resolved CopilotRuntimeSnapshot
 * @returns SuggestionEngineResult with suggestions, groups, and metadata
 */
export function generateSuggestions(
  snapshot: CopilotRuntimeSnapshot,
): SuggestionEngineResult {
  // 1. Generate raw suggestions from capabilities and actions
  const raw = generate(snapshot);

  // 2. Rank by composite score
  const ranked = rankSuggestions(raw, snapshot.context);

  // 3. Group into UI sections
  const groups = groupSuggestions(ranked);

  // 4. Assemble result
  return {
    suggestions: ranked,
    groups,
    meta: {
      totalSuggestions: ranked.length,
      totalGroups:      groups.filter(g => g.suggestions.length > 0).length,
      leadAgent:        snapshot.context.leadAgent?.id ?? null,
      activeDomains:    snapshot.context.domains,
      snapshotId:       snapshot.snapshotId,
      generatedAt:      new Date(),
    },
  };
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Returns registry statistics for debugging and validation.
 */
export function getSuggestionRegistryStats(): {
  totalTemplates: number;
  categories:     string[];
  groups:         string[];
} {
  return {
    totalTemplates: getTotalRegisteredTemplates(),
    categories:     ["analysis", "review", "alert", "action", "opportunity"],
    groups:         ["today", "recommended", "attention", "opportunities"],
  };
}
