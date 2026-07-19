/**
 * lib/copilot/memory-planning/memory-aware-agent-selector.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Memory-Aware Agent Selector
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * Takes base agent selection and augments it with memory-driven additions.
 *
 * Rules:
 *   - PRIORITIZE_AGENT → add targetAgentId if not already in base.
 *   - PRIORITIZE_DOMAIN → add the domain's native agent if not already in base.
 *   - No duplicates — deduplicated by Set, preserve deterministic order.
 *   - MULTI_DOMAIN base (all 4 agents) → memory agents are already included.
 *   - Unknown/disabled agents are skipped gracefully (resolveAgent guard).
 *   - ADD_WARNING → extract warning text for response.
 *   - SUGGEST_NEXT_ACTION → extract suggested action text.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { AgentId }                    from "@/lib/agents/runtime/agent-types";
import type { CopilotIntent }              from "../copilot-types";
import type {
  MemoryPlanningSignal,
  MemoryAwareSelectionResult,
  CopilotDomain,
}                                           from "./memory-planning-types";
import { resolveAgent }                    from "@/lib/agents/runtime/agent-resolver";

// ── Domain → native agent ID ──────────────────────────────────────────────────

const DOMAIN_AGENT_ID: Record<CopilotDomain, AgentId> = {
  FINANCE:     "finance_agent",
  MARKETING:   "marketing_agent",
  COMMERCIAL:  "commercial_agent",
  COLLECTIONS: "collections_agent",
};

// ── Selector ──────────────────────────────────────────────────────────────────

/**
 * Apply memory planning signals to the base agent selection.
 *
 * @param intent      Original resolved intent (used for MULTI_DOMAIN guard).
 * @param baseAgents  Agent IDs from standard intent-based selection.
 * @param signals     Planning signals extracted from memory context.
 * @param orgSlug     Tenant slug (used for agent validation).
 * @returns           MemoryAwareSelectionResult — never throws.
 */
export function applyMemoryAwareSelection(
  intent:     CopilotIntent,
  baseAgents: AgentId[],
  signals:    MemoryPlanningSignal[],
  orgSlug:    string,
): MemoryAwareSelectionResult {
  const current  = new Set<AgentId>(baseAgents);
  const added:   AgentId[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];
  const suggestedActions: string[] = [];

  for (const signal of signals) {
    switch (signal.signalType) {
      // ── Add specific agent ─────────────────────────────────────────────────
      case "PRIORITIZE_AGENT": {
        if (!signal.targetAgentId) break;
        const agentId = signal.targetAgentId;
        if (!current.has(agentId)) {
          // Guard: only add if agent exists and is enabled in registry
          const def = resolveAgent(agentId);
          if (def && def.enabled) {
            current.add(agentId);
            added.push(agentId);
            reasons.push(`Agent "${agentId}" added via memory signal: ${signal.reason}`);
          }
        }
        break;
      }

      // ── Add domain's native agent ──────────────────────────────────────────
      case "PRIORITIZE_DOMAIN": {
        if (!signal.targetDomain) break;
        const agentId = DOMAIN_AGENT_ID[signal.targetDomain];
        if (!current.has(agentId)) {
          const def = resolveAgent(agentId);
          if (def && def.enabled) {
            current.add(agentId);
            added.push(agentId);
            reasons.push(`${signal.targetDomain} agent added via memory: ${signal.reason}`);
          }
        }
        break;
      }

      // ── Collect warnings ───────────────────────────────────────────────────
      case "ADD_WARNING": {
        warnings.push(signal.reason);
        break;
      }

      // ── Collect suggested actions ──────────────────────────────────────────
      case "SUGGEST_NEXT_ACTION": {
        suggestedActions.push(signal.reason);
        break;
      }

      // ── ESCALATE_ATTENTION: no agent change needed, priority handles it ────
      case "ESCALATE_ATTENTION":
        break;
    }
  }

  // Build final agent list: base order first, then memory-added agents
  // This preserves deterministic ordering.
  const finalAgents: AgentId[] = [
    ...baseAgents.filter(id => current.has(id)),  // originals (filtered in case any disabled)
    ...added,                                       // memory-added agents appended at end
  ];

  return {
    finalAgents,
    addedAgents:      added,
    reasons,
    warnings,
    suggestedActions,
  };
}
