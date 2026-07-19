/**
 * lib/security/anomaly/detectors/kms-anomaly-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * KMS Usage Spike Detector
 *
 * Server-only. Detects KMS_USAGE_SPIKE anomalies.
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
function _id(): string { return `kad-${Date.now()}-${++_idCounter}`; }

export class KmsAnomalyDetector implements AnomalyDetector {
  readonly id = "kms-anomaly-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const isKmsOp =
        context.eventData["resource"] === "KMS" ||
        context.eventData["isKmsOperation"] === true ||
        context.resource === "KMS" ||
        (typeof context.eventData["keyAlias"] === "string");

      if (!isKmsOp) {
        return { ok: true, value: [] };
      }

      const policies = getPoliciesForType("KMS_USAGE_SPIKE");
      const now      = new Date(context.timestamp).getTime();
      const signals: AnomalySignal[] = [];

      for (const policy of policies) {
        const windowMs    = policy.windowSeconds * 1000;
        const windowStart = new Date(now - windowMs).toISOString();

        const recentOps = history.filter(s =>
          s.type === "KMS_USAGE_SPIKE" &&
          s.orgSlug === context.orgSlug &&
          s.occurredAt >= windowStart,
        ).length;

        const total = recentOps + 1;

        if (total >= policy.threshold) {
          signals.push({
            id:          _id(),
            type:        "KMS_USAGE_SPIKE",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            resource:    "KMS",
            severity:    policy.severity,
            weight:      policy.weight,
            reason:      `KMS usage spike: ${total} operations in ${policy.windowSeconds / 60}min (threshold: ${policy.threshold})`,
            metadata:    {
              policyId:       policy.id,
              operationCount: total,
              threshold:      policy.threshold,
              windowSeconds:  policy.windowSeconds,
              kmsOperation:   context.eventData["operation"],
              // Never log raw key material
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
      return { ok: false, error: "kms_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "KMS_USAGE_SPIKE";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "KMS Anomaly Detector",
      description: "Detects abnormal KMS operation volumes: encrypt/decrypt spikes and unusual key usage patterns.",
      detects:     ["KMS_USAGE_SPIKE"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const kmsAnomalyDetector = new KmsAnomalyDetector();
