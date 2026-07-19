/**
 * lib/copilot/copilot-execution-plan.ts
 *
 * Agentik — Copilot Intelligence — Execution Plan Builder
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Builds a deterministic CopilotExecutionPlan from an intent and agent list.
 *
 * Rules:
 *   - 1 agent  → parallelizable = false (sequential)
 *   - 2+ agents → parallelizable = true (Promise.all in executor)
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { AgentId }              from "@/lib/agents/runtime/agent-types";
import type {
  CopilotIntent,
  CopilotExecutionPlan,
  CopilotPlanPriority,
}                                    from "./copilot-types";

// ── Planning metadata (optional) ──────────────────────────────────────────────

export interface CopilotExecutionPlanMetadata {
  priority?:              CopilotPlanPriority;
  planningReasons?:       string[];
  memorySignalCount?:     number;
  addedAgentsFromMemory?: AgentId[];
}

// ── ID generator ───────────────────────────────────────────────────────────────

let _planCounter = 0;

function generatePlanId(): string {
  _planCounter = (_planCounter + 1) % 1_000_000;
  return `cxp-${Date.now()}-${String(_planCounter).padStart(6, "0")}`;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build a CopilotExecutionPlan from a resolved intent and selected agent IDs.
 *
 * @param intent    Business intent resolved from the user message.
 * @param agentIds  Semantic agent IDs selected for this intent.
 * @param planning  Optional memory-aware planning metadata to embed in the plan.
 * @returns         Immutable CopilotExecutionPlan.
 */
export function buildCopilotExecutionPlan(
  intent:   CopilotIntent,
  agentIds: AgentId[],
  planning?: CopilotExecutionPlanMetadata,
): CopilotExecutionPlan {
  return {
    id:             generatePlanId(),
    intent,
    agents:         [...agentIds],
    parallelizable: agentIds.length > 1,
    createdAt:      new Date().toISOString(),
    // Memory-aware planning metadata (undefined when not provided)
    priority:              planning?.priority,
    planningReasons:       planning?.planningReasons,
    memorySignalCount:     planning?.memorySignalCount,
    addedAgentsFromMemory: planning?.addedAgentsFromMemory,
  };
}
