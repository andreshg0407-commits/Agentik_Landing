/**
 * lib/copilot/copilot-agent-selector.ts
 *
 * Agentik — Copilot Intelligence — Agent Selector
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Resolves which agents participate based on business intent.
 * Delegates to the Agent Runtime resolver — never duplicates agent definitions.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { AgentId, AgentDefinition } from "@/lib/agents/runtime/agent-types";
import type { CopilotIntent }            from "./copilot-types";
import { resolveAgent }                  from "@/lib/agents/runtime/agent-resolver";

// ── Intent → agent ID mapping ──────────────────────────────────────────────────
//
// Only the 4 native operational agents are used in this sprint.
// Semantic IDs — never display names.

const INTENT_AGENT_IDS: Record<CopilotIntent, AgentId[]> = {
  FINANCE:     ["finance_agent"],
  MARKETING:   ["marketing_agent"],
  COMMERCIAL:  ["commercial_agent"],
  COLLECTIONS: ["collections_agent"],
  // MULTI_DOMAIN invokes all 4 specialist agents
  MULTI_DOMAIN: ["finance_agent", "marketing_agent", "commercial_agent", "collections_agent"],
  // GENERAL defaults to the finance agent as primary executive lens
  GENERAL:     ["finance_agent"],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the semantic agent IDs selected for the given intent.
 * Never returns display names.
 */
export function getAgentIdsForIntent(intent: CopilotIntent): AgentId[] {
  return [...(INTENT_AGENT_IDS[intent] ?? INTENT_AGENT_IDS.GENERAL)];
}

/**
 * Resolves full AgentDefinition objects for the given intent.
 * Filters out any agents not found in the Agent Runtime registry (safety guard).
 *
 * @param intent  Resolved business intent.
 * @returns       Array of resolved AgentDefinition objects. Never throws.
 */
export function selectAgentsForIntent(intent: CopilotIntent): AgentDefinition[] {
  const ids = getAgentIdsForIntent(intent);
  const resolved: AgentDefinition[] = [];

  for (const id of ids) {
    const agent = resolveAgent(id);
    if (agent && agent.enabled) {
      resolved.push(agent);
    }
    // Silently skip agents not in registry or disabled — avoids hard failures
    // when a tenant disables an agent.
  }

  // If all agents were filtered out (e.g. tenant disabled all), fall back to finance
  if (resolved.length === 0) {
    const fallback = resolveAgent("finance_agent");
    if (fallback) resolved.push(fallback);
  }

  return resolved;
}
