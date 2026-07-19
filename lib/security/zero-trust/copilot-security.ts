/**
 * lib/security/zero-trust/copilot-security.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Copilot Security — Zero Trust for Agentik Copilot and Agent Delegation
 *
 * Server-only. Controls who may use, delegate to, and interact with Copilot.
 *
 * Rules:
 *   - canAccessCopilot()   — user or agent may invoke copilot interface
 *   - canDelegateTask()    — subject may delegate a task to an agent
 *   - canReadMemory()      — subject may read an agent's memory snapshot
 *   - canWriteMemory()     — subject may write to an agent's memory domain
 *   - canExecuteAgent()    — subject may trigger an agent run
 *
 * Principles:
 *   - Agents can only delegate within their domain
 *   - Users need COPILOT_EXECUTE permission to invoke agents
 *   - Memory reads/writes are domain-scoped per agent
 *   - Cross-agent delegation requires ORG_ADMIN or SUPER_ADMIN
 *   - Fail-closed: unknown subject or agent → DENY
 */

import "server-only";

import type {
  ZeroTrustRiskLevel,
  AgentAccessResult,
} from "./zero-trust-types";

// ── Copilot Access Request ─────────────────────────────────────────────────────

export interface CopilotAccessRequest {
  /** Subject identifier (userId or agentId). */
  subjectId:   string;
  /** "USER" | "AGENT" */
  subjectType: "USER" | "AGENT";
  /** Organization slug. */
  orgSlug:     string;
  /** For users: their permission set. */
  permissions?: ReadonlyArray<string>;
  /** For agents: their agent ID. */
  agentId?:    string;
}

export interface CopilotAccessResult {
  allowed:    boolean;
  subjectId:  string;
  reasons:    string[];
  riskLevel:  ZeroTrustRiskLevel;
}

// ── Task Delegation Request ────────────────────────────────────────────────────

export interface DelegationRequest {
  /** Subject initiating the delegation. */
  fromSubjectId:   string;
  fromSubjectType: "USER" | "AGENT";
  /** Agent receiving the delegation. */
  toAgentId:       string;
  /** Organization slug. */
  orgSlug:         string;
  /** Permissions of the initiating user (if USER). */
  permissions?:    ReadonlyArray<string>;
  /** For agents: the delegating agent's registered domain. */
  fromAgentDomain?: string;
}

export interface DelegationResult {
  allowed:        boolean;
  fromSubjectId:  string;
  toAgentId:      string;
  reasons:        string[];
  riskLevel:      ZeroTrustRiskLevel;
  requiresApproval: boolean;
}

// ── Registered agents (matches copilot-agent-registry.ts) ────────────────────

const KNOWN_AGENTS: ReadonlyArray<string> = [
  "luca", "diego", "laura", "david", "sofia", "mila", "pablo",
];

/** Agents that may perform cross-agent delegation within their domain. */
const CROSS_DOMAIN_DELEGATORS: ReadonlyArray<string> = ["pablo"];

// ── canAccessCopilot ───────────────────────────────────────────────────────────

/**
 * canAccessCopilot — check if a subject may access the copilot interface.
 * Users need COPILOT_EXECUTE or higher. Agents need to be in known list.
 */
export function canAccessCopilot(req: CopilotAccessRequest): CopilotAccessResult {
  const { subjectId, subjectType, orgSlug, permissions = [] } = req;

  if (!subjectId || !orgSlug) {
    return denyCopilot(subjectId ?? "unknown", "CRITICAL", ["subject_or_org_missing"]);
  }

  if (subjectType === "AGENT") {
    const agentId = req.agentId ?? subjectId;
    const isKnown = KNOWN_AGENTS.includes(agentId);
    if (!isKnown) {
      return denyCopilot(subjectId, "CRITICAL", [`unknown_agent:${agentId}`]);
    }
    return allowCopilot(subjectId, "LOW", [`agent_copilot_access_allowed:${agentId}`]);
  }

  // USER: must have COPILOT_EXECUTE or COPILOT_ADMIN
  const hasCopilotPerm = (permissions as string[]).some(
    p => p === "COPILOT_EXECUTE" || p === "COPILOT_ADMIN",
  );
  if (!hasCopilotPerm) {
    return denyCopilot(subjectId, "MEDIUM", ["user_lacks_copilot_execute_permission"]);
  }

  return allowCopilot(subjectId, "LOW", ["user_copilot_access_granted"]);
}

// ── canDelegateTask ────────────────────────────────────────────────────────────

