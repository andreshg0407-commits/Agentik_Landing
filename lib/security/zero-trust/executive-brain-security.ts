/**
 * lib/security/zero-trust/executive-brain-security.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Executive Brain Security — Protection for AI Executive Intelligence Layer
 *
 * Server-only. Enforces strict access to the Executive Brain, Financial Memory,
 * and AI Playbooks — the highest-value intelligence assets in the platform.
 *
 * Protected assets:
 *   AI_EXECUTIVE_BRAIN  — cross-module financial intelligence and decisions
 *   AI_MEMORY           — agent memory snapshots and context stores
 *   AI_PLAYBOOK         — operational playbooks and execution templates
 *
 * Access rules:
 *   - Only SUPER_ADMIN and FINANCE_ADMIN may write to AI_EXECUTIVE_BRAIN
 *   - Only ORG_ADMIN approval grants write access
 *   - Agents: diego and pablo may READ; no agent may WRITE
 *   - All writes to AI_EXECUTIVE_BRAIN are HIGH risk
 *   - All reads without proper role are DENIED
 *   - Memory writes by agents are restricted to their domain memory only
 */

import "server-only";

import type {
  ZeroTrustRiskLevel,
  AgentAccessResult,
  ZeroTrustAction,
  ZeroTrustResourceType,
} from "./zero-trust-types";

// ── Executive Brain Access Request ────────────────────────────────────────────

export interface ExecutiveBrainAccessRequest {
  /** Subject requesting access: userId for users, agentId for agents. */
  subjectId:    string;
  /** "USER" | "AGENT" */
  subjectType:  "USER" | "AGENT";
  /** Organization slug. */
  orgSlug:      string;
  /** Resource being accessed. */
  resourceType: ZeroTrustResourceType;
  /** Action being attempted. */
  action:       ZeroTrustAction;
  /** For users: roles assigned in the org. */
  roles?:       ReadonlyArray<string>;
}

export interface ExecutiveBrainAccessResult {
  allowed:        boolean;
  subjectId:      string;
  resourceType:   ZeroTrustResourceType;
  action:         ZeroTrustAction;
  reasons:        string[];
  riskLevel:      ZeroTrustRiskLevel;
  requiresApproval: boolean;
}

// ── Agents allowed to read Executive Brain ────────────────────────────────────

const EXECUTIVE_BRAIN_READER_AGENTS: ReadonlyArray<string> = ["diego", "pablo"];

// ── Roles allowed to access Executive Brain ───────────────────────────────────

const EXECUTIVE_BRAIN_READ_ROLES:  ReadonlyArray<string> = ["SUPER_ADMIN", "ORG_ADMIN", "FINANCE_ADMIN"];
const EXECUTIVE_BRAIN_WRITE_ROLES: ReadonlyArray<string> = ["SUPER_ADMIN", "FINANCE_ADMIN"];

// ── Memory access by agent ─────────────────────────────────────────────────────

/** All known agents may read and write their own memory domain. */
const MEMORY_WRITE_AGENTS: ReadonlyArray<string> = [
  "luca", "diego", "laura", "david", "sofia", "mila", "pablo",
];

// ── Playbook access ────────────────────────────────────────────────────────────

const PLAYBOOK_READ_ROLES:  ReadonlyArray<string> = ["SUPER_ADMIN", "ORG_ADMIN", "FINANCE_ADMIN", "MARKETING_MANAGER"];
const PLAYBOOK_WRITE_ROLES: ReadonlyArray<string> = ["SUPER_ADMIN", "ORG_ADMIN"];

// ── validateExecutiveBrainAccess ───────────────────────────────────────────────

/**
 * validateExecutiveBrainAccess — enforce Zero Trust on the executive intelligence layer.
 *
 * Central function for all AI_EXECUTIVE_BRAIN, AI_MEMORY, AI_PLAYBOOK access decisions.
 */
