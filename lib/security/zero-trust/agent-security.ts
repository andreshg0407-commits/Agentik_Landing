/**
 * lib/security/zero-trust/agent-security.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Agent Security Layer — Zero Trust for AI Agents
 *
 * Server-only. Enforces access boundaries for Agentik AI agents.
 *
 * Agent domain assignments (from copilot-agent-registry.ts):
 *   luca   → marketing_studio
 *   diego  → finance
 *   laura  → collections
 *   david  → reports, dashboard
 *   sofia  → integrations
 *   mila   → marketing_studio (foto_estudio, biblioteca)
 *   pablo  → copilot, executive (cross-cutting)
 *
 * Principles:
 *   - Each agent operates only in its assigned domain
 *   - No agent can escalate privileges beyond its scope
 *   - No agent can bypass RBAC
 *   - No agent can access vault directly (goes through rotation service)
 *   - Cross-agent delegation requires explicit approval
 */

import "server-only";

import type {
  ZeroTrustContext,
  ZeroTrustResourceType,
  ZeroTrustAction,
  AgentAccessResult,
  ZeroTrustRiskLevel,
} from "./zero-trust-types";

// ── Agent Domain Registry ──────────────────────────────────────────────────────

/**
 * AgentDomain — the set of resource types and actions an agent may access.
 */
export interface AgentDomain {
  /** Resources the agent can READ. */
  canRead:    ReadonlyArray<ZeroTrustResourceType>;
  /** Resources the agent can WRITE. */
  canWrite:   ReadonlyArray<ZeroTrustResourceType>;
  /** Resources the agent can EXECUTE on. */
  canExecute: ReadonlyArray<ZeroTrustResourceType>;
  /** Resources the agent CANNOT access under any circumstances. */
  denied:     ReadonlyArray<ZeroTrustResourceType>;
}

