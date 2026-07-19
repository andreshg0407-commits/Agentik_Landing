/**
 * lib/security/anomaly/detectors/rbac-anomaly-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * RBAC Anomaly Detector — Privilege Escalation / Permission Abuse
 *
 * Server-only. Detects PRIVILEGE_ESCALATION and UNUSUAL_ACTIVITY.
 */

import "server-only";

import type { AnomalyDetector } from "../anomaly-detector";
import type {
  AnomalyContext,
  AnomalySignal,
  AnomalyType,
  AnomalyDetectorMetadata,
  AnomalyResult,
} from "../anomaly-types";

let _idCounter = 0;
function _id(): string { return `rad-${Date.now()}-${++_idCounter}`; }

export class RbacAnomalyDetector implements AnomalyDetector {
  readonly id = "rbac-anomaly-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const signals: AnomalySignal[] = [];
      const now     = context.timestamp;

      // ── Privilege Escalation ─────────────────────────────────────────────────
      const isPrivEsc =
        context.eventData["isPrivilegeEscalation"] === true ||
        context.eventData["rbacOutcome"] === "DENIED_ESCALATION" ||
        context.eventData["operation"] === "PRIVILEGE_ESCALATION";

      if (isPrivEsc) {
        signals.push({
          id:          _id(),
          type:        "PRIVILEGE_ESCALATION",
          orgSlug:     context.orgSlug,
          userId:      context.userId,
          sessionId:   context.sessionId,
          resource:    context.resource,
          severity:    "HIGH",
          weight:      75,
          reason:      `Privilege escalation attempt: user attempted to access resource above their permission level`,
          metadata:    {
            operation:      context.operation,
            resource:       context.resource,
            requiredRole:   context.eventData["requiredRole"],
            subjectRole:    context.eventData["subjectRole"],
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      // ── Denied Access Flood ───────────────────────────────────────────────────
      const isDenied = context.eventData["rbacOutcome"] === "DENIED" ||
                       context.eventData["accessDenied"] === true;

      if (isDenied && context.userId) {
        const windowStart = new Date(new Date(now).getTime() - 5 * 60 * 1000).toISOString();
        const denialCount = history.filter(s =>
          s.orgSlug === context.orgSlug &&
          s.userId === context.userId &&
          s.type === "UNUSUAL_ACTIVITY" &&
          s.metadata["category"] === "ACCESS_DENIAL" &&
          s.occurredAt >= windowStart,
        ).length;

        if (denialCount >= 5) {
          signals.push({
            id:          _id(),
            type:        "UNUSUAL_ACTIVITY",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    "MEDIUM",
            weight:      35,
            reason:      `Repeated access denials: ${denialCount + 1} denials in 5min window`,
            metadata:    {
              category:     "ACCESS_DENIAL",
              denialCount:  denialCount + 1,
              resource:     context.resource,
              operation:    context.operation,
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart,
            windowEnd:   now,
          });
        }
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "rbac_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "PRIVILEGE_ESCALATION" || type === "UNUSUAL_ACTIVITY";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "RBAC Anomaly Detector",
      description: "Detects privilege escalation attempts and repeated access denial floods.",
      detects:     ["PRIVILEGE_ESCALATION", "UNUSUAL_ACTIVITY"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const rbacAnomalyDetector = new RbacAnomalyDetector();
