/**
 * lib/security/mfa/integrations/mfa-rbac.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA → RBAC Integration
 *
 * Server-only. Gates MFA administrative operations behind RBAC.
 *
 * Permissions:
 *   MFA_MANAGE   — enroll/disable own MFA
 *   MFA_DISABLE  — disable another user's MFA (admin)
 *   MFA_AUDIT    — read MFA audit events
 *   MFA_ADMIN    — full MFA administration (requires SECURITY_ADMIN or higher)
 */

import "server-only";

import type { MfaOperation, MfaRiskLevel } from "../mfa-types";

// ── MFA Permission Types ──────────────────────────────────────────────────────

export type MfaPermission =
  | "MFA_MANAGE"
  | "MFA_DISABLE"
  | "MFA_AUDIT"
  | "MFA_ADMIN";

// ── RBAC Check Input ──────────────────────────────────────────────────────────

export interface MfaRbacInput {
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  orgSlug:     string;
  operation:   MfaOperation;
  /** The user whose MFA is being managed (may differ from subjectId for admin ops). */
  targetUserId?: string;
}

// ── RBAC Result ───────────────────────────────────────────────────────────────

export interface MfaRbacResult {
  allowed:  boolean;
  reasons:  string[];
  required: MfaPermission;
}

// ── Permission Map ────────────────────────────────────────────────────────────

const OPERATION_PERMISSION: Record<MfaOperation, MfaPermission> = {
  ENROLL:        "MFA_MANAGE",
  VERIFY:        "MFA_MANAGE",
  DISABLE:       "MFA_MANAGE",
  ROTATE:        "MFA_MANAGE",
  ADMIN_DISABLE: "MFA_ADMIN",
  AUDIT_READ:    "MFA_AUDIT",
};

/** Operations only SYSTEM or SERVICE_ACCOUNT may perform. */
const SYSTEM_ONLY_OPERATIONS: MfaOperation[] = [];

/** Operations blocked for AGENT subjects. */
const AGENT_BLOCKED_OPERATIONS: MfaOperation[] = [
  "ADMIN_DISABLE",
  "AUDIT_READ",
];

// ── checkMfaRbac ──────────────────────────────────────────────────────────────

/**
 * checkMfaRbac — evaluate RBAC for an MFA operation.
 * Fail-closed: any error → denied.
 */
export function checkMfaRbac(input: MfaRbacInput): MfaRbacResult {
  try {
    if (!input.orgSlug) {
      return _deny("MFA_MANAGE", ["org_slug_required"]);
    }

    const required = OPERATION_PERMISSION[input.operation];

    // SYSTEM bypasses all RBAC for MFA
    if (input.subjectType === "SYSTEM") {
      return { allowed: true, reasons: ["system_subject_bypass"], required };
    }

    // AGENT checks
    if (input.subjectType === "AGENT") {
      if (AGENT_BLOCKED_OPERATIONS.includes(input.operation)) {
        return _deny(required, [`agent_blocked_from_${input.operation}`]);
      }
      // Agents may only verify MFA (not enroll or manage)
      if (input.operation !== "VERIFY") {
        return _deny(required, [`agent_may_only_verify_not_${input.operation}`]);
      }
      return { allowed: true, reasons: ["agent_verify_allowed"], required };
    }

    // SERVICE_ACCOUNT checks
    if (input.subjectType === "SERVICE_ACCOUNT") {
      if (["ADMIN_DISABLE", "AUDIT_READ"].includes(input.operation)) {
        return _deny(required, [`service_account_blocked_from_${input.operation}`]);
      }
      return { allowed: true, reasons: ["service_account_allowed"], required };
    }

    // USER checks — evaluate via RBAC engine if available
    if (input.subjectType === "USER") {
      const userResult = _evaluateUserRbac(input, required);
      return userResult;
    }

    return _deny(required, [`unknown_subject_type:${input.subjectType}`]);

  } catch {
    return _deny("MFA_MANAGE", ["rbac_evaluation_error_fail_closed"]);
  }
}

// ── User RBAC evaluation ──────────────────────────────────────────────────────

function _evaluateUserRbac(input: MfaRbacInput, required: MfaPermission): MfaRbacResult {
  try {
    const { evaluateAccess } = require("@/lib/security/security-evaluator");

    const isSelfOperation = !input.targetUserId || input.targetUserId === input.subjectId;
    const isAdminOperation = !isSelfOperation || required === "MFA_ADMIN";

    if (isAdminOperation && required === "MFA_ADMIN") {
      // Delegate to RBAC engine for admin permission
      const decision = evaluateAccess({
        subject:  { id: input.subjectId, type: input.subjectType },
        resource: "SECURITY",
        action:   "WRITE",
        orgSlug:  input.orgSlug,
      });
      if (decision !== "ALLOW") {
        return _deny(required, ["user_lacks_mfa_admin_permission"]);
      }
    }

    // Self-management is allowed for authenticated users
    if (isSelfOperation && ["ENROLL", "VERIFY", "DISABLE", "ROTATE"].includes(input.operation)) {
      return { allowed: true, reasons: ["user_self_management_allowed"], required };
    }

    // Audit read requires AUDITOR or higher
    if (required === "MFA_AUDIT") {
      const decision = evaluateAccess({
        subject:  { id: input.subjectId, type: input.subjectType },
        resource: "AUDIT",
        action:   "READ",
        orgSlug:  input.orgSlug,
      });
      if (decision !== "ALLOW") {
        return _deny(required, ["user_lacks_audit_read_permission"]);
      }
    }

    return { allowed: true, reasons: ["user_rbac_allowed"], required };
  } catch {
    // Fail-closed on RBAC evaluation error
    return _deny(required, ["user_rbac_evaluation_failed_fail_closed"]);
  }
}

function _deny(required: MfaPermission, reasons: string[]): MfaRbacResult {
  return { allowed: false, required, reasons };
}

// ── Permission queries ─────────────────────────────────────────────────────────

/**
 * getMfaRiskLevel — risk level for an MFA RBAC decision.
 */
export function getMfaOperationRiskLevel(operation: MfaOperation): MfaRiskLevel {
  const map: Record<MfaOperation, MfaRiskLevel> = {
    ENROLL:        "HIGH",
    VERIFY:        "MEDIUM",
    DISABLE:       "HIGH",
    ROTATE:        "HIGH",
    ADMIN_DISABLE: "CRITICAL",
    AUDIT_READ:    "LOW",
  };
  return map[operation] ?? "HIGH";
}
