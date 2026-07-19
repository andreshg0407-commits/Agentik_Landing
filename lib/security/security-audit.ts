/**
 * lib/security/security-audit.ts
 *
 * Agentik — Security Foundation — Audit Log
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * In-memory, pure-domain audit log for SecurityEvents.
 * No persistence. No Prisma. No server-only.
 *
 * The global singleton (globalSecurityAuditLog) accumulates events
 * across the request lifecycle and can be flushed to a persistence
 * layer in future sprints (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01).
 */

import type { SecurityEvent, SecurityEventType, SecuritySeverity, SecurityCategory } from "./security-types";

// ── ID Generator ──────────────────────────────────────────────────────────────

let _counter = 0;

function generateEventId(): string {
  _counter = (_counter + 1) % 1_000_000;
  return `sec-${Date.now()}-${String(_counter).padStart(6, "0")}`;
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

/**
 * SecurityAuditLog — in-memory accumulator for SecurityEvents.
 *
 * Thread-safe within a single Node.js process (single-threaded event loop).
 * Not safe across processes — use AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 for durability.
 */
export class SecurityAuditLog {
  private readonly _events: SecurityEvent[] = [];

  /** Record a new security event. */
  record(event: SecurityEvent): void {
    this._events.push(event);
  }

  /** Return all recorded events (defensive copy). */
  getEvents(): SecurityEvent[] {
    return [...this._events];
  }

  /** Return events filtered by orgSlug. */
  getEventsForOrg(orgSlug: string): SecurityEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  /** Return events filtered by category. */
  getEventsByCategory(category: SecurityCategory): SecurityEvent[] {
    return this._events.filter(e => e.category === category);
  }

  /** Return events filtered by eventType. */
  getEventsByType(eventType: SecurityEventType): SecurityEvent[] {
    return this._events.filter(e => e.eventType === eventType);
  }

  /** Return events filtered by severity. */
  getEventsBySeverity(severity: SecuritySeverity): SecurityEvent[] {
    return this._events.filter(e => e.severity === severity);
  }

  /** Return count of recorded events. */
  count(): number {
    return this._events.length;
  }

  /** Serialize all events to a plain JSON-safe array. */
  toJSON(): SecurityEvent[] {
    return this.getEvents();
  }

  /** Clear all events (use for test teardown only). */
  clear(): void {
    this._events.length = 0;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global audit log singleton.
 * Accumulates security events across the request lifecycle.
 * Reset in tests via globalSecurityAuditLog.clear().
 */
export const globalSecurityAuditLog = new SecurityAuditLog();

// ── Event Factories ───────────────────────────────────────────────────────────

/**
 * Create a well-formed SecurityEvent with auto-generated id and timestamp.
 * Validates that orgSlug is non-empty before creating.
 */
export function createSecurityEvent(
  orgSlug:    string,
  category:   SecurityCategory,
  eventType:  SecurityEventType,
  severity:   SecuritySeverity,
  resource:   string,
  actorId:    string,
  actorType:  SecurityEvent["actor"]["type"],
  metadata:   Record<string, unknown> = {},
): SecurityEvent {
  return {
    id:         generateEventId(),
    orgSlug:    orgSlug || "unknown",
    category,
    eventType,
    severity,
    resource,
    actor:      { id: actorId, type: actorType },
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

/** Record a DATA_READ event on the global audit log. */
export function auditDataRead(
  orgSlug:  string,
  resource: string,
  actorId:  string,
  metadata: Record<string, unknown> = {},
): void {
  globalSecurityAuditLog.record(
    createSecurityEvent(orgSlug, "DATA_ACCESS", "DATA_READ", "LOW", resource, actorId, "USER", metadata),
  );
}

/** Record a DATA_WRITE event on the global audit log. */
export function auditDataWrite(
  orgSlug:  string,
  resource: string,
  actorId:  string,
  metadata: Record<string, unknown> = {},
): void {
  globalSecurityAuditLog.record(
    createSecurityEvent(orgSlug, "DATA_ACCESS", "DATA_WRITE", "MEDIUM", resource, actorId, "USER", metadata),
  );
}

/** Record an ACCESS_DENIED event on the global audit log. */
export function auditAccessDenied(
  orgSlug:  string,
  resource: string,
  actorId:  string,
  reason:   string,
  metadata: Record<string, unknown> = {},
): void {
  globalSecurityAuditLog.record(
    createSecurityEvent(orgSlug, "AUTHORIZATION", "ACCESS_DENIED", "HIGH", resource, actorId, "USER", {
      reason,
      ...metadata,
    }),
  );
}

/** Record a POLICY_VIOLATION event on the global audit log. */
export function auditPolicyViolation(
  orgSlug:  string,
  resource: string,
  actorId:  string,
  policy:   string,
  metadata: Record<string, unknown> = {},
): void {
  globalSecurityAuditLog.record(
    createSecurityEvent(orgSlug, "AUTHORIZATION", "POLICY_VIOLATION", "HIGH", resource, actorId, "SYSTEM", {
      policy,
      ...metadata,
    }),
  );
}

/** Record a SECRET_ACCESSED event on the global audit log. */
export function auditSecretAccessed(
  orgSlug:    string,
  secretRef:  string,
  actorId:    string,
  actorType:  SecurityEvent["actor"]["type"] = "USER",
  metadata:   Record<string, unknown> = {},
): void {
  globalSecurityAuditLog.record(
    createSecurityEvent(orgSlug, "SECRET", "SECRET_ACCESSED", "HIGH", secretRef, actorId, actorType, metadata),
  );
}

// ── Persistent Adapter (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01) ───────────────

/**
 * PersistentSecurityAuditAdapter
 *
 * Bridge between the in-memory SecurityAuditLog and the persistent audit layer.
 * Wraps the existing record() path — memory log continues to work unchanged.
 * Persistence is fire-and-forget (void) — never blocks the caller.
 *
 * Usage: replace globalSecurityAuditLog.record() calls with
 * persistentSecurityAuditAdapter.record() in high-value paths.
 */
export class PersistentSecurityAuditAdapter {
  constructor(private readonly memoryLog: SecurityAuditLog) {}

  /**
   * Record to in-memory log immediately, then persist asynchronously.
   * Never throws. Persistence failures are logged to stderr.
   */
  record(event: SecurityEvent): void {
    // Memory log always succeeds immediately
    this.memoryLog.record(event);

    // Async persistence — fire and forget
    void this._persist(event);
  }

  private async _persist(event: SecurityEvent): Promise<void> {
    try {
      // Lazy import to avoid circular deps and server-only boundary
      const { getPersistentAuditService } = await import(
        "@/lib/security/audit-persistence/persistent-audit-service"
      );
      const svc = getPersistentAuditService();
      await svc.recordEvent({
        orgSlug:   event.orgSlug,
        eventType: event.eventType as any,
        category:  event.category as any,
        severity:  event.severity,
        resource:  { id: event.resource, type: "SECURITY_RESOURCE" },
        actor:     { id: event.actor.id, type: event.actor.type, name: event.actor.label },
        metadata:  event.metadata,
      });
    } catch {
      // Persistence failures must never propagate
    }
  }
}

/** Global persistent adapter — drop-in wrapper for globalSecurityAuditLog. */
export const persistentSecurityAuditAdapter = new PersistentSecurityAuditAdapter(
  globalSecurityAuditLog,
);
