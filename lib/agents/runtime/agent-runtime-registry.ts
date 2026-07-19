/**
 * lib/agents/runtime/agent-runtime-registry.ts
 *
 * Agentik — Agent Runtime Registry
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Registry of all known agents and module→agent resolution logic.
 * Pure domain. No Prisma. No React. No Next.
 */

import type { AgentId, AgentRuntimeDomain } from "./agent-runtime-types";
import type { AgentProfile } from "./agent-profile";
import {
  DIEGO_FINANCE_AGENT,
  LUCA_MARKETING_AGENT,
  MILA_COMMERCIAL_AGENT,
  SYSTEM_AGENT,
} from "./agent-profile";

// ── Registry ──────────────────────────────────────────────────────────────────

const AGENT_REGISTRY: AgentProfile[] = [
  DIEGO_FINANCE_AGENT,
  LUCA_MARKETING_AGENT,
  MILA_COMMERCIAL_AGENT,
  SYSTEM_AGENT,
];

// ── Module → agent mapping ────────────────────────────────────────────────────

/** Maps route/module slugs to a primary agent ID. */
const MODULE_AGENT_MAP: Record<string, AgentId> = {
  // Finance
  finanzas:           "diego",
  "finanzas/conciliacion":    "diego",
  "finanzas/tesoreria":       "diego",
  "finanzas/cierre":          "diego",
  "finanzas/planeacion":      "diego",
  "finanzas/torre-control":   "diego",
  conciliacion:       "diego",
  tesoreria:          "diego",
  cierre:             "diego",
  planeacion:         "diego",
  // Collections
  cobranza:           "diego",
  cobros:             "diego",
  // Commercial
  comercial:          "mila",
  maletas:            "mila",
  inteligencia:       "mila",
  // Marketing
  marketing:          "luca",
  "marketing-studio": "luca",
  redes:              "luca",
  pauta:              "luca",
  campaigns:          "luca",
  // Ops / default
  operaciones:        "system",
  sistema:            "system",
  gestión:            "system",
  gestion:            "system",
  management:         "system",
};

// ── Domain → agent mapping ────────────────────────────────────────────────────

const DOMAIN_AGENT_MAP: Record<AgentRuntimeDomain, AgentId> = {
  FINANCE:     "diego",
  COLLECTIONS: "diego",
  COMMERCIAL:  "mila",
  MARKETING:   "luca",
  OPERATIONS:  "system",
  MANAGEMENT:  "system",
  SYSTEM:      "system",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAgentProfileById(agentId: AgentId): AgentProfile | undefined {
  return AGENT_REGISTRY.find(a => a.agentId === agentId && a.isActive);
}

export function getAgentsByDomain(domain: AgentRuntimeDomain): AgentProfile[] {
  return AGENT_REGISTRY.filter(
    a => a.isActive && (a.domain === domain || a.allowedDomains.includes(domain)),
  );
}

export function getActiveAgents(): AgentProfile[] {
  return AGENT_REGISTRY.filter(a => a.isActive);
}

/**
 * Resolve the best agent profile for a given module/route slug.
 * Falls back to SYSTEM_AGENT when no mapping is found.
 */
export function resolveAgentForModule(module: string): AgentProfile {
  // Normalize: strip leading slashes, lowercase
  const normalized = module.replace(/^\/+/, "").toLowerCase();

  // Try exact match
  const exactId = MODULE_AGENT_MAP[normalized];
  if (exactId) {
    const found = getAgentProfileById(exactId);
    if (found) return found;
  }

  // Try prefix match (first segment)
  const firstSegment = normalized.split("/")[0] ?? "";
  const prefixId     = MODULE_AGENT_MAP[firstSegment];
  if (prefixId) {
    const found = getAgentProfileById(prefixId);
    if (found) return found;
  }

  return SYSTEM_AGENT;
}

/**
 * Resolve the primary agent for a given decision domain.
 */
export function resolveAgentForDomain(domain: AgentRuntimeDomain): AgentProfile {
  const agentId = DOMAIN_AGENT_MAP[domain];
  return getAgentProfileById(agentId) ?? SYSTEM_AGENT;
}

export { AGENT_REGISTRY };
