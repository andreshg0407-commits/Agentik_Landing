/**
 * lib/security/vault/vault-service-audit.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Service Audit Log
 *
 * In-memory audit log for VaultService operations.
 * Distinct from vault-audit.ts (AGENTIK-SECURE-VAULT-01) which covers
 * the integration-based vault.
 *
 * Persistence deferred to AGENTIK-SECURITY-AUDIT-PERSISTENCE-01.
 *
 * IMPORTANT: Pure domain file — no server-only, no Prisma, no React.
 * All timestamps are ISO 8601 strings (no Date in domain fields).
 */

import type { VaultSecretKind } from "./vault-secret-record";

// ── Event types ───────────────────────────────────────────────────────────────

export type VaultServiceEventType =
  // CRUD lifecycle
  | "SECRET_CREATED"
  | "SECRET_READ"
  | "SECRET_UPDATED"
  | "SECRET_DISABLED"
  | "SECRET_REVOKED"
  | "SECRET_DELETED"
  | "ACCESS_DENIED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  // AGENTIK-SECURITY-VAULT-MIGRATION-01 — resolution audit
  | "SECRET_RESOLVED_FROM_VAULT"    // resolved from new VaultService
  | "SECRET_RESOLVED_FROM_LEGACY"   // resolved from Integration.secretsJson or legacy store
  | "SECRET_RESOLVED_FROM_ENV"      // resolved from process.env (deprecated path)
  | "SECRET_MIGRATION_WARNING";     // shadow mode divergence or legacy/env fallback warning

// ── Audit event ───────────────────────────────────────────────────────────────

/**
 * VaultServiceAuditEvent — structured audit record for a vault operation.
 * All fields are safe to log — never contains raw secret values.
 */
export interface VaultServiceAuditEvent {
  /** Unique event ID. */
  id:              string;
  /** Org that owns the secret. */
  orgSlug:         string;
  /** Event type. */
  eventType:       VaultServiceEventType;
  /** Secret ID (if known at event time). */
  secretId?:       string;
  /** Secret kind (never the value). */
  secretKind?:     VaultSecretKind;
  /** Actor who triggered the event. */
  actorId:         string;
  /** Actor type. */
  actorType:       string;
  /** Whether the operation succeeded. */
  success:         boolean;
  /** Failure reason if success=false. Never includes secret content. */
  failureReason?:  string;
  /** Operation duration in milliseconds. */
  durationMs:      number;
  /** ISO 8601 timestamp — set by VaultServiceAuditLog.record(). */
  occurredAt:      string;
  /** Optional request ID for distributed tracing. */
  requestId?:      string;
}

// ── Counter ───────────────────────────────────────────────────────────────────

let _eventCounter = 0;

function nextEventId(): string {
  _eventCounter += 1;
  return `vsvc-${Date.now()}-${String(_eventCounter).padStart(6, "0")}`;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export class VaultServiceAuditLog {
  private readonly _events: VaultServiceAuditEvent[] = [];

  /** Record a new audit event. Adds id and occurredAt automatically. */
  record(
    event: Omit<VaultServiceAuditEvent, "id" | "occurredAt">,
  ): VaultServiceAuditEvent {
    const full: VaultServiceAuditEvent = {
      ...event,
      id:         nextEventId(),
      occurredAt: new Date().toISOString(),
    };
    this._events.push(full);
    return full;
  }

  /** Return a defensive copy of all events. */
  getEvents(): VaultServiceAuditEvent[] {
    return [...this._events];
  }

  /** Return events for a specific org. */
  getEventsForOrg(orgSlug: string): VaultServiceAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  /** Return events of a specific type. */
  getEventsByType(eventType: VaultServiceEventType): VaultServiceAuditEvent[] {
    return this._events.filter(e => e.eventType === eventType);
  }

  /** Return failed events only. */
  getFailedEvents(): VaultServiceAuditEvent[] {
    return this._events.filter(e => !e.success);
  }

  /** Total event count. */
  count(): number {
    return this._events.length;
  }

  /** Serialize to plain JSON array. */
  toJSON(): VaultServiceAuditEvent[] {
    return this.getEvents();
  }

  /** Clear all events (for testing). */
  clear(): void {
    this._events.length = 0;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global audit log singleton — exported from server.ts only. */
export const globalVaultServiceAuditLog = new VaultServiceAuditLog();

// ── Persistent Adapter (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01) ───────────────

/**
 * PersistentVaultAuditAdapter
 *
 * Bridge from VaultServiceAuditLog (in-memory) to the persistent audit layer.
 * In-memory recording continues unchanged.
 * Persistence is fire-and-forget — never blocks the vault operation.
 *
 * NEVER persists secret values, tokens, certificates, or passwords.
 * Only metadata (eventType, secretId, secretKind, actor, success, duration).
 */
export class PersistentVaultAuditAdapter {
  constructor(private readonly memoryLog: VaultServiceAuditLog) {}

  /**
   * Record to in-memory log immediately, then persist asynchronously.
   * Returns the recorded event. Never throws.
   */
  record(
    event: Omit<VaultServiceAuditEvent, "id" | "occurredAt">,
  ): VaultServiceAuditEvent {
    const full = this.memoryLog.record(event);
    void this._persist(full);
    return full;
  }

  private async _persist(event: VaultServiceAuditEvent): Promise<void> {
    try {
      const { getPersistentAuditService } = await import(
        "@/lib/security/audit-persistence/persistent-audit-service"
      );
      const svc = getPersistentAuditService();
      await svc.recordEvent({
        orgSlug:   event.orgSlug,
        eventType: event.eventType as any,
        category:  "VAULT",
        severity:  event.eventType === "SECRET_READ" ? "HIGH" :
                   event.eventType === "SECRET_CREATED" ? "HIGH" :
                   event.eventType === "ACCESS_DENIED" ? "CRITICAL" :
                   event.eventType.includes("MIGRATION") ? "MEDIUM" : "LOW",
        resource:  event.secretId
          ? { id: event.secretId, type: event.secretKind ?? "SECRET" }
          : undefined,
        actor:     { id: event.actorId, type: event.actorType as any },
        metadata:  {
          success:       event.success,
          durationMs:    event.durationMs,
          failureReason: event.failureReason,
          requestId:     event.requestId,
          // CRITICAL: secretKind is metadata (not value), safe to store
          secretKind:    event.secretKind,
        },
      });
    } catch {
      // Persistence failures must never propagate
    }
  }
}

/** Global persistent vault audit adapter. */
export const persistentVaultAuditAdapter = new PersistentVaultAuditAdapter(
  globalVaultServiceAuditLog,
);
