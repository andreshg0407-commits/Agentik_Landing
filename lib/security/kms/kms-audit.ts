/**
 * lib/security/kms/kms-audit.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Audit — Event Recording for All Key Operations
 *
 * Server-only. In-memory audit log for KMS events.
 *
 * CRITICAL CONSTRAINTS:
 *   - NEVER record key material (bytes, raw keys, secrets)
 *   - Only metadata: keyId, keyAlias, operation, subjectId, timestamp
 *   - Fire-and-forget async persistence via PersistentSecurityAuditAdapter
 *   - Never throws — all failures are silent
 */

import "server-only";

import type { KmsAuditEventType } from "./kms-types";

// ── KMS Audit Event ────────────────────────────────────────────────────────────

export interface KmsAuditEvent {
  id:          string;
  eventType:   KmsAuditEventType;
  orgSlug:     string;
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  keyId:       string;
  keyAlias?:   string;
  operation?:  string;
  success:     boolean;
  reasons:     string[];
  occurredAt:  string;
}

// ── KMS Audit Input ────────────────────────────────────────────────────────────

export interface KmsAuditInput {
  eventType:   KmsAuditEventType;
  orgSlug:     string;
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  keyId:       string;
  keyAlias?:   string;
  operation?:  string;
  success:     boolean;
  reasons:     string[];
}

// ── ID Generator ──────────────────────────────────────────────────────────────

let _counter = 0;

function generateKmsEventId(): string {
  _counter = (_counter + 1) % 1_000_000;
  return `kms-${Date.now()}-${String(_counter).padStart(6, "0")}`;
}

// ── In-Memory Log ─────────────────────────────────────────────────────────────

class KmsAuditLog {
  private readonly _events: KmsAuditEvent[] = [];

  record(event: KmsAuditEvent): void {
    this._events.push(event);
  }

  getEvents(): KmsAuditEvent[] {
    return [...this._events];
  }

  getEventsForOrg(orgSlug: string): KmsAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  getEventsByType(eventType: KmsAuditEventType): KmsAuditEvent[] {
    return this._events.filter(e => e.eventType === eventType);
  }

  getDeniedEvents(orgSlug?: string): KmsAuditEvent[] {
    return this._events.filter(e =>
      !e.success && (orgSlug ? e.orgSlug === orgSlug : true),
    );
  }

  count(): number {
    return this._events.length;
  }

  /** Reset for testing only. */
  clear(): void {
    this._events.length = 0;
  }
}

export const kmsAuditLog = new KmsAuditLog();

// ── recordKmsEvent ─────────────────────────────────────────────────────────────

/**
 * recordKmsEvent — record a KMS audit event.
 *
 * Never throws. Never records key material.
 * Async to allow future persistence without blocking callers.
 */
export async function recordKmsEvent(input: KmsAuditInput): Promise<void> {
  try {
    const event: KmsAuditEvent = {
      id:          generateKmsEventId(),
      eventType:   input.eventType,
      orgSlug:     input.orgSlug || "unknown",
      subjectId:   input.subjectId,
      subjectType: input.subjectType,
      keyId:       input.keyId,
      keyAlias:    input.keyAlias,
      operation:   input.operation,
      success:     input.success,
      reasons:     input.reasons,
      occurredAt:  new Date().toISOString(),
    };

    // In-memory record (always succeeds)
    kmsAuditLog.record(event);

    // Async persistence — fire and forget
    void _persistKmsEvent(event);
  } catch {
    // Audit failures must never propagate
  }
}

async function _persistKmsEvent(event: KmsAuditEvent): Promise<void> {
  try {
    const { getPersistentAuditService } = await import(
      "@/lib/security/audit-persistence/persistent-audit-service"
    );
    const svc = getPersistentAuditService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).recordEvent({
      orgSlug:   event.orgSlug,
      eventType: event.eventType,
      category:  "SECRET",
      severity:  event.success ? "MEDIUM" : "HIGH",
      resource:  { id: event.keyId, type: "KMS_KEY" },
      actor:     { id: event.subjectId, type: event.subjectType },
      metadata: {
        keyAlias:  event.keyAlias,
        operation: event.operation,
        reasons:   event.reasons,
      },
    });
  } catch {
    // Persistence failures must never propagate
  }
}
