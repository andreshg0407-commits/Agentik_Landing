/**
 * lib/security/compliance/integrations/compliance-kms.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — KMS
 *
 * Converts KMS key management data into ComplianceEvidence for
 * CTRL_KEY_MANAGEMENT and CTRL_ENCRYPTION.
 *
 * No server-only. Pure domain adapter.
 * NEVER includes key material, key IDs, or raw cryptographic data.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildKmsEvidence } from "../evidence-engine";
import { CTRL_KEY_MANAGEMENT, CTRL_ENCRYPTION } from "../control-catalog";

// ── KmsComplianceInput ────────────────────────────────────────────────────────

export interface KmsComplianceInput {
  orgSlug:            string;
  keyCount:           number;
  rotatedCount:       number;
  hasRotationPolicy:  boolean;
  /** Number of keys with rotation overdue (>90 days). */
  overdueCount?:      number;
  /** Number of disabled/retired keys in the last 90 days. */
  retiredCount?:      number;
}

// ── kmsToComplianceEvidence ───────────────────────────────────────────────────

/**
 * kmsToComplianceEvidence — convert KMS metrics into compliance evidence.
 * Returns evidence for CTRL_KEY_MANAGEMENT and CTRL_ENCRYPTION.
 * NEVER exposes key aliases, IDs, or key material.
 */
export function kmsToComplianceEvidence(
  input: KmsComplianceInput,
): ComplianceEvidence[] {
  try {
    const kmsEvidence = buildKmsEvidence({
      orgSlug:           input.orgSlug,
      controlId:         CTRL_KEY_MANAGEMENT,
      keyCount:          input.keyCount,
      rotatedCount:      input.rotatedCount,
      hasRotationPolicy: input.hasRotationPolicy,
    });

    const encryptionCompliant = input.keyCount > 0;
    const encryptionEvidence: ComplianceEvidence = {
      id:           `cev_kms_enc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgSlug:      input.orgSlug,
      controlId:    CTRL_ENCRYPTION,
      source:       "KMS",
      isSupporting: encryptionCompliant,
      summary:      encryptionCompliant
        ? `KMS active: ${input.keyCount} keys managed, encryption infrastructure operational`
        : `KMS gap: no encryption keys configured — encryption may be inactive`,
      data: {
        keyCount:      input.keyCount,
        overdueCount:  input.overdueCount ?? 0,
        retiredCount:  input.retiredCount ?? 0,
        // Never include: keyAliases, keyIds, keyMaterial, algorithms
      },
      collectedAt:  new Date().toISOString(),
      expiresAt:    new Date(Date.now() + 90 * 86_400_000).toISOString(),
    };

    return [kmsEvidence, encryptionEvidence];
  } catch {
    return [];
  }
}

// ── isKmsCompliant ────────────────────────────────────────────────────────────

/**
 * isKmsCompliant — quick check: KMS has keys and rotation policy active.
 */
export function isKmsCompliant(input: KmsComplianceInput): boolean {
  return input.keyCount > 0 && input.hasRotationPolicy && (input.overdueCount ?? 0) === 0;
}
