/**
 * lib/copilot/viewmodel/copilot-viewmodel-types.ts
 *
 * Agentik Copilot — ViewModel Layer Types
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Defines the complete surface that any future UI will consume.
 * The ViewModel is a pure projection — no intelligence, no computation.
 * It transforms internal runtime state into UI-ready data structures.
 *
 * Rule: Every field here exists because a UI element needs it.
 * Nothing internal or engine-specific leaks through this layer.
 */

import type { DomainId }           from "../knowledge/domain-registry";
import type {
  ActiveWorkItem,
  PendingApprovalItem,
  CompletedWorkItem,
  FollowupItem,
  RequestInboxItem,
} from "./workspace-types";
import type { CapabilityId }       from "../knowledge/capability-registry";
import type { ActionId }           from "../knowledge/action-registry";
import type { KnowledgeAgentId, AgentTone } from "../knowledge/agent-definition";
import type { InsightType, InsightSeverity, InsightEvidence } from "../insights/insight-types";
import type { SuggestionPriority, SuggestionCategory }        from "../suggestions/suggestion-types";
import type { SnapshotReadiness }  from "../runtime/runtime-snapshot";

// ── Agent card ────────────────────────────────────────────────────────────────

/**
 * UI-ready representation of an agent assigned to the current context.
 */
export interface CopilotAgentCard {
  agentId:               KnowledgeAgentId;
  agentName:             string;
  role:                  string;
  description:           string;
  tone:                  AgentTone;
  primaryDomains:        DomainId[];
  availableCapabilities: CapabilityId[];
  /** true = lead agent; false = support agent */
  isLead:                boolean;
}

// ── Suggestion card ───────────────────────────────────────────────────────────

/**
 * UI-ready representation of a contextual suggestion.
 */
export interface CopilotSuggestionCard {
  id:                   string;
  title:                string;
  description:          string;
  priority:             SuggestionPriority;
  category:             SuggestionCategory;
  domainRef?:           DomainId;
  actionRef?:           ActionId;
  /** Whether this action requires explicit confirmation before executing */
  requiresConfirmation: boolean;
  /** Normalized risk label for display */
  riskLabel:            "Bajo" | "Medio" | "Alto";
  score:                number;
}

// ── Insight card ──────────────────────────────────────────────────────────────

/**
 * UI-ready representation of a contextual insight.
 */
export interface CopilotInsightCard {
  id:                    string;
  title:                 string;
  description:           string;
  type:                  InsightType;
  severity:              InsightSeverity;
  /** Human-readable confidence label */
  confidenceLabel:       "Alta" | "Media" | "Baja";
  /** Confidence 0–1 */
  confidence:            number;
  domainRef?:            DomainId;
  evidence?:             InsightEvidence[];
  relatedSuggestionIds?: string[];
  score:                 number;
}

// ── Attention item ────────────────────────────────────────────────────────────

/**
 * An item that requires immediate attention from the user.
 * Aggregates critical/high-severity insights and suggestions.
 */
export interface CopilotAttentionItem {
  id:            string;
  title:         string;
  description:   string;
  /** Unified severity for rendering (critical | high) */
  severity:      "critical" | "high";
  /** Whether this came from an insight or suggestion */
  source:        "insight" | "suggestion";
  domainRef?:    DomainId;
  /** Reference ID of the originating insight, if any */
  insightRef?:   string;
  /** Reference ID of the originating suggestion, if any */
  suggestionRef?: string;
  score:         number;
}

// ── Opportunity item ──────────────────────────────────────────────────────────

/**
 * A growth or optimization opportunity surfaced by the engine.
 */
export interface CopilotOpportunityItem {
  id:            string;
  title:         string;
  description:   string;
  /** Whether this came from an insight or suggestion */
  source:        "insight" | "suggestion";
  domainRef?:    DomainId;
  insightRef?:   string;
  suggestionRef?: string;
  score:         number;
}

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * High-level state summary for the current Copilot context.
 * Used by overview areas, headers, and status indicators.
 */
export interface CopilotSummary {
  module:             string;
  screen:             string;
  activeDomains:      DomainId[];
  leadAgentName:      string | null;
  leadAgentId:        KnowledgeAgentId | null;
  activeAgentNames:   string[];
  totalSuggestions:   number;
  totalInsights:      number;
  attentionCount:     number;
  opportunityCount:   number;
  /** Overall readiness of the Copilot for this context */
  readiness:          SnapshotReadiness;
  /** Short human-readable readiness label */
  readinessLabel:     string;
}

// ── Root ViewModel ────────────────────────────────────────────────────────────

/**
 * The complete Copilot ViewModel.
 * This is what any UI layer consumes — nothing internal leaks through.
 */
export interface CopilotViewModel {
  leadAgent:       CopilotAgentCard | null;
  supportAgents:   CopilotAgentCard[];
  suggestions:     CopilotSuggestionCard[];
  insights:        CopilotInsightCard[];
  attentionItems:  CopilotAttentionItem[];
  opportunities:   CopilotOpportunityItem[];
  summary:         CopilotSummary;

  /** True when the context has a lead agent and active domains */
  isReady:         boolean;
  module:          string;
  screen:          string;
  snapshotId:      string;
  generatedAt:     Date;

  // ── Workspace state (optional — populated by fixture / future runtime) ──────
  activeWork?:       ActiveWorkItem[];
  pendingApprovals?: PendingApprovalItem[];
  completedWork?:    CompletedWorkItem[];
  followups?:        FollowupItem[];
  requestInbox?:     RequestInboxItem[];
}
