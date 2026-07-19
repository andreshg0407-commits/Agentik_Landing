/**
 * lib/security/mfa/mfa-audit.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Audit — Event Recording for All MFA Operations
 *
 * Server-only. In-memory audit log + fire-and-forget persistence.
 *
 * CRITICAL CONSTRAINTS:
 *   - NEVER record OTP codes (any field named "code", "otp", "token")
 *   - NEVER record TOTP secrets or recovery codes
 *   - Only metadata: eventType, orgSlug, userId, method, success, reasons, timestamp
 *   - Never throws — all failures are silent
 */

import "server-only";

import type { MfaAuditEventType, MfaMethod } from "./mfa-types";

// ── MFA Audit Event ────────────────────────────────────────────────────────────

export interface MfaAuditEvent {
  id:          string;
  eventType:   MfaAuditEventType;
  orgSlug:     string;
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  method:      MfaMethod;
  success:     boolean;
  reasons:     string[];
  occurredAt:  string;
  /** Optional: the resource that triggered the MFA requirement. */
  resource?:   string;
}

// ── MFA Audit Input ────────────────────────────────────────────────────────────

export interface MfaAuditInput {
  eventType:   MfaAuditEventType;
  orgSlug:     string;
  subjectId:   string;
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  method:      MfaMethod;
  success:     boolean;
  reasons:     string[];
  resource?:   string;
}

// ── ID Generator ───────────────────────────────────────────────────────────────

let _counter = 0;

function _generateMfaEventId(): string {
  _counter = (_counter + 1) % 1_000_000;
  return `mfa-${Date.now()}-${String(_counter).padStart(6, "0")}`;
}

// ── In-Memory Log ──────────────────────────────────────────────────────────────

class MfaAuditLog {
  private readonly _events: MfaAuditEvent[] = [];

  record(event: MfaAuditEvent): void {
    this._events.push(event);
  }

  getEvents(): MfaAuditEvent[] {
    return [...this._events];
  }

  getEventsForOrg(orgSlug: string): MfaAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  getEventsByType(eventType: MfaAuditEventType): MfaAuditEvent[] {
    return this._events.filter(e => e.eventType === eventType);
  }

  getFailedEvents(orgSlug?: string): MfaAuditEvent[] {
    return this._events.filter(e =>
      !e.success && (orgSlug ? e.orgSlug === orgSlug : true),
    );
  }

  getEventsForUser(orgSlug: string, userId: string): MfaAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug && e.subjectId === userId);
  }

  count(): number {
    return this._events.length;
  }

  /** Reset for testing only. */
  clear(): void {
    this._events.length = 0;
  }
}

export const mfaAuditLog = new MfaAuditLog();

// ── recordMfaEvent ─────────────────────────────────────────────────────────────

/**
 * recordMfaEvent — record an MFA audit event.
 *
 * Never throws. Never records codes or secrets.
 * Async to allow future persistence without blocking callers.
 */
export async function recordMfaEvent(input: MfaAuditInput): Promise<void> {
  try {
    // Sanitize reasons — reject any that look like they contain codes/secrets
    const safeReasons = _sanitizeReasons(input.reasons);

    const event: MfaAuditEvent = {
      id:          _generateMfaEventId(),
      eventType:   input.eventType,
      orgSlug:     input.orgSlug || "unknown",
      subjectId:   input.subjectId,
      subjectType: input.subjectType,
      method:      input.method,
      success:     input.success,
      reasons:     safeReasons,
      occurredAt:  new Date().toISOString(),
      resource:    input.resource,
    };

    mfaAuditLog.record(event);

    // Fire-and-forget persistence
    void _persistMfaEvent(event);
  } catch {
    // Audit failures must never propagate
  }
}

async function _persistMfaEvent(event: MfaAuditEvent): Promise<void> {
  try {
    const { getPersistentAuditService } = await import(
      "@/lib/security/audit-persistence/persistent-audit-service"
    );
    const svc = getPersistentAuditService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).recordEvent({
      orgSlug:   event.orgSlug,
      eventType: event.eventType,
      category:  "AUTHENTICATION",
      severity:  event.success ? "MEDIUM" : "HIGH",
      resource:  { id: event.subjectId, type: "USER_IDENTITY" },
      actor:     { id: event.subjectId, type: event.subjectType },
      metadata: {
        method:   event.method,
        reasons:  event.reasons,
        resource: event.resource,
      },
    });
  } catch {
    // Persistence failures must never propagate
  }
}

// ── Sanitize helpers ───────────────────────────────────────────────────────────

/** Remove any reason strings that look like they contain OTP codes or secrets. */
function _sanitizeReasons(reasons: string[]): string[] {
  return reasons.map(r => {
    // Reject any reason containing numeric-only 6-digit sequences (possible OTP codes)
    if (/\b\d{6}\b/.test(r)) return "[REDACTED_POSSIBLE_CODE]";
    // Reject any reason containing base32-like strings > 20 chars (possible secrets)
    if (/\b[A-Z2-7]{20,}\b/.test(r)) return "[REDACTED_POSSIBLE_SECRET]";
    return r;
  });
}
