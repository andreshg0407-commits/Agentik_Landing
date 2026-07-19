/**
 * lib/security/anomaly/persistence/prisma-anomaly-repository.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Prisma Anomaly Repository — Database-Backed Persistence
 *
 * Server-only. Uses `prisma as any` until `prisma generate` is run
 * after the AnomalyAlert + AnomalySignal models are added to schema.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { AnomalyRepository } from "../anomaly-repository";
import type {
  AnomalyAlert,
  AnomalySignal,
  AnomalyStatus,
  AnomalyResult,
  AnomalyType,
  AnomalySeverity,
} from "../anomaly-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export class PrismaAnomalyRepository implements AnomalyRepository {

  // ── saveAlert ────────────────────────────────────────────────────────────────

  async saveAlert(alert: AnomalyAlert): Promise<AnomalyResult<AnomalyAlert>> {
    try {
      if (!alert.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };

      await db.anomalyAlert.upsert({
        where: { id: alert.id },
        create: {
          id:           alert.id,
          orgSlug:      alert.orgSlug,
          type:         alert.type,
          severity:     alert.severity,
          status:       alert.status,
          title:        alert.title,
          description:  alert.description,
          riskScore:    alert.riskScore,
          isCorrelated: alert.isCorrelated,
          sourceRule:   alert.sourceRule,
          metadata:     alert.metadata,
          createdAt:    new Date(alert.createdAt),
          updatedAt:    new Date(alert.updatedAt),
          resolvedAt:   alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          acknowledgedBy: alert.acknowledgedBy ?? null,
          resolvedBy:     alert.resolvedBy ?? null,
        },
        update: {
          status:        alert.status,
          updatedAt:     new Date(alert.updatedAt),
          resolvedAt:    alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          acknowledgedBy: alert.acknowledgedBy ?? null,
          resolvedBy:     alert.resolvedBy ?? null,
        },
      });

      return { ok: true, value: alert };
    } catch (e) {
      return { ok: false, error: `save_alert_failed: ${String(e)}`, severity: "HIGH" };
    }
  }

  // ── saveSignal ───────────────────────────────────────────────────────────────

  async saveSignal(signal: AnomalySignal): Promise<AnomalyResult<AnomalySignal>> {
    try {
      if (!signal.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };

      await db.anomalySignal.create({
        data: {
          id:          signal.id,
          orgSlug:     signal.orgSlug,
          type:        signal.type,
          severity:    signal.severity,
          weight:      signal.weight,
          reason:      signal.reason,
          detectorId:  signal.detectorId,
          metadata:    signal.metadata,
          occurredAt:  new Date(signal.occurredAt),
          windowStart: new Date(signal.windowStart),
          windowEnd:   new Date(signal.windowEnd),
          userId:      signal.userId   ?? null,
          agentId:     signal.agentId  ?? null,
          sessionId:   signal.sessionId ?? null,
          resource:    signal.resource ?? null,
        },
      });

      return { ok: true, value: signal };
    } catch (e) {
      return { ok: false, error: `save_signal_failed: ${String(e)}`, severity: "MEDIUM" };
    }
  }

  // ── getAlert ─────────────────────────────────────────────────────────────────

  async getAlert(orgSlug: string, alertId: string): Promise<AnomalyAlert | null> {
    try {
      const record = await db.anomalyAlert.findFirst({
        where:   { id: alertId, orgSlug },
        include: { signals: true },
      });
      if (!record) return null;
      return _mapAlert(record);
    } catch {
      return null;
    }
  }

  // ── getSignals ────────────────────────────────────────────────────────────────

  async getSignals(orgSlug: string, options: {
    type?:    AnomalyType;
    since?:   string;
    userId?:  string;
    agentId?: string;
    limit?:   number;
  } = {}): Promise<AnomalySignal[]> {
    try {
      const records = await db.anomalySignal.findMany({
        where: {
          orgSlug,
          ...(options.type    ? { type:    options.type }   : {}),
          ...(options.since   ? { occurredAt: { gte: new Date(options.since) } } : {}),
          ...(options.userId  ? { userId:  options.userId } : {}),
          ...(options.agentId ? { agentId: options.agentId } : {}),
        },
        orderBy: { occurredAt: "desc" },
        take:    options.limit ?? 500,
      });
      return records.map(_mapSignal);
    } catch {
      return [];
    }
  }

  // ── listAlerts ────────────────────────────────────────────────────────────────

  async listAlerts(orgSlug: string, options: {
    status?:   AnomalyStatus;
    severity?: AnomalySeverity;
    limit?:    number;
  } = {}): Promise<AnomalyAlert[]> {
    try {
      const records = await db.anomalyAlert.findMany({
        where: {
          orgSlug,
          ...(options.status   ? { status:   options.status }   : {}),
          ...(options.severity ? { severity: options.severity } : {}),
        },
        include:  { signals: true },
        orderBy:  { createdAt: "desc" },
        take:     options.limit ?? 100,
      });
      return records.map(_mapAlert);
    } catch {
      return [];
    }
  }

  // ── updateStatus ──────────────────────────────────────────────────────────────

  async updateStatus(
    orgSlug:  string,
    alertId:  string,
    status:   AnomalyStatus,
    actorId?: string,
  ): Promise<AnomalyResult<AnomalyAlert>> {
    try {
      const now = new Date();
      const record = await db.anomalyAlert.update({
        where:   { id: alertId, orgSlug },
        data:    {
          status,
          updatedAt:      now,
          resolvedAt:     status === "RESOLVED" ? now : undefined,
          acknowledgedBy: status === "ACKNOWLEDGED" ? (actorId ?? null) : undefined,
          resolvedBy:     status === "RESOLVED" ? (actorId ?? null) : undefined,
        },
        include: { signals: true },
      });
      return { ok: true, value: _mapAlert(record) };
    } catch (e) {
      return { ok: false, error: `update_status_failed: ${String(e)}`, severity: "HIGH" };
    }
  }

  // ── countOpenAlerts ───────────────────────────────────────────────────────────

  async countOpenAlerts(orgSlug: string): Promise<number> {
    try {
      return await db.anomalyAlert.count({
        where: { orgSlug, status: "OPEN" },
      });
    } catch {
      return 0;
    }
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _mapAlert(r: any): AnomalyAlert {
  return {
    id:              r.id,
    type:            r.type,
    orgSlug:         r.orgSlug,
    severity:        r.severity,
    status:          r.status,
    title:           r.title,
    description:     r.description,
    signals:         (r.signals ?? []).map(_mapSignal),
    riskScore:       r.riskScore,
    createdAt:       r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt:       r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    resolvedAt:      r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt ?? undefined,
    acknowledgedBy:  r.acknowledgedBy ?? undefined,
    resolvedBy:      r.resolvedBy ?? undefined,
    metadata:        r.metadata ?? {},
    isCorrelated:    r.isCorrelated,
    sourceRule:      r.sourceRule,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _mapSignal(r: any): AnomalySignal {
  return {
    id:          r.id,
    type:        r.type,
    orgSlug:     r.orgSlug,
    severity:    r.severity,
    weight:      r.weight,
    reason:      r.reason,
    detectorId:  r.detectorId,
    metadata:    r.metadata ?? {},
    occurredAt:  r.occurredAt instanceof Date ? r.occurredAt.toISOString() : r.occurredAt,
    windowStart: r.windowStart instanceof Date ? r.windowStart.toISOString() : r.windowStart,
    windowEnd:   r.windowEnd instanceof Date ? r.windowEnd.toISOString() : r.windowEnd,
    userId:      r.userId   ?? undefined,
    agentId:     r.agentId  ?? undefined,
    sessionId:   r.sessionId ?? undefined,
    resource:    r.resource ?? undefined,
  };
}

export const prismaAnomalyRepository = new PrismaAnomalyRepository();
