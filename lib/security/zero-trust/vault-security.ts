/**
 * lib/security/zero-trust/vault-security.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Vault Security — Zero Trust Integration with Vault and Secret Rotation
 *
 * Server-only. Enforces access control on Vault, Secrets, and Encryption Keys.
 *
 * Rules:
 *   - Agents NEVER access Vault directly
 *   - Agents NEVER access SECRET or ENCRYPTION_KEY resources
 *   - Only VAULT_READ, VAULT_WRITE, VAULT_ADMIN roles can touch Vault
 *   - Secret rotation requires VAULT_ADMIN + SECURITY_ADMIN approval
 *   - Encryption key management requires ENCRYPTION_ADMIN + SECURITY_ADMIN
 *   - All vault access is CRITICAL or HIGH risk — always audited
 *   - Fail-closed: missing role or unknown subject → DENY
 */

import "server-only";

import type { ZeroTrustRiskLevel } from "./zero-trust-types";

// ── Vault Access Request ───────────────────────────────────────────────────────

export interface VaultAccessRequest {
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SERVICE_ACCOUNT" | "SYSTEM";
  orgSlug:     string;
  /** "VAULT" | "SECRET" | "ENCRYPTION_KEY" */
  resourceType: "VAULT" | "SECRET" | "ENCRYPTION_KEY";
  action:       "READ" | "WRITE" | "DELETE" | "ROTATE_SECRET" | "ADMIN" | "EXPORT";
  /** Roles for USER subjects. */
  roles?: ReadonlyArray<string>;
}

export interface VaultAccessResult {
  allowed:          boolean;
  subjectId:        string;
  resourceType:     "VAULT" | "SECRET" | "ENCRYPTION_KEY";
  action:           string;
  reasons:          string[];
  riskLevel:        ZeroTrustRiskLevel;
  requiresApproval: boolean;
  auditRequired:    boolean;
}

// ── Role requirements ─────────────────────────────────────────────────────────

const VAULT_READ_ROLES:   ReadonlyArray<string> = ["VAULT_READ", "VAULT_WRITE", "VAULT_ADMIN", "SUPER_ADMIN"];
const VAULT_WRITE_ROLES:  ReadonlyArray<string> = ["VAULT_WRITE", "VAULT_ADMIN", "SUPER_ADMIN"];
const VAULT_ADMIN_ROLES:  ReadonlyArray<string> = ["VAULT_ADMIN", "SUPER_ADMIN"];
const VAULT_ROTATE_ROLES: ReadonlyArray<string> = ["VAULT_ADMIN", "SUPER_ADMIN"];

const SECRET_READ_ROLES:  ReadonlyArray<string> = ["VAULT_READ", "VAULT_ADMIN", "SUPER_ADMIN"];
const SECRET_WRITE_ROLES: ReadonlyArray<string> = ["VAULT_WRITE", "VAULT_ADMIN", "SUPER_ADMIN"];

const ENCRYPTION_READ_ROLES:  ReadonlyArray<string> = ["ENCRYPTION_VIEW", "ENCRYPTION_ADMIN", "SUPER_ADMIN"];
const ENCRYPTION_ADMIN_ROLES: ReadonlyArray<string> = ["ENCRYPTION_ADMIN", "SUPER_ADMIN"];

// ── validateVaultAccess ────────────────────────────────────────────────────────

/**
 * validateVaultAccess — enforce Zero Trust on all Vault, Secret, and Encryption Key operations.
 *
 * Always fail-closed. All vault access is audit-required.
 */
export function validateVaultAccess(req: VaultAccessRequest): VaultAccessResult {
  const { subjectId, subjectType, orgSlug, resourceType, action, roles = [] } = req;

  if (!subjectId || !orgSlug) {
    return denyVault(subjectId ?? "unknown", resourceType, action, "CRITICAL", false, [
      "vault_access_missing_subject_or_org",
    ]);
  }

  // Agents are NEVER allowed to touch Vault, Secrets, or Encryption Keys
  if (subjectType === "AGENT") {
    return denyVault(subjectId, resourceType, action, "CRITICAL", false, [
      `agents_cannot_access_vault:${subjectId}`,
    ]);
  }

  switch (resourceType) {
    case "VAULT":
      return evaluateVaultAccess(subjectId, subjectType, action, roles);
    case "SECRET":
      return evaluateSecretAccess(subjectId, subjectType, action, roles);
    case "ENCRYPTION_KEY":
      return evaluateEncryptionAccess(subjectId, subjectType, action, roles);
  }
}

