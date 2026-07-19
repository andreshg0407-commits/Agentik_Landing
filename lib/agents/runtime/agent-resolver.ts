/**
 * lib/agents/runtime/agent-resolver.ts
 *
 * Agentik — Universal Agent Runtime — Agent Resolver
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Resolves agents by id. Never depends on displayName.
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentId, AgentDefinition, AgentRole } from "./agent-types";
import { NATIVE_AGENT_REGISTRY }                    from "./agent-registry";

// ── Internal registry (extensible) ───────────────────────────────────────────

/** Active registry — starts with natives, may be extended by tenant profiles. */
let _registry: AgentDefinition[] = [...NATIVE_AGENT_REGISTRY];

/**
 * Register additional agents (e.g. custom tenant agents, marketplace agents).
 * Safe to call multiple times — prevents duplicate IDs.
 */
export function registerAgent(agent: AgentDefinition): void {
  if (_registry.some(a => a.id === agent.id)) return;
  _registry = [..._registry, agent];
}

/**
 * Replace the entire registry (useful for testing or tenant bootstrapping).
 * For production use, prefer registerAgent.
 */
export function overrideRegistry(agents: AgentDefinition[]): void {
  _registry = [...agents];
}

// ── Resolver API ──────────────────────────────────────────────────────────────

/**
 * Resolve an agent definition by its semantic ID.
 * Returns null if not found. NEVER throws.
 *
 * The ID is "finance_agent", "marketing_agent", etc. — never "Diego".
 */
export function resolveAgent(id: AgentId): AgentDefinition | null {
  return _registry.find(a => a.id === id) ?? null;
}

/**
 * Returns all registered agents (enabled or not).
 */
export function getAllAgents(): AgentDefinition[] {
  return [..._registry];
}

/**
 * Returns only system-native agents (isSystemAgent = true).
 */
export function getSystemAgents(): AgentDefinition[] {
  return _registry.filter(a => a.isSystemAgent);
}

/**
 * Returns only enabled agents.
 */
export function getEnabledAgents(): AgentDefinition[] {
  return _registry.filter(a => a.enabled);
}

/**
 * Returns agents with a specific role.
 */
export function getAgentsByRole(role: AgentRole): AgentDefinition[] {
  return _registry.filter(a => a.role === role && a.enabled);
}
