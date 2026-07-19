/**
 * lib/copilot/viewmodel/summary-builder.ts
 *
 * Agentik Copilot — Summary Builder
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Builds CopilotSummary from the assembled ViewModel state.
 * No business KPIs. No financial calculations. State projection only.
 */

import type { CopilotRuntimeSnapshot }  from "../runtime/runtime-snapshot";
import type { CopilotAgentCard }        from "./copilot-viewmodel-types";
import type { CopilotAttentionItem }    from "./copilot-viewmodel-types";
import type { CopilotOpportunityItem }  from "./copilot-viewmodel-types";
import type { CopilotSummary }          from "./copilot-viewmodel-types";
import { getSnapshotReadinessLabel }    from "../runtime/runtime-snapshot";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildSummary(params: {
  snapshot:         CopilotRuntimeSnapshot;
  leadCard:         CopilotAgentCard | null;
  supportCards:     CopilotAgentCard[];
  totalSuggestions: number;
  totalInsights:    number;
  attentionItems:   CopilotAttentionItem[];
  opportunities:    CopilotOpportunityItem[];
}): CopilotSummary {
  const {
    snapshot, leadCard, supportCards,
    totalSuggestions, totalInsights,
    attentionItems, opportunities,
  } = params;

  const allAgentNames: string[] = [];
  if (leadCard) allAgentNames.push(leadCard.agentName);
  for (const card of supportCards) allAgentNames.push(card.agentName);

  return {
    module:           snapshot.module,
    screen:           snapshot.screen,
    activeDomains:    snapshot.context.domains,
    leadAgentName:    leadCard?.agentName ?? null,
    leadAgentId:      leadCard?.agentId ?? null,
    activeAgentNames: allAgentNames,
    totalSuggestions,
    totalInsights,
    attentionCount:   attentionItems.length,
    opportunityCount: opportunities.length,
    readiness:        snapshot.readiness,
    readinessLabel:   getSnapshotReadinessLabel(snapshot),
  };
}
