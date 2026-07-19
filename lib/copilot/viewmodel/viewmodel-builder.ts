/**
 * lib/copilot/viewmodel/viewmodel-builder.ts
 *
 * Agentik Copilot — ViewModel Builder
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Primary entry point of the ViewModel layer.
 *
 * Pipeline:
 *   1. Build agent cards       (lead + support)
 *   2. Build suggestion cards
 *   3. Build insight cards
 *   4. Resolve attention items (insights + suggestions → critical/high)
 *   5. Resolve opportunities   (insights + suggestions → opportunity category)
 *   6. Build summary
 *   7. Assemble CopilotViewModel
 *
 * Contract:
 *   - Input:  CopilotRuntimeSnapshot + SuggestionEngineResult + InsightEngineResult
 *   - Output: CopilotViewModel
 *   - Pure:   no side effects, no I/O, fully deterministic
 *
 * Usage:
 *   const snapshot    = buildRuntimeSnapshot(input);
 *   const suggestions = generateSuggestions(snapshot);
 *   const insights    = generateInsights({ snapshot });
 *   const viewModel   = buildCopilotViewModel(snapshot, suggestions, insights);
 */

import type { CopilotRuntimeSnapshot }  from "../runtime/runtime-snapshot";
import type { SuggestionEngineResult }  from "../suggestions/suggestion-types";
import type { InsightEngineResult }     from "../insights/insight-types";
import type { CopilotViewModel }        from "./copilot-viewmodel-types";
import { buildAgentCards }              from "./agent-card-builder";
import { buildSuggestionCards }         from "./suggestion-card-builder";
import { buildInsightCards }            from "./insight-card-builder";
import { resolveAttentionItems }        from "./attention-resolver";
import { resolveOpportunities }         from "./opportunity-resolver";
import { buildSummary }                 from "./summary-builder";

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildCopilotViewModel(
  snapshot:    CopilotRuntimeSnapshot,
  suggestions: SuggestionEngineResult,
  insights:    InsightEngineResult,
): CopilotViewModel {
  const ctx = snapshot.context;

  // 1. Agent cards
  const { leadCard, supportCards } = buildAgentCards(
    ctx.leadAgent,
    ctx.supportingAgents,
    ctx.availableCapabilities,
  );

  // 2. Suggestion cards
  const suggestionCards = buildSuggestionCards(suggestions.suggestions);

  // 3. Insight cards
  const insightCards = buildInsightCards(insights.insights);

  // 4. Attention items
  const attentionItems = resolveAttentionItems(
    insights.insights,
    suggestions.suggestions,
  );

  // 5. Opportunities
  const opportunities = resolveOpportunities(
    insights.insights,
    suggestions.suggestions,
  );

  // 6. Summary
  const summary = buildSummary({
    snapshot,
    leadCard,
    supportCards,
    totalSuggestions: suggestionCards.length,
    totalInsights:    insightCards.length,
    attentionItems,
    opportunities,
  });

  // 7. Assemble
  return {
    leadAgent:      leadCard,
    supportAgents:  supportCards,
    suggestions:    suggestionCards,
    insights:       insightCards,
    attentionItems,
    opportunities,
    summary,
    isReady:        snapshot.readiness === "ready" || snapshot.readiness === "partial",
    module:         snapshot.module,
    screen:         snapshot.screen,
    snapshotId:     snapshot.snapshotId,
    generatedAt:    new Date(),
  };
}

// ── Null ViewModel (safe default for unresolved contexts) ─────────────────────

export function buildNullViewModel(): CopilotViewModel {
  return {
    leadAgent:      null,
    supportAgents:  [],
    suggestions:    [],
    insights:       [],
    attentionItems: [],
    opportunities:  [],
    summary: {
      module:           "",
      screen:           "",
      activeDomains:    [],
      leadAgentName:    null,
      leadAgentId:      null,
      activeAgentNames: [],
      totalSuggestions: 0,
      totalInsights:    0,
      attentionCount:   0,
      opportunityCount: 0,
      readiness:        "empty",
      readinessLabel:   "Sin contexto",
    },
    isReady:     false,
    module:      "",
    screen:      "",
    snapshotId:  "",
    generatedAt: new Date(),
  };
}
