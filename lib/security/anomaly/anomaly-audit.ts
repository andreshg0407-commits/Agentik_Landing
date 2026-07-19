/**
 * lib/security/anomaly/anomaly-audit.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Audit — Event Recording for All Detection Operations
 *
 * Server-only. In-memory audit log + fire-and-forget persistence.
 *
 * Events:
 *   ANOMALY_DETECTED
 *   ANOMALY_ACKNOWLEDGED
 *   ANOMALY_RESOLVED
 *   ANOMALY_IGNORED
 *   ANOMALY_CORRELATED
 *   ANOMALY_RISK_SCORED
 *
 * Never throws. Never logs raw secrets, OTP codes, or key material.
 */

import "server-only";

import type { AnomalyAuditEventType, AnomalySeverity, AnomalyType } from "./anomaly-types";

// ── AnomalyAuditEvent ─────────────────────────────────────────────────────────

export interface AnomalyAuditEvent {
  id:          string;
  eventType:   AnomalyAuditEventType;
  orgSlug:     string;
  alertId?:    string;
  signalId?:   string;
  type?:       AnomalyType;
  severity?:   AnomalySeverity;
  actorId?:    string;
  riskScore?:  number;
  reason?:     string;
  occurredAt:  string;   // ISO 8601
}

// ── AnomalyAuditInput ─────────────────────────────────────────────────────────

export interface AnomalyAuditInput {
  eventType:  AnomalyAuditEventType;
  orgSlug:    string;
  alertId?:   string;
  signalId?:  string;
  type?:      AnomalyType;
  severity?:  AnomalySeverity;
  actorId?:   string;
  riskScore?: number;
  reason?:    string;
}

// ── AnomalyAuditLog ───────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  _counter = (_counter + 1) % 1_000_000;
  return `anomaly-audit-${Date.now()}-${String(_counter).padStart(6, "0")}`;
}

class AnomalyAuditLog {
  private readonly _events: AnomalyAuditEvent[] = [];

  record(event: AnomalyAuditEvent): void {
    this._events.push(event);
  }

  getEvents(): AnomalyAuditEvent[] {
    return [...this._events];
  }

  getEventsForOrg(orgSlug: string): AnomalyAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  getEventsByType(eventType: AnomalyAuditEventType): AnomalyAuditEvent[] {
    return this._events.filter(e => e.eventType === eventType);
  }

  getEventsForAlert(alertId: string): AnomalyAuditEvent[] {
    return this._events.filter(e => e.alertId === alertId);
  }

  count(): number {
    return this._events.length;
  }
}

export const anomalyAuditLog = new AnomalyAuditLog();

// ── recordAnomalyEvent ────────────────────────────────────────────────────────

/**
 * recordAnomalyEvent — fire-and-forget audit recording.
 * Never throws. Audit failures are silent (never propagate).
 */
export async function recordAnomalyEvent(input: AnomalyAuditInput): Promise<void> {
  try {
    const event: AnomalyAuditEvent = {
      id:         _id(),
      eventType:  input.eventType,
      orgSlug:    input.orgSlug,
      alertId:    input.alertId,
      signalId:   input.signalId,
      type:       input.type,
      severity:   input.severity,
      actorId:    input.actorId,
      riskScore:  input.riskScore,
      reason:     input.reason,
      occurredAt: new Date().toISOString(),
    };

    anomalyAuditLog.record(event);

    // Fire-and-forget persistence (never awaited at call site)
    void _persistAnomalyEvent(event);
  } catch {
    // Audit failures NEVER propagate — detection must not be blocked by audit errors
  }
}

async function _persistAnomalyEvent(_event: AnomalyAuditEvent): Promise<void> {
  // Integration point: AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
  // Future: write to AuditLog Prisma table via audit persistence layer
  // For now: no-op (in-memory log is the record)
}
