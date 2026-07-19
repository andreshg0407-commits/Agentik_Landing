/**
 * lib/copilot/viewmodel/index.ts
 *
 * Agentik Copilot — ViewModel Layer Public API
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Single import point for the entire ViewModel layer.
 *
 * Usage:
 *   import { buildCopilotViewModel, type CopilotViewModel } from "@/lib/copilot/viewmodel"
 *
 * Architecture:
 *   Knowledge → Runtime → Suggestions → Insights → ViewModel
 *
 * Layer contract:
 *   - Consumes: runtime snapshot + suggestion result + insight result
 *   - Produces: CopilotViewModel (UI-ready, no internal engine types)
 *   - Never calls DB, SAG, LLM, or external APIs
 *   - Fully deterministic
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  CopilotAgentCard,
  CopilotSuggestionCard,
  CopilotInsightCard,
  CopilotAttentionItem,
  CopilotOpportunityItem,
  CopilotSummary,
  CopilotViewModel,
} from "./copilot-viewmodel-types";

// ── Workspace types (AGENTIK-COPILOT-WORKSPACE-01) ────────────────────────────
export type {
  WorkItemPriority,
  WorkItemStatus,
  ApprovalRisk,
  ApprovalStatus,
  RequestStatus,
  ActiveWorkItem,
  PendingApprovalItem,
  CompletedWorkItem,
  FollowupItem,
  RequestInboxItem,
} from "./workspace-types";

// ── Agent card builder ────────────────────────────────────────────────────────
export {
  buildLeadAgentCard,
  buildSupportAgentCard,
  buildAgentCards,
} from "./agent-card-builder";

// ── Suggestion card builder ───────────────────────────────────────────────────
export {
  buildSuggestionCard,
  buildSuggestionCards,
} from "./suggestion-card-builder";

// ── Insight card builder ──────────────────────────────────────────────────────
export {
  buildInsightCard,
  buildInsightCards,
} from "./insight-card-builder";

// ── Attention resolver ────────────────────────────────────────────────────────
export { resolveAttentionItems } from "./attention-resolver";

// ── Opportunity resolver ──────────────────────────────────────────────────────
export { resolveOpportunities } from "./opportunity-resolver";

// ── Summary builder ───────────────────────────────────────────────────────────
export { buildSummary } from "./summary-builder";

// ── Main entry point ──────────────────────────────────────────────────────────
export {
  buildCopilotViewModel,
  buildNullViewModel,
} from "./viewmodel-builder";
