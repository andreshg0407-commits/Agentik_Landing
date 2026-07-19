/**
 * lib/security/secret-rotation/rotation-audit.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Audit — Event Logging for Rotation Operations
 *
 * All rotation events are audit-logged:
 *   - ROTATION_REQUESTED
 *   - ROTATION_STARTED
 *   - ROTATION_VALIDATED
 *   - ROTATION_ACTIVATED
 *   - ROTATION_REVOKED
 *   - ROTATION_FAILED
 *   - ROTATION_CANCELLED
 *
 * Principles:
 *   - NEVER log secret values
 *   - NEVER log key material
 *   - Fire-and-forget: never blocks callers
 *   - Metadata only
 *   - Multi-tenant: orgSlug required
 */

import type { RotationStrategy, SecretRotationStatus } from "./rotation-types";

// ── Event Types ───────────────────────────────────────────────────────────────

export type RotationAuditEventType =
  | "ROTATION_REQUESTED"
  | "ROTATION_STARTED"
  | "ROTATION_VALIDATED"
  | "ROTATION_ACTIVATED"
  | "ROTATION_REVOKED"
  | "ROTATION_FAILED"
  | "ROTATION_CANCELLED";

// ── Audit Event ───────────────────────────────────────────────────────────────

export interface RotationAuditEvent {
  /** Unique event ID. */
  id:           string;
  /** Event type. */
  type:         RotationAuditEventType;
  /** The rotation operation ID. */
  rotationId?:  string;
  /** The secret class being rotated (ID only — no value). */
  secretId:     string;
  /** The tenant scope. */
  orgSlug:      string;
  /** The actor performing the action. */
  actor:        string;
  /** The rotation strategy. */
  strategy?:    RotationStrategy;
  /** New status after this event. */
  newStatus?:   SecretRotationStatus;
  /** Machine-readable reason. */
  reason?:      string;
  /** Duration of the operation in ms (if applicable). */
  durationMs:   number;
  /** ISO 8601 timestamp. */
  occurredAt:   string;
}

// ── ID Generator ──────────────────────────────────────────────────────────────

function newEventId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── In-Memory Audit Log ───────────────────────────────────────────────────────

const MAX_SIZE = 2000;

class RotationAuditLog {
  private readonly _events: RotationAuditEvent[] = [];

  push(event: RotationAuditEvent): void {
    this._events.push(event);
    if (this._events.length > MAX_SIZE) {
      this._events.splice(0, this._events.length - MAX_SIZE);
    }
  }

  getByTenant(orgSlug: string, limit = 100): RotationAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug).slice(-limit);
  }

  getByRotation(rotationId: string): RotationAuditEvent[] {
    return this._events.filter(e => e.rotationId === rotationId);
  }

  getByType(type: RotationAuditEventType, limit = 100): RotationAuditEvent[] {
    return this._events.filter(e => e.type === type).slice(-limit);
  }

  getBySecret(orgSlug: string, secretId: string, limit = 50): RotationAuditEvent[] {
    return this._events
      .filter(e => e.orgSlug === orgSlug && e.secretId === secretId)
      .slice(-limit);
  }

  getFailures(orgSlug: string, limit = 50): RotationAuditEvent[] {
    return this._events
      .filter(e => e.orgSlug === orgSlug && e.type === "ROTATION_FAILED")
      .slice(-limit);
  }

  getRecent(limit = 100): RotationAuditEvent[] {
    return this._events.slice(-limit);
  }

  get size(): number { return this._events.length; }

  _reset(): void { this._events.length = 0; }
}

export const rotationAuditLog = new RotationAuditLog();

// ── Persistent Bridge ─────────────────────────────────────────────────────────

async function _persistEvent(event: RotationAuditEvent): Promise<void> {
  try {
    const { getPersistentAuditService } = await import("../audit-persistence/persistent-audit-service");
    const svc = getPersistentAuditService();
    await svc.recordEvent({
      eventType: "DATA_WRITE" as any,
      category:  "SECURITY" as any,
      severity:  (event.type === "ROTATION_FAILED" ? "HIGH" : "MEDIUM") as any,
      orgSlug:   event.orgSlug,
      metadata:  {
        rotationEventType: event.type,
        rotationId:        event.rotationId ?? null,
        secretId:          event.secretId,
        actor:             event.actor,
        strategy:          event.strategy ?? null,
        newStatus:         event.newStatus ?? null,
        reason:            event.reason ?? null,
        durationMs:        event.durationMs,
        // NEVER log secret values — only metadata
      },
    });
  } catch {
    // Swallow — never block caller
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRotationAuditEvent(
  params: Omit<RotationAuditEvent, "id" | "occurredAt">,
): RotationAuditEvent {
  return {
    ...params,
    id:         newEventId(),
    occurredAt: new Date().toISOString(),
  };
}

// ── Emit Helpers ──────────────────────────────────────────────────────────────

export function emitRotationRequested(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
  strategy:   RotationStrategy;
  reason:     string;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_REQUESTED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    strategy:   params.strategy,
    newStatus:  "PENDING",
    reason:     params.reason,
    durationMs: 0,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationStarted(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_STARTED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "VALIDATING",
    durationMs: 0,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationValidated(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_VALIDATED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "READY",
    durationMs: 0,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationActivated(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
  durationMs: number;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_ACTIVATED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "ACTIVE",
    durationMs: params.durationMs,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationRevoked(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
  durationMs: number;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_REVOKED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "REVOKED",
    durationMs: params.durationMs,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationFailed(params: {
  rotationId?: string;
  secretId:    string;
  orgSlug:     string;
  actor:       string;
  reason:      string;
  durationMs:  number;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_FAILED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "FAILED",
    reason:     params.reason,
    durationMs: params.durationMs,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}

export function emitRotationCancelled(params: {
  rotationId: string;
  secretId:   string;
  orgSlug:    string;
  actor:      string;
  reason:     string;
}): void {
  const event = createRotationAuditEvent({
    type:       "ROTATION_CANCELLED",
    rotationId: params.rotationId,
    secretId:   params.secretId,
    orgSlug:    params.orgSlug,
    actor:      params.actor,
    newStatus:  "CANCELLED",
    reason:     params.reason,
    durationMs: 0,
  });
  rotationAuditLog.push(event);
  void _persistEvent(event);
}