const AGENT_DOMAINS: Record<string, AgentDomain> = {
  luca: {
    canRead:    ["MARKETING_DATA", "AI_MEMORY", "AI_PLAYBOOK"],
    canWrite:   ["MARKETING_DATA", "AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["FINANCIAL_DATA", "SECRET", "VAULT", "ENCRYPTION_KEY", "AI_EXECUTIVE_BRAIN"],
  },
  diego: {
    canRead:    ["FINANCIAL_DATA", "CUSTOMER_DATA", "AI_MEMORY", "AI_PLAYBOOK", "AI_EXECUTIVE_BRAIN"],
    canWrite:   ["FINANCIAL_DATA", "AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["MARKETING_DATA", "SECRET", "VAULT", "ENCRYPTION_KEY", "TENANT_SETTINGS"],
  },
  laura: {
    canRead:    ["CUSTOMER_DATA", "FINANCIAL_DATA", "AI_MEMORY", "AI_PLAYBOOK"],
    canWrite:   ["CUSTOMER_DATA", "AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["MARKETING_DATA", "SECRET", "VAULT", "ENCRYPTION_KEY", "AI_EXECUTIVE_BRAIN"],
  },
  david: {
    canRead:    ["FINANCIAL_DATA", "COMMERCIAL_DATA", "CUSTOMER_DATA", "MARKETING_DATA", "AI_MEMORY"],
    canWrite:   ["AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["SECRET", "VAULT", "ENCRYPTION_KEY", "TENANT_SETTINGS"],
  },
  sofia: {
    canRead:    ["INTEGRATION", "AI_MEMORY", "AI_PLAYBOOK"],
    canWrite:   ["INTEGRATION", "AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["FINANCIAL_DATA", "SECRET", "VAULT", "ENCRYPTION_KEY", "AI_EXECUTIVE_BRAIN"],
  },
  mila: {
    canRead:    ["MARKETING_DATA", "AI_MEMORY", "AI_PLAYBOOK"],
    canWrite:   ["MARKETING_DATA", "AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["FINANCIAL_DATA", "COMMERCIAL_DATA", "SECRET", "VAULT", "ENCRYPTION_KEY"],
  },
  pablo: {
    canRead:    ["AI_MEMORY", "AI_PLAYBOOK", "AI_EXECUTIVE_BRAIN"],
    canWrite:   ["AI_MEMORY"],
    canExecute: ["AI_AGENT"],
    denied:     ["SECRET", "VAULT", "ENCRYPTION_KEY", "FINANCIAL_DATA"],
  },
};

/** Fallback for unknown agents: deny everything. */
const DENY_ALL_DOMAIN: AgentDomain = {
  canRead:    [],
  canWrite:   [],
  canExecute: [],
  denied:     [
    "FINANCIAL_DATA", "CUSTOMER_DATA", "MARKETING_DATA", "COMMERCIAL_DATA",
    "TENANT_SETTINGS", "SECRET", "VAULT", "INTEGRATION", "AUDIT_LOG",
    "AI_MEMORY", "AI_PLAYBOOK", "AI_EXECUTIVE_BRAIN", "AI_AGENT",
    "ENCRYPTION_KEY", "USER_IDENTITY",
  ],
};

// ── canAgentAccess ─────────────────────────────────────────────────────────────

/**
 * canAgentAccess — check if an agent can perform an action on a resource.
 *
 * Fail-closed: unknown agent or unknown resource → DENY.
 */
export function canAgentAccess(params: {
  agentId:      string;
  orgSlug:      string;
  resourceType: ZeroTrustResourceType;
  action:       ZeroTrustAction;
}): AgentAccessResult {
  const { agentId, orgSlug, resourceType, action } = params;

  if (!agentId || agentId.trim().length === 0) {
    return {
      allowed:        false,
      agentId:        agentId ?? "unknown",
      reasons:        ["agent_id_missing"],
      riskLevel:      "CRITICAL",
      scopeViolation: false,
    };
  }

  if (!orgSlug || orgSlug.trim().length === 0) {
    return {
      allowed:        false,
      agentId,
      reasons:        ["org_slug_missing"],
      riskLevel:      "CRITICAL",
      scopeViolation: false,
    };
  }

  const domain = AGENT_DOMAINS[agentId] ?? DENY_ALL_DOMAIN;

  // Check explicit deny list first
  if ((domain.denied as ZeroTrustResourceType[]).includes(resourceType)) {
    return {
      allowed:        false,
      agentId,
      reasons:        [`agent_explicitly_denied_resource:${resourceType}`],
      riskLevel:      "CRITICAL",
      scopeViolation: true,
    };
  }

  // Check action permission
  const allowed = checkActionAllowed(domain, resourceType, action);

  if (!allowed) {
    return {
      allowed:        false,
      agentId,
      reasons:        [`agent_action_not_in_scope: agent=${agentId} resource=${resourceType} action=${action}`],
      riskLevel:      deriveAgentRisk(action),
      scopeViolation: true,
    };
  }

  return {
    allowed:        true,
    agentId,
    reasons:        [`agent_access_within_scope: resource=${resourceType} action=${action}`],
    riskLevel:      "LOW",
    scopeViolation: false,
  };
}

// ── validateAgentScope ────────────────────────────────────────────────────────

/**
 * validateAgentScope — validate a full ZeroTrustContext for an agent subject.
 * Throws if agentId is missing or scope is violated.
 */
export function validateAgentScope(context: ZeroTrustContext): AgentAccessResult {
  if (context.subjectType !== "AGENT") {
    return {
      allowed:        false,
      agentId:        context.agentId ?? "unknown",
      reasons:        ["not_an_agent_subject"],
      riskLevel:      "CRITICAL",
      scopeViolation: false,
    };
  }
  if (!context.agentId) {
    return {
      allowed:        false,
      agentId:        "unknown",
      reasons:        ["agent_id_missing_in_context"],
      riskLevel:      "CRITICAL",
      scopeViolation: false,
    };
  }

  return canAgentAccess({
    agentId:      context.agentId,
    orgSlug:      context.orgSlug,
    resourceType: context.resourceType,
    action:       context.action,
  });
}

// ── evaluateAgentTrust ────────────────────────────────────────────────────────

/**
 * evaluateAgentTrust — score-based trust evaluation for agents.
 * Agents start with a reduced base trust (they are AI, not humans).
 */
export function evaluateAgentTrust(agentId: string, orgSlug: string): {
  score:     number;
  trusted:   boolean;
  riskLevel: ZeroTrustRiskLevel;
} {
  if (!agentId || !orgSlug) {
    return { score: 0, trusted: false, riskLevel: "CRITICAL" };
  }

  const isKnownAgent = agentId in AGENT_DOMAINS;

  // Known agents get base score 60; unknown agents get 0
  const score = isKnownAgent ? 60 : 0;

  return {
    score,
    trusted:   isKnownAgent,
    riskLevel: isKnownAgent ? "MEDIUM" : "CRITICAL",
  };
}

// ── getAgentDomain ────────────────────────────────────────────────────────────

/**
 * getAgentDomain — return the domain definition for an agent.
 * Returns DENY_ALL for unknown agents.
 */
export function getAgentDomain(agentId: string): AgentDomain {
  return AGENT_DOMAINS[agentId] ?? DENY_ALL_DOMAIN;
}

/** List of all known agent IDs. */
export const KNOWN_AGENT_IDS = Object.keys(AGENT_DOMAINS) as ReadonlyArray<string>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkActionAllowed(
  domain:       AgentDomain,
  resourceType: ZeroTrustResourceType,
  action:       ZeroTrustAction,
): boolean {
  switch (action) {
    case "READ":
      return (domain.canRead as ZeroTrustResourceType[]).includes(resourceType);
    case "WRITE":
    case "IMPORT":
    case "DELETE":
      return (domain.canWrite as ZeroTrustResourceType[]).includes(resourceType);
    case "EXECUTE":
      return (domain.canExecute as ZeroTrustResourceType[]).includes(resourceType);
    case "EXPORT":
      return (domain.canRead as ZeroTrustResourceType[]).includes(resourceType);
    case "APPROVE":
    case "ROTATE_SECRET":
    case "MANAGE_USERS":
    case "ADMIN":
      // Agents are never allowed to approve, rotate secrets, manage users, or admin
      return false;
    default:
      return false;
  }
}

function deriveAgentRisk(action: ZeroTrustAction): ZeroTrustRiskLevel {
  switch (action) {
    case "READ":    return "MEDIUM";
    case "WRITE":   return "HIGH";
    case "DELETE":  return "CRITICAL";
    case "EXPORT":  return "HIGH";
    case "EXECUTE": return "MEDIUM";
    default:        return "CRITICAL";
  }
}
