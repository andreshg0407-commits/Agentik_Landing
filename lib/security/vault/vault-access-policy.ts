/**
 * lib/security/vault/vault-access-policy.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Access Policy
 *
 * Deterministic, fail-closed access control for VaultService operations.
 * No AI inference. No async. No Prisma. No server-only.
 *
 * Principles:
 *   - Tenant check FIRST — mismatched orgSlug always denied
 *   - Fail closed — any error or unknown input → denied
 *   - Least privilege — AGENT and SERVICE actors may only READ or LIST
 */

import type { VaultCaller } from "./vault-secret-record";

// ── Access operation ──────────────────────────────────────────────────────────

export type VaultAccessOperation =
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DISABLE"
  | "REVOKE"
  | "DELETE"
  | "LIST";

// ── Decision ──────────────────────────────────────────────────────────────────

export interface VaultAccessDecision {
  allowed:   boolean;
  reason:    string;
  actorId:   string;
  orgSlug:   string;
  operation: VaultAccessOperation;
}

// ── Policy ────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a caller can perform an operation on a secret.
 *
 * secretOrgSlug: the org that owns the secret (from DB record).
 * caller.orgSlug: the org the caller claims to act on behalf of.
 *
 * Tenant check: caller.orgSlug must === secretOrgSlug.
 * Actor type rules:
 *   SYSTEM  — all operations allowed (internal platform use)
 *   USER    — all operations allowed within own org
 *   AGENT   — READ and LIST only
 *   SERVICE — READ and LIST only
 *
 * Never throws. Returns denied decision on any unexpected error.
 */
export function canAccessVaultSecret(
  caller:        VaultCaller,
  secretOrgSlug: string,
  operation:     VaultAccessOperation,
): VaultAccessDecision {
  try {
    // Tenant isolation — fail closed on missing or mismatched org
    if (!caller.orgSlug || !secretOrgSlug) {
      return {
        allowed:   false,
        reason:    "Access denied: missing orgSlug",
        actorId:   caller.actorId ?? "unknown",
        orgSlug:   caller.orgSlug ?? "",
        operation,
      };
    }

    if (caller.orgSlug !== secretOrgSlug) {
      return {
        allowed:   false,
        reason:    `Access denied: tenant boundary violation (caller=${caller.orgSlug}, resource=${secretOrgSlug})`,
        actorId:   caller.actorId,
        orgSlug:   caller.orgSlug,
        operation,
      };
    }

    // Actor type restrictions
    const actorType = caller.actorType;

    if (actorType === "AGENT" || actorType === "SERVICE") {
      if (operation !== "READ" && operation !== "LIST") {
        return {
          allowed:   false,
          reason:    `Access denied: ${actorType} actors may only READ or LIST secrets`,
          actorId:   caller.actorId,
          orgSlug:   caller.orgSlug,
          operation,
        };
      }
    }

    return {
      allowed:   true,
      reason:    "Access granted",
      actorId:   caller.actorId,
      orgSlug:   caller.orgSlug,
      operation,
    };
  } catch {
    // Fail closed on any unexpected error
    return {
      allowed:   false,
      reason:    "Access denied: policy evaluation error (fail closed)",
      actorId:   caller?.actorId ?? "unknown",
      orgSlug:   caller?.orgSlug ?? "",
      operation,
    };
  }
}

/**
 * Shorthand — check if caller can read a secret.
 */
export function canReadVaultSecret(
  caller:        VaultCaller,
  secretOrgSlug: string,
): VaultAccessDecision {
  return canAccessVaultSecret(caller, secretOrgSlug, "READ");
}

/**
 * Shorthand — check if caller can modify (create/update/disable/revoke/delete) a secret.
 */
export function canModifyVaultSecret(
  caller:        VaultCaller,
  secretOrgSlug: string,
  operation:     Exclude<VaultAccessOperation, "READ" | "LIST">,
): VaultAccessDecision {
  return canAccessVaultSecret(caller, secretOrgSlug, operation);
}