// ── canRotateSecret ────────────────────────────────────────────────────────────

/**
 * canRotateSecret — dedicated check for the rotation action.
 * Requires VAULT_ADMIN and triggers a SECURITY_ADMIN approval requirement.
 */
export function canRotateSecret(params: {
  userId:  string;
  orgSlug: string;
  roles:   ReadonlyArray<string>;
}): VaultAccessResult {
  const { userId, orgSlug, roles } = params;

  if (!userId || !orgSlug) {
    return denyVault(userId ?? "unknown", "SECRET", "ROTATE_SECRET", "CRITICAL", false, [
      "rotate_missing_user_or_org",
    ]);
  }

  const hasRole = roles.some(r => (VAULT_ROTATE_ROLES as string[]).includes(r));
  if (!hasRole) {
    return denyVault(userId, "SECRET", "ROTATE_SECRET", "CRITICAL", false, [
      "insufficient_role_for_secret_rotation",
    ]);
  }

  return allowVault(userId, "SECRET", "ROTATE_SECRET", "CRITICAL", true, [
    "secret_rotation_approved_pending_security_admin",
  ]);
}

/**
 * canManageEncryptionKey — check if a user may administer an encryption key.
 * Requires ENCRYPTION_ADMIN + SECURITY_ADMIN approval.
 */
