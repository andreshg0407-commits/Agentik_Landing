/**
 * lib/security/anomaly/detectors/agent-anomaly-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Agent Security Anomaly Detector
 *
 * Server-only. Monitors Luca, Diego, Mila, Laura, Sofía, Pablo.
 * Detects AGENT_PERMISSION_VIOLATION and UNUSUAL_ACTIVITY.
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
import { MONITORED_AGENT_IDS } from "../anomaly-types";

let _idCounter = 0;
function _id(): string { return `aad-${Date.now()}-${++_idCounter}`; }

export class AgentAnomalyDetector implements AnomalyDetector {
  readonly id = "agent-anomaly-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const agentId = context.agentId ?? context.eventData["agentId"] as string | undefined;
      if (!agentId) {
        return { ok: true, value: [] };
      }

      const isMonitored = MONITORED_AGENT_IDS.includes(agentId.toLowerCase());
      const signals: AnomalySignal[] = [];
      const now = context.timestamp;

      // ── Permission Violation ─────────────────────────────────────────────────
      const isPermissionViolation =
        context.eventData["agentViolation"] === true ||
        context.eventData["outcomeType"] === "PERMISSION_DENIED" ||
        context.eventData["capabilityViolation"] === true;

      if (isPermissionViolation) {
        signals.push({
          id:          _id(),
          type:        "AGENT_PERMISSION_VIOLATION",
          orgSlug:     context.orgSlug,
          agentId,
          userId:      context.userId,
          sessionId:   context.sessionId,
          resource:    context.resource,
          severity:    "HIGH",
          weight:      80,
          reason:      `Agent ${agentId} attempted operation outside its declared capabilities`,
          metadata:    {
            agentId,
            isMonitoredAgent: isMonitored,
            operation:        context.operation,
            resource:         context.resource,
            violationType:    context.eventData["violationType"],
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      // ── Tool Abuse — Repeated Violations ─────────────────────────────────────
      if (isMonitored && context.userId) {
        const windowStart = new Date(new Date(now).getTime() - 60 * 60 * 1000).toISOString(); // 1h
        const priorViolations = history.filter(s =>
          s.orgSlug === context.orgSlug &&
          s.agentId === agentId &&
          s.type === "AGENT_PERMISSION_VIOLATION" &&
          s.occurredAt >= windowStart,
        ).length;

        if (priorViolations >= 3) {
          signals.push({
            id:          _id(),
            type:        "UNUSUAL_ACTIVITY",
            orgSlug:     context.orgSlug,
            agentId,
            userId:      context.userId,
            severity:    "HIGH",
            weight:      70,
            reason:      `Agent ${agentId} has ${priorViolations + 1} permission violations in 1h — possible tool abuse`,
            metadata:    {
              category:         "AGENT_TOOL_ABUSE",
              agentId,
              violationCount:   priorViolations + 1,
              isMonitoredAgent: isMonitored,
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart,
            windowEnd:   now,
          });
        }
      }

      // ── Cross-Domain Misuse ───────────────────────────────────────────────────
      const isCrossDomain = context.eventData["isCrossDomainAccess"] === true;
      if (isCrossDomain) {
        signals.push({
          id:          _id(),
          type:        "UNUSUAL_ACTIVITY",
          orgSlug:     context.orgSlug,
          agentId,
          userId:      context.userId,
          severity:    "MEDIUM",
          weight:      50,
          reason:      `Agent ${agentId} attempted cross-domain resource access`,
          metadata:    {
            category:         "AGENT_CROSS_DOMAIN",
            agentId,
            sourceDomain:     context.eventData["sourceDomain"],
            targetDomain:     context.eventData["targetDomain"],
            isMonitoredAgent: isMonitored,
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "agent_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "AGENT_PERMISSION_VIOLATION" || type === "UNUSUAL_ACTIVITY";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Agent Security Anomaly Detector",
      description: "Monitors Luca, Diego, Mila, Laura, Sofía, Pablo for permission violations, tool abuse, and cross-domain misuse.",
      detects:     ["AGENT_PERMISSION_VIOLATION", "UNUSUAL_ACTIVITY"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const agentAnomalyDetector = new AgentAnomalyDetector();
