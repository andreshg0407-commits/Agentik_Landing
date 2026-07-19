/**
 * lib/security/kms/integrations/kms-rbac.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS RBAC Integration — Authorization Gate for KMS Operations
 *
 * Server-only. Maps KMS operations to RBAC permission checks.
 *
 * Permissions:
 *   KMS_VIEW   → ENCRYPTION_VIEW (metadata reads)
 *   KMS_USE    → ENCRYPTION_VIEW (encrypt / decrypt)
 *   KMS_ROTATE → ENCRYPTION_ADMIN (rotation ops)
 *   KMS_ADMIN  → ENCRYPTION_ADMIN (lifecycle management)
 *   KMS_AUDIT  → AUDIT_VIEW (audit log reads)
 *
 * Fail-closed: any error → DENY.
 * Agents and SERVICE_ACCOUNTs are always denied for high-risk operations.
 */

import "server-only";

import type { KmsOperation } from "../kms-types";
import type { PermissionId } from "../../rbac/rbac-types";
import { evaluateAccess } from "../../rbac/rbac-engine";

// ── KMS RBAC Input ────────────────────────────────────────────────────────────

export interface KmsRbacInput {
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  orgSlug:     string;
  operation:   KmsOperation;
}

// ── KMS RBAC Result ───────────────────────────────────────────────────────────

export interface KmsRbacResult {
  allowed: boolean;
  reasons: string[];
}

// ── Operation → Permission Map ────────────────────────────────────────────────

const OPERATION_PERMISSION_MAP: Record<KmsOperation, PermissionId> = {
  GENERATE_KEY: "ENCRYPTION_ADMIN",
  ENCRYPT:      "ENCRYPTION_VIEW",
  DECRYPT:      "ENCRYPTION_VIEW",
  ROTATE_KEY:   "ENCRYPTION_ADMIN",
  DISABLE_KEY:  "ENCRYPTION_ADMIN",
  ENABLE_KEY:   "ENCRYPTION_ADMIN",
  DELETE_KEY:   "ENCRYPTION_ADMIN",
};

// ── Agent Restrictions ────────────────────────────────────────────────────────

/**
 * Operations that agents are explicitly blocked from.
 * Agents may never modify key lifecycle or perform admin operations.
 */
const AGENT_BLOCKED_OPERATIONS: ReadonlySet<KmsOperation> = new Set([
  "GENERATE_KEY",
  "ROTATE_KEY",
  "DISABLE_KEY",
  "ENABLE_KEY",
  "DELETE_KEY",
]);

// ── checkKmsRbac ──────────────────────────────────────────────────────────────

/**
 * checkKmsRbac — evaluate RBAC permission for a KMS operation.
 *
 * Never throws. Returns structured allow/deny result with reasons.
 */
export function checkKmsRbac(input: KmsRbacInput): KmsRbacResult {
  try {
    const { subjectId, subjectType, orgSlug, operation } = input;

    // ── System subjects bypass RBAC (internal calls) ──────────────────────────
    if (subjectType === "SYSTEM") {
      return { allowed: true, reasons: ["system_subject_bypass"] };
    }

    // ── Validate required fields ──────────────────────────────────────────────
    if (!subjectId || !orgSlug) {
      return { allowed: false, reasons: ["missing_required_fields"] };
    }

    // ── Agent restrictions ─────────────────────────────────────────────────────
    if (subjectType === "AGENT" && AGENT_BLOCKED_OPERATIONS.has(operation)) {
      return {
        allowed: false,
        reasons: [`agent_blocked_from:${operation}`, "agents_cannot_modify_key_lifecycle"],
      };
    }

    // ── SERVICE_ACCOUNT: only encrypt/decrypt allowed ─────────────────────────
    if (subjectType === "SERVICE_ACCOUNT") {
      const serviceAllowed: KmsOperation[] = ["ENCRYPT", "DECRYPT"];
      if (!serviceAllowed.includes(operation)) {
        return {
          allowed: false,
          reasons: [`service_account_blocked_from:${operation}`],
        };
      }
      return { allowed: true, reasons: ["service_account_allowed_for_crypto"] };
    }

    // ── USER: evaluate via RBAC engine ────────────────────────────────────────
    if (subjectType === "USER") {
      const permissionId = OPERATION_PERMISSION_MAP[operation];
      if (!permissionId) {
        return { allowed: false, reasons: [`no_permission_mapped_for:${operation}`] };
      }

      const result = evaluateAccess({ userId: subjectId, orgSlug, permissionId });

      if (result.decision === "ALLOW") {
        return {
          allowed: true,
          reasons: [`rbac_allowed:${result.grantingRole ?? "role_granted"}`, `permission:${permissionId}`],
        };
      }

      return {
        allowed: false,
        reasons: [`rbac_denied:${result.reason}`, `required_permission:${permissionId}`],
      };
    }

    // ── AGENT: limited read-only ───────────────────────────────────────────────
    if (subjectType === "AGENT") {
      const agentAllowed: KmsOperation[] = ["ENCRYPT", "DECRYPT"];
      if (agentAllowed.includes(operation)) {
        return { allowed: true, reasons: ["agent_allowed_for_crypto_ops"] };
      }
      return {
        allowed: false,
        reasons: [`agent_not_allowed_for:${operation}`],
      };
    }

    return { allowed: false, reasons: ["unknown_subject_type"] };

  } catch {
    // Fail-closed
    return { allowed: false, reasons: ["rbac_evaluation_error_fail_closed"] };
  }
}

// ── getRequiredKmsPermission ──────────────────────────────────────────────────

/** Return the RBAC permission required for a given KMS operation. */
export function getRequiredKmsPermission(operation: KmsOperation): PermissionId {
  return OPERATION_PERMISSION_MAP[operation];
}

/** Return true if an agent is allowed to perform the given KMS operation. */
export function isAgentAllowedKmsOperation(operation: KmsOperation): boolean {
  return !AGENT_BLOCKED_OPERATIONS.has(operation);
}
