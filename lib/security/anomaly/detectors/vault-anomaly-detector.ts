/**
 * lib/security/anomaly/detectors/vault-anomaly-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Vault Access Spike / Enumeration Detector
 *
 * Server-only. Detects VAULT_ACCESS_SPIKE anomalies.
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
function _id(): string { return `vad-${Date.now()}-${++_idCounter}`; }

export class VaultAnomalyDetector implements AnomalyDetector {
  readonly id = "vault-anomaly-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const isVaultAccess =
        context.eventData["resource"] === "VAULT" ||
        context.eventData["isVaultAccess"] === true ||
        context.resource === "VAULT";

      if (!isVaultAccess) {
        return { ok: true, value: [] };
      }

      const policies = getPoliciesForType("VAULT_ACCESS_SPIKE");
      const now      = new Date(context.timestamp).getTime();
      const signals: AnomalySignal[] = [];

      for (const policy of policies) {
        const windowMs    = policy.windowSeconds * 1000;
        const windowStart = new Date(now - windowMs).toISOString();

        const recentAccesses = history.filter(s =>
          s.type === "VAULT_ACCESS_SPIKE" &&
          s.orgSlug === context.orgSlug &&
          (context.userId ? s.userId === context.userId : true) &&
          s.occurredAt >= windowStart,
        ).length;

        const total = recentAccesses + 1;

        if (total >= policy.threshold) {
          const isEnumeration = total >= 30;
          signals.push({
            id:          _id(),
            type:        "VAULT_ACCESS_SPIKE",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            resource:    "VAULT",
            severity:    policy.severity,
            weight:      policy.weight,
            reason:      isEnumeration
              ? `Possible Vault enumeration: ${total} accesses in ${policy.windowSeconds / 60}min`
              : `Vault access spike: ${total} accesses in ${policy.windowSeconds / 60}min (threshold: ${policy.threshold})`,
            metadata:    {
              policyId:       policy.id,
              accessCount:    total,
              threshold:      policy.threshold,
              windowSeconds:  policy.windowSeconds,
              isEnumeration,
              secretAlias:    context.eventData["secretAlias"],
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
      return { ok: false, error: "vault_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "VAULT_ACCESS_SPIKE";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Vault Anomaly Detector",
      description: "Detects Vault access spikes and possible secret enumeration attempts.",
      detects:     ["VAULT_ACCESS_SPIKE"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const vaultAnomalyDetector = new VaultAnomalyDetector();