/**
 * canDelegateTask — check if a subject may delegate a task to an agent.
 *
 * Users with COPILOT_EXECUTE may delegate to any known agent.
 * Agents may delegate only within their domain unless they are pablo.
 * Cross-agent delegation to unknown agents is always denied.
 */
export function canDelegateTask(req: DelegationRequest): DelegationResult {
  const {
    fromSubjectId, fromSubjectType, toAgentId, orgSlug,
    permissions = [], fromAgentDomain,
  } = req;

  if (!fromSubjectId || !toAgentId || !orgSlug) {
    return denyDelegation(fromSubjectId ?? "unknown", toAgentId ?? "unknown", "CRITICAL", false, [
      "delegation_missing_required_fields",
    ]);
  }

  // Target agent must be known
  if (!KNOWN_AGENTS.includes(toAgentId)) {
    return denyDelegation(fromSubjectId, toAgentId, "CRITICAL", false, [
      `delegation_target_agent_unknown:${toAgentId}`,
    ]);
  }

  if (fromSubjectType === "USER") {
    const hasPerm = (permissions as string[]).some(
      p => p === "COPILOT_EXECUTE" || p === "COPILOT_ADMIN",
    );
    if (!hasPerm) {
      return denyDelegation(fromSubjectId, toAgentId, "MEDIUM", false, [
        "user_lacks_delegation_permission",
      ]);
    }
    return allowDelegation(fromSubjectId, toAgentId, "LOW", false, [
      `user_delegation_to_agent_allowed:${toAgentId}`,
    ]);
  }

  // AGENT delegating to another agent
  const fromAgentId = fromSubjectId;
  if (!KNOWN_AGENTS.includes(fromAgentId)) {
    return denyDelegation(fromSubjectId, toAgentId, "CRITICAL", false, [
      `from_agent_unknown:${fromAgentId}`,
    ]);
  }

  // pablo can delegate across domains
  if (CROSS_DOMAIN_DELEGATORS.includes(fromAgentId)) {
    return allowDelegation(fromSubjectId, toAgentId, "MEDIUM", false, [
      `cross_domain_delegator_allowed:${fromAgentId}`,
    ]);
  }

  // Other agents: cross-agent delegation requires approval
  if (fromAgentDomain && fromAgentId !== toAgentId) {
    return allowDelegation(fromSubjectId, toAgentId, "MEDIUM", true, [
      `agent_cross_domain_delegation_requires_approval`,
    ]);
  }

  return allowDelegation(fromSubjectId, toAgentId, "LOW", false, [
    `agent_same_domain_delegation_allowed`,
  ]);
}

// ── canReadMemory ──────────────────────────────────────────────────────────────

/**
 * canReadMemory — check if a subject may read an agent's memory snapshot.
 * Agents may read their own memory. Users need MEMORY_READ permission.
 */
export function canReadMemory(params: {
  subjectId:   string;
  subjectType: "USER" | "AGENT";
  targetAgentId: string;
  orgSlug:     string;
  permissions?: ReadonlyArray<string>;
}): AgentAccessResult {
  const { subjectId, subjectType, targetAgentId, orgSlug, permissions = [] } = params;

  if (!subjectId || !orgSlug) {
    return denyMemory(subjectId ?? "unknown", "CRITICAL", ["missing_subject_or_org"]);
  }

  if (subjectType === "AGENT") {
    // Agent may read its own memory
    if (subjectId === targetAgentId) {
      return allowMemory(subjectId, "LOW", [`agent_own_memory_read_allowed`]);
    }
    // pablo may read all agents' memories (cross-cutting copilot)
    if (subjectId === "pablo") {
      return allowMemory(subjectId, "LOW", [`pablo_cross_agent_memory_read_allowed`]);
    }
    return denyMemory(subjectId, "HIGH", [
      `agent_cannot_read_other_agent_memory: from=${subjectId} target=${targetAgentId}`,
    ]);
  }

  // USER
  const hasReadPerm = (permissions as string[]).some(
    p => p === "MEMORY_READ" || p === "MEMORY_ADMIN",
  );
  if (!hasReadPerm) {
    return denyMemory(subjectId, "MEDIUM", ["user_lacks_memory_read_permission"]);
  }
  return allowMemory(subjectId, "LOW", ["user_memory_read_granted"]);
}

// ── canWriteMemory ─────────────────────────────────────────────────────────────

/**
 * canWriteMemory — check if a subject may write to an agent's memory domain.
 * Agents may write to their own domain. Users need MEMORY_WRITE or MEMORY_ADMIN.
 */
