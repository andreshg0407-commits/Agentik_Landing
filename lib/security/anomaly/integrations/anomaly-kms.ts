/**
 * lib/security/anomaly/integrations/anomaly-kms.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly ← KMS Integration
 *
 * Server-only. Consumes KMS usage events for anomaly detection.
 * Never logs key material.
 */

import "server-only";

import type { AnomalyContext } from "../anomaly-types";

// ── KMS Event Input ───────────────────────────────────────────────────────────

export interface KmsAnomalyEventInput {
  orgSlug:     string;
  userId?:     string;
  agentId?:    string;
  sessionId?:  string;
  operation:   "GENERATE" | "ENCRYPT" | "DECRYPT" | "ROTATE" | "DISABLE" | "LIST";
  keyAlias:    string;   // alias only — never raw key material
  success:     boolean;
  timestamp?:  string;
}

// ── kmsEventToAnomalyContext ──────────────────────────────────────────────────

/**
 * kmsEventToAnomalyContext — convert a KMS operation event to AnomalyContext.
 * NEVER includes raw key material — only alias and operation metadata.
 */
export function kmsEventToAnomalyContext(input: KmsAnomalyEventInput): AnomalyContext {
  return {
    orgSlug:    input.orgSlug,
    userId:     input.userId,
    agentId:    input.agentId,
    sessionId:  input.sessionId,
    resource:   "KMS",
    operation:  input.operation,
    timestamp:  input.timestamp ?? new Date().toISOString(),
    eventData:  {
      isKmsOperation: true,
      resource:       "KMS",
      operation:      input.operation,
      keyAlias:       input.keyAlias,  // alias only — never the key bytes
      success:        input.success,
      // Never include: rawKey, keyMaterial, keyBytes, encryptionKey
    },
  };
}

/**
 * isKmsRotationSpike — heuristic check for abnormal rotation activity.
 */
export function isKmsRotationSpike(
  operations: KmsAnomalyEventInput[],
  windowSeconds: number,
): boolean {
  try {
    const rotations = operations.filter(op => op.operation === "ROTATE");
    const cutoff    = new Date(Date.now() - windowSeconds * 1000);
    const recent    = rotations.filter(op => {
      const ts = op.timestamp ? new Date(op.timestamp) : new Date();
      return ts >= cutoff;
    });
    return recent.length >= 3;
  } catch {
    return false;
  }
}