export function validateExecutiveBrainAccess(
  req: ExecutiveBrainAccessRequest,
): ExecutiveBrainAccessResult {
  const { subjectId, subjectType, orgSlug, resourceType, action, roles = [] } = req;

  if (!subjectId || subjectId.trim().length === 0) {
    return deny(subjectId ?? "unknown", resourceType, action, "CRITICAL", false, [
      "subject_id_missing",
    ]);
  }

  if (!orgSlug || orgSlug.trim().length === 0) {
    return deny(subjectId, resourceType, action, "CRITICAL", false, [
      "org_slug_missing",
    ]);
  }

  switch (resourceType) {
    case "AI_EXECUTIVE_BRAIN":
      return evaluateExecutiveBrainAccess(subjectId, subjectType, action, roles);
    case "AI_MEMORY":
      return evaluateMemoryAccess(subjectId, subjectType, action, roles);
    case "AI_PLAYBOOK":
      return evaluatePlaybookAccess(subjectId, subjectType, action, roles);
    default:
      return deny(subjectId, resourceType, action, "CRITICAL", false, [
        `resource_not_in_executive_layer:${resourceType}`,
      ]);
  }
}

// ── canAgentReadExecutiveBrain ─────────────────────────────────────────────────

/**
 * canAgentReadExecutiveBrain — check if an agent may read executive brain data.
 * Only diego (finance) and pablo (executive copilot) are permitted.
 */
export function canAgentReadExecutiveBrain(agentId: string): AgentAccessResult {
  const allowed = EXECUTIVE_BRAIN_READER_AGENTS.includes(agentId);
  return {
    allowed,
    agentId,
    reasons: allowed
      ? [`agent_allowed_executive_brain_read:${agentId}`]
      : [`agent_not_authorized_for_executive_brain:${agentId}`],
    riskLevel:      allowed ? "MEDIUM" : "CRITICAL",
    scopeViolation: !allowed,
  };
}

/**
 * canAgentWriteMemory — check if an agent may write to its memory domain.
 * All known agents may write their own memory; no agent writes other domains.
 */
