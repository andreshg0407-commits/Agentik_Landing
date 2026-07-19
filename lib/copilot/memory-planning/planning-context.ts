/**
 * lib/copilot/memory-planning/planning-context.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Planning Context
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * CopilotPlanningContext aggregates everything the memory-aware planning
 * layer knows about a request before execution begins.
 *
 * Used by:
 *   - copilot-intelligence-service.ts (produced after memory pipeline)
 *   - copilot-response-aggregator.ts (attached to CopilotResponse)
 *   - CopilotResponse.planningContext (surfaced to callers for observability)
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { AgentId }           from "@/lib/agents/runtime/agent-types";
import type { CopilotIntent }     from "../copilot-types";
import type { MemoryContext }     from "../memory/memory-types";
import type {
  MemoryPlanningSignal,
  CopilotPlanPriority,
}                                  from "./memory-planning-types";

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CopilotPlanningContext {
  /** Correlation ID — same as the parent CopilotRequest.id. */
  requestId:             string;
  /** Tenant org slug. */
  orgSlug:               string;
  /** Business intent resolved from the user message. */
  intent:                CopilotIntent;
  /** Strategic memory context retrieved for this request (if any). */
  memoryContext?:        MemoryContext;
  /** Planning signals extracted from memory entries. */
  signals:               MemoryPlanningSignal[];
  /** Agent IDs from standard intent-based selection (before memory adjustments). */
  baseAgents:            AgentId[];
  /** Final agent IDs after memory-aware selection (base + memory-added). */
  finalAgents:           AgentId[];
  /** Agents added purely due to memory signals (not in base selection). */
  addedAgentsFromMemory: AgentId[];
  /** Warnings surfaced by ADD_WARNING signals. */
  warnings:              string[];
  /** Suggested next actions from SUGGEST_NEXT_ACTION signals. */
  suggestedActions:      string[];
  /** Human-readable reasons for each memory-driven modification. */
  planningReasons:       string[];
  /** Calculated execution priority from intent + memory signals. */
  priority:              CopilotPlanPriority;
  /** Number of planning signals extracted from memory. */
  memorySignalCount:     number;
  /** ISO 8601 timestamp when this context was built. */
  createdAt:             string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build a CopilotPlanningContext from its constituent parts.
 * Pure factory — no side effects, no I/O, never throws.
 */
export function buildPlanningContext(
  requestId:             string,
  orgSlug:               string,
  intent:                CopilotIntent,
  signals:               MemoryPlanningSignal[],
  baseAgents:            AgentId[],
  finalAgents:           AgentId[],
  addedAgentsFromMemory: AgentId[],
  warnings:              string[],
  suggestedActions:      string[],
  planningReasons:       string[],
  priority:              CopilotPlanPriority,
  memoryContext?:        MemoryContext,
): CopilotPlanningContext {
  return {
    requestId,
    orgSlug,
    intent,
    memoryContext,
    signals:               [...signals],
    baseAgents:            [...baseAgents],
    finalAgents:           [...finalAgents],
    addedAgentsFromMemory: [...addedAgentsFromMemory],
    warnings:              [...warnings],
    suggestedActions:      [...suggestedActions],
    planningReasons:       [...planningReasons],
    priority,
    memorySignalCount:     signals.length,
    createdAt:             new Date().toISOString(),
  };
}
