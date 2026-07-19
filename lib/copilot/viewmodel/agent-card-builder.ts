/**
 * lib/copilot/viewmodel/agent-card-builder.ts
 *
 * Agentik Copilot — Agent Card Builder
 * Sprint: AGENTIK-COPILOT-VIEWMODEL-01
 *
 * Transforms AgentKnowledgeDefinition into CopilotAgentCard.
 * No business logic. No scoring. Pure data projection.
 */

import type { AgentKnowledgeDefinition } from "../knowledge/agent-definition";
import type { CapabilityId }             from "../knowledge/capability-registry";
import type { CopilotAgentCard }         from "./copilot-viewmodel-types";

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a CopilotAgentCard for the lead agent.
 * availableCapabilities is the intersection of agent capabilities
 * and the runtime context's resolved capabilities.
 */
export function buildLeadAgentCard(
  agent:                 AgentKnowledgeDefinition,
  availableCapabilities: CapabilityId[],
): CopilotAgentCard {
  return {
    agentId:               agent.id,
    agentName:             agent.persona.nombre,
    role:                  agent.persona.rol,
    description:           agent.persona.descripcion,
    tone:                  agent.persona.tono,
    primaryDomains:        agent.primaryDomains,
    availableCapabilities: agent.capabilities.filter(c => availableCapabilities.includes(c)),
    isLead:                true,
  };
}

/**
 * Builds a CopilotAgentCard for a support agent.
 */
export function buildSupportAgentCard(
  agent:                 AgentKnowledgeDefinition,
  availableCapabilities: CapabilityId[],
): CopilotAgentCard {
  return {
    agentId:               agent.id,
    agentName:             agent.persona.nombre,
    role:                  agent.persona.rol,
    description:           agent.persona.descripcion,
    tone:                  agent.persona.tono,
    primaryDomains:        agent.primaryDomains,
    availableCapabilities: agent.capabilities.filter(c => availableCapabilities.includes(c)),
    isLead:                false,
  };
}

/**
 * Builds agent cards for the full agent set in the context.
 */
export function buildAgentCards(
  leadAgent:             AgentKnowledgeDefinition | null,
  supportAgents:         AgentKnowledgeDefinition[],
  availableCapabilities: CapabilityId[],
): { leadCard: CopilotAgentCard | null; supportCards: CopilotAgentCard[] } {
  const leadCard = leadAgent
    ? buildLeadAgentCard(leadAgent, availableCapabilities)
    : null;

  const supportCards = supportAgents.map(a =>
    buildSupportAgentCard(a, availableCapabilities)
  );

  return { leadCard, supportCards };
}
