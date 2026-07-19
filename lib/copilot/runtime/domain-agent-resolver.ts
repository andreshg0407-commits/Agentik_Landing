/**
 * lib/copilot/runtime/domain-agent-resolver.ts
 *
 * Agentik Copilot Runtime — Domain → Agent Resolver
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Determines which agents own or monitor each business domain.
 * Derived from AGENT_KNOWLEDGE_REGISTRY — single source of truth.
 *
 * Resolution:
 *   - primaryAgents:   agents with domain in primaryDomains
 *   - secondaryAgents: agents with domain in secondaryDomains
 *
 * When multiple domains are active, the agent with the most
 * primaryDomain coverage wins the "lead agent" position.
 */

import {
  AGENT_KNOWLEDGE_REGISTRY,
  getAllAgentDefinitions,
  type KnowledgeAgentId,
  type AgentKnowledgeDefinition,
} from "../knowledge/agent-definition";
import type { DomainId } from "../knowledge/domain-registry";

// ── Domain resolution result ───────────────────────────────────────────────────

export interface DomainAgentResolution {
  domain:          DomainId;
  primaryAgents:   KnowledgeAgentId[];
  secondaryAgents: KnowledgeAgentId[];
}

// ── Multi-domain resolution result ────────────────────────────────────────────

export interface MultiDomainAgentResolution {
  domains:         DomainId[];
  leadAgent:       KnowledgeAgentId | null;   // Agent with most primary coverage
  supportAgents:   KnowledgeAgentId[];         // Other relevant agents (no duplicates)
  byDomain:        DomainAgentResolution[];
}

// ── Per-domain resolver ────────────────────────────────────────────────────────

export function resolveAgentsForDomain(domain: DomainId): DomainAgentResolution {
  const agents = getAllAgentDefinitions();

  const primaryAgents = agents
    .filter(a => a.primaryDomains.includes(domain))
    .map(a => a.id);

  const secondaryAgents = agents
    .filter(a => a.secondaryDomains.includes(domain) && !a.primaryDomains.includes(domain))
    .map(a => a.id);

  return { domain, primaryAgents, secondaryAgents };
}

// ── Multi-domain resolver ──────────────────────────────────────────────────────

/**
 * Given a list of active domains (e.g. from module resolution),
 * determine the lead agent and supporting agents.
 *
 * Lead agent selection:
 *   - Score each agent by: primaryDomain matches × 2 + secondaryDomain matches × 1
 *   - Highest scorer wins
 *   - Tie-break: agent that appears first in registry order
 */
export function resolveAgentsForDomains(domains: DomainId[]): MultiDomainAgentResolution {
  if (domains.length === 0) {
    return { domains, leadAgent: null, supportAgents: [], byDomain: [] };
  }

  const byDomain = domains.map(resolveAgentsForDomain);

  // Score each agent
  const scores = new Map<KnowledgeAgentId, number>();

  for (const resolution of byDomain) {
    for (const id of resolution.primaryAgents) {
      scores.set(id, (scores.get(id) ?? 0) + 2);
    }
    for (const id of resolution.secondaryAgents) {
      scores.set(id, (scores.get(id) ?? 0) + 1);
    }
  }

  // Sort by score descending, then by registry order for tie-breaking
  const agentOrder = Object.keys(AGENT_KNOWLEDGE_REGISTRY) as KnowledgeAgentId[];
  const ranked = Array.from(scores.entries()).sort(([aId, aScore], [bId, bScore]) => {
    if (bScore !== aScore) return bScore - aScore;
    return agentOrder.indexOf(aId) - agentOrder.indexOf(bId);
  });

  const [leadEntry, ...rest] = ranked;
  const leadAgent = leadEntry?.[0] ?? null;
  const supportAgents = rest.map(([id]) => id);

  return { domains, leadAgent, supportAgents, byDomain };
}

// ── Single agent lookup helpers ────────────────────────────────────────────────

/**
 * Returns the agent definition for the lead agent of a domain set.
 */
export function getLeadAgent(domains: DomainId[]): AgentKnowledgeDefinition | null {
  const { leadAgent } = resolveAgentsForDomains(domains);
  return leadAgent ? AGENT_KNOWLEDGE_REGISTRY[leadAgent] : null;
}

/**
 * Returns the lead agent ID for a single domain.
 * Convenience wrapper for single-domain use cases.
 */
export function getLeadAgentForDomain(domain: DomainId): KnowledgeAgentId | null {
  const resolution = resolveAgentsForDomain(domain);
  return resolution.primaryAgents[0] ?? resolution.secondaryAgents[0] ?? null;
}

/**
 * Returns all agents relevant to the given domains (primary + secondary, deduped).
 */
export function getAllRelevantAgents(domains: DomainId[]): AgentKnowledgeDefinition[] {
  const seen = new Set<KnowledgeAgentId>();
  const result: AgentKnowledgeDefinition[] = [];

  for (const domain of domains) {
    const { primaryAgents, secondaryAgents } = resolveAgentsForDomain(domain);
    for (const id of [...primaryAgents, ...secondaryAgents]) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(AGENT_KNOWLEDGE_REGISTRY[id]);
      }
    }
  }

  return result;
}
