/**
 * vault-audit.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Audit Foundation
 *
 * Typed audit event contract and structured log emitter for all
 * vault secret access operations.
 *
 * Every vault READ, WRITE, ROTATE, and DENY event is logged.
 *
 * Log format:
 *   [VAULT_AUDIT] action=READ provider=dian type=dian_certificate
 *   org=org_xxx ref=a3f912b4 by=usr_yyy role=AGENTIK_SERVICE
 *   success=true duration=2ms
 *
 * Design principles:
 *   - Never log vault URIs (contain org + provider + secretId)
 *   - Never log raw secret values
 *   - Always log referenceHash for incident correlation
 *   - Always log organizationId for multi-tenant tracing
 *   - Always log success/failure for security monitoring
 *
 * Future:
 *   logVaultAccess() currently writes to stderr (structured log).
 *   When a VaultAuditRecord Prisma model is added, switch to
 *   prisma.vaultAuditRecord.create() in addition to the log line.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { VaultAccessRole, VaultSecretType } from "./vault-types";

// ── Audit event ───────────────────────────────────────────────────────────────

export type VaultAuditAction = "READ" | "WRITE" | "ROTATE" | "DELETE" | "DENIED";

/**
 * Typed vault audit event.
 *
 * All fields are safe to log — no raw secret values, no vault URIs.
 * The referenceHash is sha256(uri)[0:16] and identifies the secret
 * without revealing its path.
 */
export interface VaultAuditEvent {
  /** ISO 8601 timestamp of the operation. */
  timestamp:      string;
  /** Type of operation attempted. */
  action:         VaultAuditAction;
  /** Tenant ID — primary isolation boundary. */
  organizationId: string;
  /** Integration provider slug (e.g. "dian", "pya", "meta"). */
  provider:       string;
  /** Type of secret accessed — for reporting. Never the value. */
  secretType:     VaultSecretType;
  /**
   * Non-reversible reference hash — sha256(vault://uri)[0:16].
   * Allows correlating log lines to a specific secret without revealing the URI.
   */
  referenceHash:  string;
  /** User ID or service name initiating the operation. */
  accessedBy:     string;
  /** Role of the caller. */
  role:           VaultAccessRole;
  /** Whether the operation succeeded. */
  success:        boolean;
  /** Failure reason (if success=false). Never includes secret content. */
  failureReason?: string;
  /** Operation duration in milliseconds. */
  durationMs:     number;
  /** Optional request ID for distributed tracing. */
  requestId?:     string;
}

// ── Audit logger ──────────────────────────────────────────────────────────────

/**
 * Emit a structured vault audit log line.
 *
 * Writes to process.stderr as a structured key=value line.
 * All values that might contain spaces are quoted.
 *
 * Format:
 *   [VAULT_AUDIT] action=READ org=org_xxx provider=dian type=dian_certificate
 *   ref=a3f912b4 by=usr_yyy role=AGENTIK_SERVICE success=true duration=2ms ts=2026-05-10T...
 *
 * Never throws — audit logging failures must not interrupt secret operations.
 */
export function logVaultAccess(event: VaultAuditEvent): void {
  try {
    const parts = [
      "[VAULT_AUDIT]",
      `action=${event.action}`,
      `org=${event.organizationId}`,
      `provider=${event.provider}`,
      `type=${event.secretType}`,
      `ref=${event.referenceHash}`,
      `by=${event.accessedBy}`,
      `role=${event.role}`,
      `success=${event.success}`,
      `duration=${event.durationMs}ms`,
    ];

    if (!event.success && event.failureReason) {
      // Quote the reason to prevent log injection
      const safeReason = event.failureReason.replace(/[\n\r\t"]/g, " ").slice(0, 120);
      parts.push(`reason="${safeReason}"`);
    }

    if (event.requestId) {
      parts.push(`req=${event.requestId}`);
    }

    parts.push(`ts=${event.timestamp}`);

    process.stderr.write(parts.join(" ") + "\n");
  } catch {
    // Audit log failure must never propagate to caller
  }
}

// ── Audit event builders ──────────────────────────────────────────────────────

/**
 * Build a successful vault audit event.
 */
export function buildAuditSuccess(
  action:        VaultAuditAction,
  organizationId: string,
  provider:       string,
  secretType:     VaultSecretType,
  referenceHash:  string,
  accessedBy:     string,
  role:           VaultAccessRole,
  durationMs:     number,
  requestId?:     string,
): VaultAuditEvent {
  return {
    timestamp:      new Date().toISOString(),
    action,
    organizationId,
    provider,
    secretType,
    referenceHash,
    accessedBy,
    role,
    success:        true,
    durationMs,
    requestId,
  };
}

/**
 * Build a failed / denied vault audit event.
 */
export function buildAuditFailure(
  action:         VaultAuditAction,
  organizationId: string,
  provider:       string,
  secretType:     VaultSecretType,
  referenceHash:  string,
  accessedBy:     string,
  role:           VaultAccessRole,
  failureReason:  string,
  durationMs:     number,
  requestId?:     string,
): VaultAuditEvent {
  return {
    timestamp:      new Date().toISOString(),
    action,
    organizationId,
    provider,
    secretType,
    referenceHash,
    accessedBy,
    role,
    success:        false,
    failureReason,
    durationMs,
    requestId,
  };
}
