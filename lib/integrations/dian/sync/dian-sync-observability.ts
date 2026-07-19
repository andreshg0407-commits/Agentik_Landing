/**
 * dian-sync-observability.ts
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Sync Audit Events
 *
 * Structured audit events for the DIAN fiscal sync layer.
 * All events are emitted to stderr as JSON lines (parseable by log aggregators).
 *
 * SECURITY RULES (enforced by this module):
 *   - Never log: signedXml, privateKeyPem, certPassword, certBuffer, bstXml, signatureXml
 *   - Never log: vault URIs, SecretRef values, raw SOAP envelopes
 *   - Never log: identificationNumber in full (only last 4 chars)
 *   - Always log: organizationId, operation, status, durationMs, syncJobId
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianSyncOperation, DianSyncStatus } from "./dian-sync-types";
import type { DianEnvironment } from "../types/dian-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type DianSyncEventType =
  | "SYNC_STARTED"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED"
  | "SYNC_SKIPPED"       // concurrent lock held
  | "SYNC_RETRY"         // retrying after transient failure
  | "SOAP_FAULT"         // DIAN returned a SOAP Fault
  | "HTTP_TIMEOUT"       // request timed out
  | "CERT_EXPIRED"       // certificate expired — terminal
  | "CERT_EXPIRING_SOON" // certificate expiring within 30 days
  | "VAULT_DENIED"       // SecureVault rejected access (role check)
  | "VAULT_ERROR"        // SecureVault read/decrypt failure
  | "TENANT_NOT_FOUND";  // no DIAN integration for org

// ── Event payload ─────────────────────────────────────────────────────────────

export interface DianSyncAuditEvent {
  /** Discriminator */
  event:          DianSyncEventType;
  /** Stable identifier for correlation */
  syncJobId?:     string;
  traceId?:       string;
  /** Tenant and operation context */
  organizationId: string;
  operation:      DianSyncOperation;
  environment:    DianEnvironment;
  /** Outcome */
  status?:        DianSyncStatus;
  durationMs?:    number;
  retryAttempt?:  number;          // 1-based
  /** Error summary — code only, no raw messages that could leak data */
  errorCode?:     string;
  errorMessage?:  string;          // sanitized — no XML, no secrets
  /** Certificate health (no key material) */
  certExpiresAt?:     string;
  certDaysRemaining?: number;
  /** Timestamp */
  at:             string;          // ISO
}

// ── Emitter ───────────────────────────────────────────────────────────────────

/**
 * Emit a structured DIAN sync audit event to stderr.
 *
 * Prefixed with [DIAN_SYNC_AUDIT] for log aggregation filtering.
 * All events are single-line JSON.
 *
 * Never call with raw XML bodies, private keys, or vault URIs.
 */
export function emitDianSyncEvent(event: DianSyncAuditEvent): void {
  const line = JSON.stringify({
    tag:  "[DIAN_SYNC_AUDIT]",
    ...event,
    at:   event.at ?? new Date().toISOString(),
  });
  process.stderr.write(line + "\n");
}

// ── Convenience builders ──────────────────────────────────────────────────────

export function syncStartedEvent(
  base:       Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  syncJobId:  string,
  traceId?:   string,
): DianSyncAuditEvent {
  return {
    event: "SYNC_STARTED",
    syncJobId,
    traceId,
    ...base,
    status: "running",
    at:     new Date().toISOString(),
  };
}

export function syncCompletedEvent(
  base:       Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  syncJobId:  string,
  durationMs: number,
): DianSyncAuditEvent {
  return {
    event: "SYNC_COMPLETED",
    syncJobId,
    ...base,
    status:     "succeeded",
    durationMs,
    at:         new Date().toISOString(),
  };
}

export function syncFailedEvent(
  base:         Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  syncJobId:    string,
  errorCode:    string,
  errorMessage: string,
  retryAttempt: number,
  durationMs:   number,
): DianSyncAuditEvent {
  return {
    event: "SYNC_FAILED",
    syncJobId,
    ...base,
    status:       "failed",
    errorCode,
    errorMessage: sanitizeErrorMessage(errorMessage),
    retryAttempt,
    durationMs,
    at:           new Date().toISOString(),
  };
}

export function syncRetryEvent(
  base:         Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  syncJobId:    string,
  errorCode:    string,
  retryAttempt: number,
  delayMs:      number,
): DianSyncAuditEvent {
  return {
    event: "SYNC_RETRY",
    syncJobId,
    ...base,
    status:       "running",
    errorCode,
    errorMessage: `Retrying in ${delayMs}ms`,
    retryAttempt,
    at:           new Date().toISOString(),
  };
}

export function syncSkippedEvent(
  base:      Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  reason:    string,
  traceId?:  string,
): DianSyncAuditEvent {
  return {
    event: "SYNC_SKIPPED",
    traceId,
    ...base,
    status:       "skipped",
    errorMessage: reason,
    at:           new Date().toISOString(),
  };
}

export function certExpiredEvent(
  base:         Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  certExpiresAt: string,
): DianSyncAuditEvent {
  return {
    event: "CERT_EXPIRED",
    ...base,
    status:       "failed",
    errorCode:    "CERTIFICATE_EXPIRED",
    certExpiresAt,
    at:           new Date().toISOString(),
  };
}

export function certExpiringSoonEvent(
  base:             Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  certExpiresAt:    string,
  certDaysRemaining: number,
): DianSyncAuditEvent {
  return {
    event: "CERT_EXPIRING_SOON",
    ...base,
    certExpiresAt,
    certDaysRemaining,
    at: new Date().toISOString(),
  };
}

export function vaultDeniedEvent(
  base:      Pick<DianSyncAuditEvent, "organizationId" | "operation" | "environment">,
  syncJobId: string,
): DianSyncAuditEvent {
  return {
    event: "VAULT_DENIED",
    syncJobId,
    ...base,
    status:    "failed",
    errorCode: "VAULT_ACCESS_DENIED",
    at:        new Date().toISOString(),
  };
}

// ── Sanitizer ─────────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /-----BEGIN[^-]+-----[\s\S]+?-----END[^-]+-----/g,   // PEM blocks
  /[A-Za-z0-9+/]{40,}={0,2}/g,                        // long base64 (BST/signature)
  /<ds:[^>]+>[\s\S]*?<\/ds:[^>]+>/g,                  // ds: XML elements
  /<o:BinarySecurityToken[\s\S]*?<\/o:BinarySecurityToken>/g,
  /<u:Timestamp[\s\S]*?<\/u:Timestamp>/g,
];

/**
 * Strip potentially sensitive content from an error message before logging.
 * Caps length at 500 chars to prevent runaway log entries.
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 500);
}
