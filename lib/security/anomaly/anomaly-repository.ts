/**
 * lib/security/anomaly/anomaly-repository.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Repository Contract + In-Memory Implementation
 *
 * No server-only. Pure interface contract + test implementation.
 * Prisma implementation: persistence/prisma-anomaly-repository.ts
 */

import type {
  AnomalyAlert,
  AnomalySignal,
  AnomalyStatus,
  AnomalyResult,
  AnomalyType,
  AnomalySeverity,
} from "./anomaly-types";

// ── AnomalyRepository ─────────────────────────────────────────────────────────

export interface AnomalyRepository {
  /** Save a new alert. */
  saveAlert(alert: AnomalyAlert): Promise<AnomalyResult<AnomalyAlert>>;

  /** Save a detection signal. */
  saveSignal(signal: AnomalySignal): Promise<AnomalyResult<AnomalySignal>>;

  /** Get alert by ID, scoped to org. */
  getAlert(orgSlug: string, alertId: string): Promise<AnomalyAlert | null>;

  /** Get signals for an org, optionally filtered by type and time window. */
  getSignals(orgSlug: string, options?: {
    type?:        AnomalyType;
    since?:       string;   // ISO 8601
    userId?:      string;
    agentId?:     string;
    limit?:       number;
  }): Promise<AnomalySignal[]>;

  /** List alerts for an org. */
  listAlerts(orgSlug: string, options?: {
    status?:   AnomalyStatus;
    severity?: AnomalySeverity;
    limit?:    number;
  }): Promise<AnomalyAlert[]>;

  /** Update alert status. */
  updateStatus(
    orgSlug:  string,
    alertId:  string,
    status:   AnomalyStatus,
    actorId?: string,
  ): Promise<AnomalyResult<AnomalyAlert>>;

  /** Count open alerts for an org. */
  countOpenAlerts(orgSlug: string): Promise<number>;
}

// ── InMemoryAnomalyRepository ─────────────────────────────────────────────────

export class InMemoryAnomalyRepository implements AnomalyRepository {
  private readonly _alerts  = new Map<string, AnomalyAlert>();
  private readonly _signals = new Map<string, AnomalySignal>();

  async saveAlert(alert: AnomalyAlert): Promise<AnomalyResult<AnomalyAlert>> {
    try {
      if (!alert.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      this._alerts.set(`${alert.orgSlug}::${alert.id}`, alert);
      return { ok: true, value: alert };
    } catch {
      return { ok: false, error: "save_alert_failed", severity: "HIGH" };
    }
  }

  async saveSignal(signal: AnomalySignal): Promise<AnomalyResult<AnomalySignal>> {
    try {
      if (!signal.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      this._signals.set(`${signal.orgSlug}::${signal.id}`, signal);
      return { ok: true, value: signal };
    } catch {
      return { ok: false, error: "save_signal_failed", severity: "MEDIUM" };
    }
  }

  async getAlert(orgSlug: string, alertId: string): Promise<AnomalyAlert | null> {
    return this._alerts.get(`${orgSlug}::${alertId}`) ?? null;
  }

  async getSignals(orgSlug: string, options: {
    type?:   AnomalyType;
    since?:  string;
    userId?: string;
    agentId?: string;
    limit?:  number;
  } = {}): Promise<AnomalySignal[]> {
    let results = Array.from(this._signals.values()).filter(s => s.orgSlug === orgSlug);
    if (options.type)    results = results.filter(s => s.type     === options.type);
    if (options.since)   results = results.filter(s => s.occurredAt >= options.since!);
    if (options.userId)  results = results.filter(s => s.userId   === options.userId);
    if (options.agentId) results = results.filter(s => s.agentId  === options.agentId);
    if (options.limit)   results = results.slice(0, options.limit);
    return results;
  }

  async listAlerts(orgSlug: string, options: {
    status?:   AnomalyStatus;
    severity?: AnomalySeverity;
    limit?:    number;
  } = {}): Promise<AnomalyAlert[]> {
    let results = Array.from(this._alerts.values()).filter(a => a.orgSlug === orgSlug);
    if (options.status)   results = results.filter(a => a.status   === options.status);
    if (options.severity) results = results.filter(a => a.severity === options.severity);
    if (options.limit)    results = results.slice(0, options.limit);
    return results;
  }

  async updateStatus(
    orgSlug:  string,
    alertId:  string,
    status:   AnomalyStatus,
    actorId?: string,
  ): Promise<AnomalyResult<AnomalyAlert>> {
    try {
      const existing = this._alerts.get(`${orgSlug}::${alertId}`);
      if (!existing) return { ok: false, error: "alert_not_found", severity: "HIGH" };
      const now     = new Date().toISOString();
      const updated: AnomalyAlert = {
        ...existing,
        status,
        updatedAt:       now,
        resolvedAt:      status === "RESOLVED" ? now : existing.resolvedAt,
        acknowledgedBy:  status === "ACKNOWLEDGED" ? actorId : existing.acknowledgedBy,
        resolvedBy:      status === "RESOLVED" ? actorId : existing.resolvedBy,
      };
      this._alerts.set(`${orgSlug}::${alertId}`, updated);
      return { ok: true, value: updated };
    } catch {
      return { ok: false, error: "update_status_failed", severity: "HIGH" };
    }
  }

  async countOpenAlerts(orgSlug: string): Promise<number> {
    return Array.from(this._alerts.values())
      .filter(a => a.orgSlug === orgSlug && a.status === "OPEN").length;
  }

  /** Testing helper — clear all data. */
  clear(): void {
    this._alerts.clear();
    this._signals.clear();
  }
}

export const inMemoryAnomalyRepository = new InMemoryAnomalyRepository();
