/**
 * lib/security/anomaly/detectors/login-failure-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Login Failure Spike Detector
 *
 * Server-only. Detects LOGIN_FAILURE_SPIKE anomalies.
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
import { getPoliciesForType } from "../anomaly-policy";

let _idCounter = 0;
function _id(): string {
  return `lfd-${Date.now()}-${++_idCounter}`;
}

export class LoginFailureDetector implements AnomalyDetector {
  readonly id = "login-failure-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      // Only process login failure events
      const isLoginFailure =
        context.eventData["eventType"] === "LOGIN_FAILED" ||
        context.eventData["outcome"] === "FAILED" ||
        context.eventData["isLoginFailure"] === true;

      if (!isLoginFailure) {
        return { ok: true, value: [] };
      }

      const policies = getPoliciesForType("LOGIN_FAILURE_SPIKE");
      const now      = new Date(context.timestamp).getTime();
      const signals:  AnomalySignal[] = [];

      for (const policy of policies) {
        const windowMs = policy.windowSeconds * 1000;
        const windowStart = new Date(now - windowMs).toISOString();

        // Count login failure signals in window for this org + user
        const recentFailures = history.filter(s =>
          s.type === "LOGIN_FAILURE_SPIKE" &&
          s.orgSlug === context.orgSlug &&
          (context.userId ? s.userId === context.userId : true) &&
          s.occurredAt >= windowStart,
        ).length;

        // +1 for the current event
        const totalFailures = recentFailures + 1;

        if (totalFailures >= policy.threshold) {
          signals.push({
            id:          _id(),
            type:        "LOGIN_FAILURE_SPIKE",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    policy.severity,
            weight:      policy.weight,
            reason:      `${totalFailures} login failures in ${policy.windowSeconds / 60}min window (threshold: ${policy.threshold})`,
            metadata:    {
              policyId:        policy.id,
              failureCount:    totalFailures,
              threshold:       policy.threshold,
              windowSeconds:   policy.windowSeconds,
              ipAddress:       context.ipAddress,
              userAgent:       context.userAgent,
            },
            detectorId:  this.id,
            occurredAt:  context.timestamp,
            windowStart,
            windowEnd:   context.timestamp,
          });
        }
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "login_failure_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "LOGIN_FAILURE_SPIKE";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Login Failure Spike Detector",
      description: "Detects spikes in failed login attempts per user and org.",
      detects:     ["LOGIN_FAILURE_SPIKE"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const loginFailureDetector = new LoginFailureDetector();