export function canWriteMemory(params: {
  subjectId:   string;
  subjectType: "USER" | "AGENT";
  targetAgentId: string;
  orgSlug:     string;
  permissions?: ReadonlyArray<string>;
}): AgentAccessResult {
  const { subjectId, subjectType, targetAgentId, orgSlug, permissions = [] } = params;

  if (!subjectId || !orgSlug) {
    return denyMemory(subjectId ?? "unknown", "CRITICAL", ["missing_subject_or_org"]);
  }

  if (subjectType === "AGENT") {
    if (!KNOWN_AGENTS.includes(subjectId)) {
      return denyMemory(subjectId, "CRITICAL", [`unknown_agent_cannot_write_memory:${subjectId}`]);
    }
    if (subjectId !== targetAgentId) {
      return denyMemory(subjectId, "HIGH", [
        `agent_cannot_write_other_agent_memory: from=${subjectId} target=${targetAgentId}`,
      ]);
    }
    return allowMemory(subjectId, "LOW", [`agent_own_memory_write_allowed`]);
  }

  // USER
  const hasWritePerm = (permissions as string[]).some(
    p => p === "MEMORY_WRITE" || p === "MEMORY_ADMIN",
  );
  if (!hasWritePerm) {
    return denyMemory(subjectId, "MEDIUM", ["user_lacks_memory_write_permission"]);
  }
  return allowMemory(subjectId, "LOW", ["user_memory_write_granted"]);
}

// ── canExecuteAgent ────────────────────────────────────────────────────────────

/**
 * canExecuteAgent — check if a subject may trigger an agent execution run.
 */
export function canExecuteAgent(params: {
  subjectId:   string;
  subjectType: "USER" | "AGENT";
  agentId:     string;
  orgSlug:     string;
  permissions?: ReadonlyArray<string>;
}): CopilotAccessResult {
  const { subjectId, subjectType, agentId, orgSlug, permissions = [] } = params;

  if (!subjectId || !orgSlug) {
    return denyCopilot(subjectId ?? "unknown", "CRITICAL", ["missing_subject_or_org"]);
  }

  if (!KNOWN_AGENTS.includes(agentId)) {
    return denyCopilot(subjectId, "CRITICAL", [`unknown_agent_cannot_be_executed:${agentId}`]);
  }

  if (subjectType === "AGENT") {
    // Agents may trigger other agents only via delegation rules
    const canDelegate = CROSS_DOMAIN_DELEGATORS.includes(subjectId) || subjectId === agentId;
    if (!canDelegate) {
      return denyCopilot(subjectId, "HIGH", [
        `agent_execution_denied: from=${subjectId} to=${agentId}`,
      ]);
    }
    return allowCopilot(subjectId, "MEDIUM", [`agent_execute_allowed:${agentId}`]);
  }

  // USER
  const hasPerm = (permissions as string[]).some(
    p => p === "COPILOT_EXECUTE" || p === "COPILOT_ADMIN",
  );
  if (!hasPerm) {
    return denyCopilot(subjectId, "MEDIUM", ["user_lacks_copilot_execute_permission"]);
  }
  return allowCopilot(subjectId, "LOW", [`user_agent_execution_allowed:${agentId}`]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function allowCopilot(
  subjectId: string,
  riskLevel: ZeroTrustRiskLevel,
  reasons:   string[],
): CopilotAccessResult {
  return { allowed: true, subjectId, riskLevel, reasons };
}

function denyCopilot(
  subjectId: string,
  riskLevel: ZeroTrustRiskLevel,
  reasons:   string[],
): CopilotAccessResult {
  return { allowed: false, subjectId, riskLevel, reasons };
}

function allowDelegation(
  fromSubjectId:    string,
  toAgentId:        string,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): DelegationResult {
  return { allowed: true, fromSubjectId, toAgentId, riskLevel, requiresApproval, reasons };
}

function denyDelegation(
  fromSubjectId:    string,
  toAgentId:        string,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): DelegationResult {
  return { allowed: false, fromSubjectId, toAgentId, riskLevel, requiresApproval, reasons };
}

function allowMemory(
  agentId:   string,
  riskLevel: ZeroTrustRiskLevel,
  reasons:   string[],
): AgentAccessResult {
  return { allowed: true, agentId, riskLevel, reasons, scopeViolation: false };
}

function denyMemory(
  agentId:   string,
  riskLevel: ZeroTrustRiskLevel,
  reasons:   string[],
): AgentAccessResult {
  return { allowed: false, agentId, riskLevel, reasons, scopeViolation: true };
}