export function canManageEncryptionKey(params: {
  userId:  string;
  orgSlug: string;
  roles:   ReadonlyArray<string>;
}): VaultAccessResult {
  const { userId, orgSlug, roles } = params;

  if (!userId || !orgSlug) {
    return denyVault(userId ?? "unknown", "ENCRYPTION_KEY", "ADMIN", "CRITICAL", false, [
      "encryption_management_missing_user_or_org",
    ]);
  }

  const hasRole = roles.some(r => (ENCRYPTION_ADMIN_ROLES as string[]).includes(r));
  if (!hasRole) {
    return denyVault(userId, "ENCRYPTION_KEY", "ADMIN", "CRITICAL", false, [
      "insufficient_role_for_encryption_key_management",
    ]);
  }

  return allowVault(userId, "ENCRYPTION_KEY", "ADMIN", "CRITICAL", true, [
    "encryption_key_management_approved_pending_security_admin",
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function evaluateVaultAccess(
  subjectId:   string,
  subjectType: "USER" | "SERVICE_ACCOUNT" | "SYSTEM",
  action:      string,
  roles:       ReadonlyArray<string>,
): VaultAccessResult {
  // SERVICE_ACCOUNT and SYSTEM have implicit read for operational secrets
  if (subjectType === "SERVICE_ACCOUNT" || subjectType === "SYSTEM") {
    if (action === "READ") {
      return allowVault(subjectId, "VAULT", action, "HIGH", false, [
        `service_account_vault_read_allowed`,
      ]);
    }
    return denyVault(subjectId, "VAULT", action, "CRITICAL", false, [
      `service_account_cannot_${action}_vault`,
    ]);
  }

  if (action === "READ") {
    const hasRole = roles.some(r => (VAULT_READ_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "VAULT", action, "HIGH", false, ["insufficient_role_for_vault_read"]);
    }
    return allowVault(subjectId, "VAULT", action, "HIGH", false, ["vault_read_granted"]);
  }

  if (action === "WRITE" || action === "IMPORT") {
    const hasRole = roles.some(r => (VAULT_WRITE_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "VAULT", action, "CRITICAL", false, ["insufficient_role_for_vault_write"]);
    }
    return allowVault(subjectId, "VAULT", action, "CRITICAL", false, ["vault_write_granted"]);
  }

  if (action === "ROTATE_SECRET") {
    const hasRole = roles.some(r => (VAULT_ROTATE_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "VAULT", action, "CRITICAL", false, ["insufficient_role_for_vault_rotate"]);
    }
    return allowVault(subjectId, "VAULT", action, "CRITICAL", true, ["vault_rotation_requires_approval"]);
  }

  if (action === "ADMIN" || action === "DELETE") {
    const hasRole = roles.some(r => (VAULT_ADMIN_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "VAULT", action, "CRITICAL", false, ["insufficient_role_for_vault_admin"]);
    }
    return allowVault(subjectId, "VAULT", action, "CRITICAL", true, ["vault_admin_requires_approval"]);
  }

  return denyVault(subjectId, "VAULT", action, "CRITICAL", false, [`vault_action_not_permitted:${action}`]);
}

function evaluateSecretAccess(
  subjectId:   string,
  subjectType: "USER" | "SERVICE_ACCOUNT" | "SYSTEM",
  action:      string,
  roles:       ReadonlyArray<string>,
): VaultAccessResult {
  if (subjectType === "SERVICE_ACCOUNT" || subjectType === "SYSTEM") {
    if (action === "READ") {
      return allowVault(subjectId, "SECRET", action, "HIGH", false, [
        "service_account_secret_read_allowed",
      ]);
    }
    return denyVault(subjectId, "SECRET", action, "CRITICAL", false, [
      `service_account_cannot_${action}_secret`,
    ]);
  }

  if (action === "READ") {
    const hasRole = roles.some(r => (SECRET_READ_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "SECRET", action, "HIGH", false, ["insufficient_role_for_secret_read"]);
    }
    return allowVault(subjectId, "SECRET", action, "HIGH", false, ["secret_read_granted"]);
  }

  if (action === "WRITE" || action === "IMPORT") {
    const hasRole = roles.some(r => (SECRET_WRITE_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "SECRET", action, "CRITICAL", false, ["insufficient_role_for_secret_write"]);
    }
    return allowVault(subjectId, "SECRET", action, "CRITICAL", false, ["secret_write_granted"]);
  }

  if (action === "ROTATE_SECRET") {
    return canRotateSecret({ userId: subjectId, orgSlug: "", roles });
  }

  if (action === "DELETE" || action === "ADMIN") {
    const hasRole = roles.some(r => (VAULT_ADMIN_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "SECRET", action, "CRITICAL", false, ["insufficient_role_for_secret_admin"]);
    }
    return allowVault(subjectId, "SECRET", action, "CRITICAL", true, ["secret_admin_requires_approval"]);
  }

  return denyVault(subjectId, "SECRET", action, "CRITICAL", false, [`secret_action_not_permitted:${action}`]);
}

function evaluateEncryptionAccess(
  subjectId:   string,
  subjectType: "USER" | "SERVICE_ACCOUNT" | "SYSTEM",
  action:      string,
  roles:       ReadonlyArray<string>,
): VaultAccessResult {
  if (subjectType === "SYSTEM") {
    if (action === "READ") {
      return allowVault(subjectId, "ENCRYPTION_KEY", action, "HIGH", false, [
        "system_encryption_read_allowed",
      ]);
    }
  }

  if (action === "READ") {
    const hasRole = roles.some(r => (ENCRYPTION_READ_ROLES as string[]).includes(r));
    if (!hasRole) {
      return denyVault(subjectId, "ENCRYPTION_KEY", action, "HIGH", false, ["insufficient_role_for_encryption_read"]);
    }
    return allowVault(subjectId, "ENCRYPTION_KEY", action, "HIGH", false, ["encryption_key_read_granted"]);
  }

  if (action === "ADMIN" || action === "WRITE" || action === "DELETE" || action === "ROTATE_SECRET") {
    return canManageEncryptionKey({ userId: subjectId, orgSlug: "", roles });
  }

  return denyVault(subjectId, "ENCRYPTION_KEY", action, "CRITICAL", false, [`encryption_action_not_permitted:${action}`]);
}

function allowVault(
  subjectId:        string,
  resourceType:     "VAULT" | "SECRET" | "ENCRYPTION_KEY",
  action:           string,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): VaultAccessResult {
  return {
    allowed: true, subjectId, resourceType, action,
    riskLevel, requiresApproval, auditRequired: true, reasons,
  };
}

function denyVault(
  subjectId:        string,
  resourceType:     "VAULT" | "SECRET" | "ENCRYPTION_KEY",
  action:           string,
  riskLevel:        ZeroTrustRiskLevel,
  requiresApproval: boolean,
  reasons:          string[],
): VaultAccessResult {
  return {
    allowed: false, subjectId, resourceType, action,
    riskLevel, requiresApproval, auditRequired: true, reasons,
  };
}
