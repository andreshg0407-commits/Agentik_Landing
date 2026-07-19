/**
 * lib/copilot/copilot-types.ts
 *
 * Agentik — Copilot Intelligence — Domain Types
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Pure TypeScript domain types for the Copilot Intelligence layer.
 * No Prisma. No React. No Next. No server-only.
 *
 * NOTE: These types are for the Intelligence orchestration layer only.
 * The UI-facing copilot types live at types/copilot/copilot-types.ts.
 */

import type { AgentId }              from "@/lib/agents/runtime/agent-types";
import type { MemoryContext }        from "./memory/memory-types";
import type { CopilotPlanPriority } from "./memory-planning/memory-planning-types";
import type { CopilotPlanningContext } from "./memory-planning/planning-context";
import type { CopilotTenantProfile } from "./profiles/copilot-tenant-profile";
import type { ExecutiveStyle }       from "./profiles/copilot-executive-style";
import type { PlaybookContext }      from "./playbooks/playbook-types";
import type { ExecutiveContext }     from "./executive-brain/executive-brain-types";
import type { ReasoningConclusion }  from "./intelligence/reasoning";

// Re-export for convenience
export type {
  CopilotPlanPriority,
  CopilotPlanningContext,
  CopilotTenantProfile,
  ExecutiveStyle,
  PlaybookContext,
  ExecutiveContext,
};

// ── Intent ────────────────────────────────────────────────────────────────────

/**
 * Business intent resolved from a user message.
 *
 * FINANCE      — cash, treasury, reconciliation, budget, closings
 * MARKETING    — campaigns, content, social, photo studio, pauta
 * COMMERCIAL   — clients, sales, margins, channels, opportunities
 * COLLECTIONS  — invoices, overdue portfolio, cartera, cobros
 * MULTI_DOMAIN — spans 2+ domains (company-level questions)
 * GENERAL      — unclassified or catch-all
 */
export type CopilotIntent =
  | "FINANCE"
  | "MARKETING"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "MULTI_DOMAIN"
  | "GENERAL";

// ── Request ───────────────────────────────────────────────────────────────────

export interface CopilotActor {
  type:   "user" | "system";
  id?:    string;
  label?: string;
}

export interface CopilotRequest {
  /** Optional caller-provided ID. Auto-generated if absent. */
  id?:        string;
  /** Tenant org slug. Required for agent execution and persona resolution. */
  orgSlug:    string;
  /** The raw user message in any language. */
  userMessage: string;
  /** Who is making the request. */
  actor:      CopilotActor;
  /** Optional context hints (current module, active entity, etc.). */
  metadata?:  Record<string, unknown>;
}

// ── Execution Plan ────────────────────────────────────────────────────────────

export interface CopilotExecutionPlan {
  id:             string;
  intent:         CopilotIntent;
  /** Semantic agent IDs — never display names. e.g. "finance_agent". */
  agents:         AgentId[];
  /** True when multiple agents are selected — executor uses Promise.all. */
  parallelizable: boolean;
  createdAt:      string;
  // ── Memory-aware planning metadata (optional) ──────────────────────────────
  /** Execution priority calculated from intent + memory signals. */
  priority?:              CopilotPlanPriority;
  /** Human-readable reasons for memory-driven agent modifications. */
  planningReasons?:       string[];
  /** Number of memory signals that influenced this plan. */
  memorySignalCount?:     number;
  /** Agents added to this plan due to memory signals. */
  addedAgentsFromMemory?: AgentId[];
}

// ── Per-agent result ──────────────────────────────────────────────────────────

export interface CopilotAgentResult {
  agentId:        AgentId;
  /** Tenant-resolved display name: "Diego", "Luca", etc. */
  displayName:    string;
  success:        boolean;
  /** Human-readable summary of what this agent did or found. */
  summary:        string;
  /** Present only if the agent execution failed. */
  error?:         string;
  executedSteps:  number;
  metadata:       Record<string, unknown>;
}

// ── Consolidated Response ─────────────────────────────────────────────────────

export interface CopilotResponse {
  id:                  string;
  orgSlug:             string;
  intent:              CopilotIntent;
  plan:                CopilotExecutionPlan;
  /** Per-agent results (one entry per agent in plan.agents). */
  agentResults:        CopilotAgentResult[];
  /** Single human-readable summary consolidating all agent outputs. */
  consolidatedSummary: string;
  /** Display names of all participating agents. */
  participatingAgents: string[];
  success:             boolean;
  errors:              string[];
  createdAt:           string;
  /** Wall-clock milliseconds for the full pipeline. */
  durationMs:          number;
  /**
   * Strategic memory context retrieved before agent execution.
   * Present when the Memory Engine found relevant context for this request.
   */
  memoryContext?:      MemoryContext;
  /**
   * Full memory-aware planning context (signals, agent modifications, priority).
   * Present when the Memory-Aware Planning layer ran and produced signals.
   */
  planningContext?:    CopilotPlanningContext;
  /**
   * Warnings surfaced from memory signals (e.g. "PagosNet pendiente").
   * Populated by ADD_WARNING signals in the planning layer.
   */
  warnings?:           string[];
  /**
   * Suggested next actions derived from memory signals.
   * Populated by SUGGEST_NEXT_ACTION signals in the planning layer.
   */
  suggestedActions?:   string[];
  /**
   * Execution priority from the memory-aware planning layer.
   * Present when memory signals influenced the plan priority.
   */
  priority?:           CopilotPlanPriority;
  // ── Tenant profile ─────────────────────────────────────────────────────────
  /**
   * The resolved Copilot profile for the tenant that made this request.
   * Present when profile resolution succeeded.
   */
  copilotProfile?:     CopilotTenantProfile;
  /**
   * Resolved display name for the Copilot (e.g. "Yumeko", "Asistente Castillitos").
   * Always derived from copilotProfile via the persona layer — never hardcoded.
   */
  copilotDisplayName?: string;
  /**
   * Executive style of the resolved Copilot profile.
   * Used by the UI to adapt presentation (e.g. STRATEGIC = opportunity-first).
   */
  executiveStyle?:     ExecutiveStyle;
  /**
   * Relevant playbooks retrieved for this request.
   * Present when the Playbooks layer found ACTIVE playbooks for this intent.
   */
  playbookContext?:    PlaybookContext;
  /**
   * Executive intelligence context built for this request.
   * Present when the Executive Brain produced signals or insights.
   */
  executiveContext?:   ExecutiveContext;
  /**
   * Multi-domain reasoning conclusion produced by the Reasoning Engine.
   * Present when the reasoning pipeline ran and produced at least one evidence item.
   * Contains insights, hypotheses, evidence, contradictions, and confidence scores.
   */
  reasoningConclusion?: ReasoningConclusion;
}

/** Alias for callers that prefer the execution-centric naming. */
export type CopilotExecutionResult = CopilotResponse;
