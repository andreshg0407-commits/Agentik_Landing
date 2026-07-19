/**
 * lib/security/anomaly/detectors/secret-rotation-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Secret Rotation Anomaly Detector
 *
 * Server-only. Detects SECRET_ROTATION_SPIKE anomalies.
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
function _id(): string { return `srd-${Date.now()}-${++_idCounter}`; }

export class SecretRotationDetector implements AnomalyDetector {
  readonly id = "secret-rotation-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const isRotationEvent =
        context.eventData["eventType"] === "SECRET_ROTATED" ||
        context.eventData["isSecretRotation"] === true ||
        context.eventData["operation"] === "ROTATE";

      if (!isRotationEvent) {
        return { ok: true, value: [] };
      }

      const policies = getPoliciesForType("SECRET_ROTATION_SPIKE");
      const now      = new Date(context.timestamp).getTime();
      const signals: AnomalySignal[] = [];

      for (const policy of policies) {
        const windowMs    = policy.windowSeconds * 1000;
        const windowStart = new Date(now - windowMs).toISOString();

        const recentRotations = history.filter(s =>
          s.type === "SECRET_ROTATION_SPIKE" &&
          s.orgSlug === context.orgSlug &&
          s.occurredAt >= windowStart,
        ).length;

        const total = recentRotations + 1;

        if (total >= policy.threshold) {
          signals.push({
            id:          _id(),
            type:        "SECRET_ROTATION_SPIKE",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    policy.severity,
            weight:      policy.weight,
            reason:      `Secret rotation spike: ${total} rotations in ${policy.windowSeconds / 60}min (possible sabotage)`,
            metadata:    {
              policyId:        policy.id,
              rotationCount:   total,
              threshold:       policy.threshold,
              windowSeconds:   policy.windowSeconds,
              rotationTarget:  context.eventData["secretAlias"],
              // Never log secret values
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
      return { ok: false, error: "secret_rotation_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "SECRET_ROTATION_SPIKE";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Secret Rotation Anomaly Detector",
      description: "Detects abnormal secret rotation rates — possible insider sabotage or automated attack.",
      detects:     ["SECRET_ROTATION_SPIKE"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const secretRotationDetector = new SecretRotationDetector();
