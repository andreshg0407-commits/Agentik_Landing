/**
 * lib/copilot/runtime/context-builder.ts
 *
 * Agentik Copilot Runtime — Context Builder
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Assembles a CopilotRuntimeContext from available inputs:
 * tenant, user, module, and screen. Consumes:
 *   - ModuleDomainResolver  → domains
 *   - DomainAgentResolver   → lead agent + support agents
 *   - Knowledge Foundation  → domain definitions
 *
 * No DB calls. No I/O. Pure composition.
 */

import type { DomainId, DomainDefinition } from "../knowledge/domain-registry";
import type { CapabilityId } from "../knowledge/capability-registry";
import type { ActionId } from "../knowledge/action-registry";
import type { KnowledgeAgentId, AgentKnowledgeDefinition } from "../knowledge/agent-definition";
import {
  type AgentikContext,
  type TenantContext,
  type UserContext,
  NULL_CONTEXT,
} from "../knowledge/context-resolver";
import { getDomain, getAllDomains } from "../knowledge/domain-registry";
import { getAgentDefinition, AGENT_KNOWLEDGE_REGISTRY } from "../knowledge/agent-definition";
import { getDomainsForModule } from "./module-domain-resolver";
import { resolveAgentsForDomains } from "./domain-agent-resolver";

// ── Copilot runtime context ────────────────────────────────────────────────────

export interface CopilotRuntimeContext {
  // Navigation
  module:              string;
  screen:              string;

  // Resolved domains
  domains:             DomainId[];
  domainDefinitions:   DomainDefinition[];

  // Resolved agents
  leadAgent:           AgentKnowledgeDefinition | null;
  supportingAgents:    AgentKnowledgeDefinition[];

  // Available capabilities (intersection of tenant + agent + domain)
  availableCapabilities: CapabilityId[];

  // Available actions (filtered by user permissions)
  availableActions:    ActionId[];

  // Identity
  tenant:              TenantContext;
  user:                UserContext;

  // Meta
  timestamp:           Date;
  isResolved:          boolean;
}

// ── Builder input ──────────────────────────────────────────────────────────────

export interface CopilotContextInput {
  module:   string;
  screen?:  string;
  tenant:   TenantContext;
  user:     UserContext;
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildCopilotContext(input: CopilotContextInput): CopilotRuntimeContext {
  const { module, screen = "", tenant, user } = input;

  // 1. Resolve domains from module
  const rawDomains   = getDomainsForModule(module);
  const activeDomains = tenant.activeDomains.length > 0
    ? rawDomains.filter(d => tenant.activeDomains.includes(d))
    : rawDomains;

  // 2. Resolve domain definitions
  const domainDefinitions = activeDomains.map(getDomain);

  // 3. Resolve agents
  const agentResolution = resolveAgentsForDomains(activeDomains);
  const leadAgent = agentResolution.leadAgent
    ? getAgentDefinition(agentResolution.leadAgent)
    : null;
  const supportingAgents = agentResolution.supportAgents
    .map(id => getAgentDefinition(id));

  // 4. Resolve available capabilities
  //    Union of: lead agent caps ∩ tenant active caps
  //    If tenant has no restrictions (empty), all agent caps are available
  const agentCapabilities: CapabilityId[] = leadAgent
    ? leadAgent.capabilities
    : [];
  const availableCapabilities: CapabilityId[] = tenant.activeCapabilities.length > 0
    ? agentCapabilities.filter(c => tenant.activeCapabilities.includes(c))
    : agentCapabilities;

  // 5. Resolve available actions
  //    Lead agent's declared actions, minus user's blocked actions
  const agentActions: ActionId[] = leadAgent
    ? leadAgent.actions
    : [];
  const availableActions: ActionId[] = user.permissions.canExecuteActions
    ? agentActions.filter(a => !user.permissions.blockedActions.includes(a))
    : [];

  return {
    module,
    screen,
    domains:               activeDomains,
    domainDefinitions,
    leadAgent,
    supportingAgents,
    availableCapabilities,
    availableActions,
    tenant,
    user,
    timestamp:             new Date(),
    isResolved:            activeDomains.length > 0,
  };
}

// ── Null context builder (safe default) ───────────────────────────────────────

export function buildNullCopilotContext(): CopilotRuntimeContext {
  return {
    module:                "",
    screen:                "",
    domains:               [],
    domainDefinitions:     [],
    leadAgent:             null,
    supportingAgents:      [],
    availableCapabilities: [],
    availableActions:      [],
    tenant:                NULL_CONTEXT.tenant,
    user:                  NULL_CONTEXT.user,
    timestamp:             new Date(),
    isResolved:            false,
  };
}

// ── Context update helpers ─────────────────────────────────────────────────────

/**
 * Returns a new context with the module/screen updated.
 * Used when the user navigates without a full re-resolution.
 */
export function updateContextNavigation(
  ctx: CopilotRuntimeContext,
  module: string,
  screen: string = "",
): CopilotRuntimeContext {
  return buildCopilotContext({ module, screen, tenant: ctx.tenant, user: ctx.user });
}

/**
 * Returns true if the context has a meaningful agent assigned.
 */
export function isContextReady(ctx: CopilotRuntimeContext): boolean {
  return ctx.isResolved && ctx.leadAgent !== null;
}