export function canAgentWriteMemory(agentId: string): AgentAccessResult {
  const allowed = MEMORY_WRITE_AGENTS.includes(agentId);
  return {
    allowed,
    agentId,
    reasons: allowed
      ? [`agent_memory_write_allowed:${agentId}`]
      : [`agent_not_authorized_for_memory_write:${agentId}`],
    riskLevel:      allowed ? "LOW" : "HIGH",
    scopeViolation: !allowed,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function evaluateExecutiveBrainAccess(
  subjectId:   string,
  subjectType: "USER" | "AGENT",
  action:      ZeroTrustAction,
  roles:       ReadonlyArray<string>,
): ExecutiveBrainAccessResult {
  if (subjectType === "AGENT") {
    // Agents may ONLY read executive brain; never write/execute/admin
    if (action === "READ" && EXECUTIVE_BRAIN_READER_AGENTS.includes(subjectId)) {
      return allow(subjectId, "AI_EXECUTIVE_BRAIN", action, "MEDIUM", false, [
        `agent_executive_brain_read_allowed:${subjectId}`,
      ]);
    }
    return deny(subjectId, "AI_EXECUTIVE_BRAIN", action, "CRITICAL", false, [
      action === "READ"
        ? `agent_not_in_executive_brain_reader_list:${subjectId}`
        : `agents_cannot_write_executive_brain`,
    ]);
  }

  // USER path
  if (isWriteAction(action)) {
    const hasWriteRole = roles.some(r => (EXECUTIVE_BRAIN_WRITE_ROLES as string[]).includes(r));
    if (!hasWriteRole) {
      return deny(subjectId, "AI_EXECUTIVE_BRAIN", action, "HIGH", false, [
        `insufficient_role_for_executive_brain_write`,
      ]);
    }
    return allow(subjectId, "AI_EXECUTIVE_BRAIN", action, "HIGH", true, [
      `executive_brain_write_granted_with_approval`,
    ]);
  }

  if (action === "READ" || action === "EXPORT") {
    const hasReadRole = roles.some(r => (EXECUTIVE_BRAIN_READ_ROLES as string[]).includes(r));
    if (!hasReadRole) {
      return deny(subjectId, "AI_EXECUTIVE_BRAIN", action, "HIGH", false, [
        `insufficient_role_for_executive_brain_read`,
      ]);
    }
    return allow(subjectId, "AI_EXECUTIVE_BRAIN", action, "MEDIUM", false, [
      `executive_brain_read_granted`,
    ]);
  }

  return deny(subjectId, "AI_EXECUTIVE_BRAIN", action, "CRITICAL", false, [
    `action_not_permitted_on_executive_brain:${action}`,
  ]);
}

function evaluateMemoryAccess(
  subjectId:   string,
  subjectType: "USER" | "AGENT",
  action:      ZeroTrustAction,
  roles:       ReadonlyArray<string>,
): ExecutiveBrainAccessResult {
  if (subjectType === "AGENT") {
    if (action === "READ") {
      return allow(subjectId, "AI_MEMORY", action, "LOW", false, [
        `agent_memory_read_allowed:${subjectId}`,
      ]);
    }
    if (action === "WRITE" || action === "IMPORT") {
      const canWrite = MEMORY_WRITE_AGENTS.includes(subjectId);
      if (!canWrite) {
        return deny(subjectId, "AI_MEMORY", action, "HIGH", false, [
          `agent_not_in_memory_write_list:${subjectId}`,
        ]);
      }
      return allow(subjectId, "AI_MEMORY", action, "LOW", false, [
        `agent_memory_write_allowed:${subjectId}`,
      ]);
    }
    return deny(subjectId, "AI_MEMORY", action, "HIGH", false, [
      `agent_action_not_permitted_on_memory:${action}`,
    ]);
  }

  // USER can admin memory with SUPER_ADMIN or ORG_ADMIN
  const hasAdminRole = roles.some(r => r === "SUPER_ADMIN" || r === "ORG_ADMIN");
  if (!hasAdminRole) {
    return deny(subjectId, "AI_MEMORY", action, "MEDIUM", false, [
      `user_lacks_admin_role_for_memory`,
    ]);
  }
  return allow(subjectId, "AI_MEMORY", action, "MEDIUM", false, [
    `user_admin_memory_access_granted`,
  ]);
}

function evaluatePlaybookAccess(
  subjectId:   string,
  subjectType: "USER" | "AGENT",
  action:      ZeroTrustAction,
  roles:       ReadonlyArray<string>,
): ExecutiveBrainAccessResult {
  if (subjectType === "AGENT") {
    if (action === "READ") {
      return allow(subjectId, "AI_PLAYBOOK", action, "LOW", false, [
        `agent_playbook_read_allowed:${subjectId}`,
      ]);
    }
    return deny(subjectId, "AI_PLAYBOOK", action, "HIGH", false, [
      `agents_cannot_write_playbooks`,
    ]);
  }

  if (isWriteAction(action)) {
    const hasWriteRole = roles.some(r => (PLAYBOOK_WRITE_ROLES as string[]).includes(r));
    if (!hasWriteRole) {
      return deny(subjectId, "AI_PLAYBOOK", action, "HIGH", false, [
        `insufficient_role_for_playbook_write`,
      ]);
    }
    return allow(subjectId, "AI_PLAYBOOK", action, "MEDIUM", false, [
      `playbook_write_granted`,
    ]);
  }

  if (action === "READ" || action === "EXPORT") {
    const hasReadRole = roles.some(r => (PLAYBOOK_READ_ROLES as string[]).includes(r));
    if (!hasReadRole) {
      return deny(subjectId, "AI_PLAYBOOK", action, "MEDIUM", false, [
        `insufficient_role_for_playbook_read`,
      ]);
    }
    return allow(subjectId, "AI_PLAYBOOK", action, "LOW", false, [
      `playbook_read_granted`,
    ]);
  }

  return deny(subjectId, "AI_PLAYBOOK", action, "HIGH", false, [
    `action_not_permitted_on_playbook:${action}`,
  ]);
}

function isWriteAction(action: ZeroTrustAction): boolean {
  return action === "WRITE" || action === "DELETE" || action === "IMPORT" || action === "ADMIN";
}

function allow(
  subjectId:        string,
  resourceType:     ZeroTrustResourceType,
  action:           ZeroTrustAction,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): ExecutiveBrainAccessResult {
  return { allowed: true,  subjectId, resourceType, action, riskLevel, requiresApproval, reasons };
}

function deny(
  subjectId:        string,
  resourceType:     ZeroTrustResourceType,
  action:           ZeroTrustAction,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): ExecutiveBrainAccessResult {
  return { allowed: false, subjectId, resourceType, action, riskLevel, requiresApproval, reasons };
}
