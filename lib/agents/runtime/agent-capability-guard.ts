/**
 * lib/agents/runtime/agent-capability-guard.ts
 *
 * Agentik — Universal Agent Runtime — Capability Guard
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Validates that an agent has an explicit capability before execution.
 * Throws CapabilityError when unauthorized — never silently degrades.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentId, AgentCapabilityType, AgentDefinition } from "./agent-types";

// ── Capability error ──────────────────────────────────────────────────────────

export class AgentCapabilityError extends Error {
  constructor(
    public readonly agentId: AgentId,
    public readonly requiredCapability: AgentCapabilityType,
    public readonly authorizedCapabilities: AgentCapabilityType[],
  ) {
    super(
      `Agent "${agentId}" is not authorized for capability "${requiredCapability}". ` +
      `Authorized: [${authorizedCapabilities.join(", ")}]`,
    );
    this.name = "AgentCapabilityError";
  }
}

export class AgentDisabledError extends Error {
  constructor(public readonly agentId: AgentId) {
    super(`Agent "${agentId}" is disabled and cannot execute actions.`);
    this.name = "AgentDisabledError";
  }
}

export class AgentNotFoundError extends Error {
  constructor(public readonly agentId: AgentId) {
    super(`Agent "${agentId}" is not registered in the runtime.`);
    this.name = "AgentNotFoundError";
  }
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Asserts the agent has a specific capability.
 * Throws AgentCapabilityError if not authorized.
 */
export function assertCapability(
  agent:    AgentDefinition,
  required: AgentCapabilityType,
): void {
  if (!agent.capabilities.includes(required)) {
    throw new AgentCapabilityError(agent.id, required, agent.capabilities);
  }
}

/**
 * Returns true if the agent has the capability, false otherwise.
 * Never throws.
 */
export function agentHasCapability(
  agent:    AgentDefinition,
  required: AgentCapabilityType,
): boolean {
  return agent.capabilities.includes(required);
}

/**
 * Asserts the agent is enabled.
 * Throws AgentDisabledError if not.
 */
export function assertAgentEnabled(agent: AgentDefinition): void {
  if (!agent.enabled) {
    throw new AgentDisabledError(agent.id);
  }
}

/**
 * Validates all capabilities required for a list of action types.
 * Returns first missing capability, or null if all pass.
 */
export function findMissingCapability(
  agent:    AgentDefinition,
  required: AgentCapabilityType[],
): AgentCapabilityType | null {
  return required.find(cap => !agent.capabilities.includes(cap)) ?? null;
}
