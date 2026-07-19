/**
 * lib/security/compliance/integrations/compliance-vault.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — Vault
 *
 * Converts Vault secret management data into ComplianceEvidence for
 * CTRL_ENCRYPTION and CTRL_SECRET_ROTATION.
 *
 * No server-only. Pure domain adapter.
 * NEVER includes secret values, plaintext, or key material.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildVaultEvidence } from "../evidence-engine";
import { CTRL_ENCRYPTION, CTRL_SECRET_ROTATION } from "../control-catalog";

// ── VaultComplianceInput ──────────────────────────────────────────────────────

export interface VaultComplianceInput {
  orgSlug:          string;
  secretCount:      number;
  encryptedCount:   number;
  hasAccessPolicy:  boolean;
  /** Number of secrets rotated in the last 90 days. */
  rotatedIn90Days?: number;
  /** Number of secrets with no rotation in >90 days (stale). */
  staleCount?:      number;
  /** True if rotation schedule is configured. */
  hasRotationSchedule?: boolean;
}

// ── vaultToComplianceEvidence ─────────────────────────────────────────────────

/**
 * vaultToComplianceEvidence — convert Vault metrics into compliance evidence.
 * Returns evidence for CTRL_ENCRYPTION and CTRL_SECRET_ROTATION.
 * NEVER exposes secret values — only counts and boolean flags.
 */
export function vaultToComplianceEvidence(
  input: VaultComplianceInput,
): ComplianceEvidence[] {
  try {
    const encryptionEvidence = buildVaultEvidence({
      orgSlug:         input.orgSlug,
      controlId:       CTRL_ENCRYPTION,
      secretCount:     input.secretCount,
      encryptedCount:  input.encryptedCount,
      hasAccessPolicy: input.hasAccessPolicy,
    });

    const rotationCompliant = (input.staleCount ?? 0) === 0 && (input.hasRotationSchedule ?? false);
    const rotationEvidence: ComplianceEvidence = {
      id:           `cev_vault_rot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgSlug:      input.orgSlug,
      controlId:    CTRL_SECRET_ROTATION,
      source:       "VAULT",
      isSupporting: rotationCompliant,
      summary:      rotationCompliant
        ? `Secret rotation active: ${input.rotatedIn90Days ?? 0} secrets rotated in last 90 days, schedule configured`
        : `Rotation gap: ${input.staleCount ?? 0} stale secrets (>90 days), schedule: ${input.hasRotationSchedule ?? false}`,
      data: {
        secretCount:        input.secretCount,
        rotatedIn90Days:    input.rotatedIn90Days ?? 0,
        staleCount:         input.staleCount ?? 0,
        hasRotationSchedule: input.hasRotationSchedule ?? false,
        // Never include: secretAliases, secretValues, keyMaterial
      },
      collectedAt:  new Date().toISOString(),
      expiresAt:    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };

    return [encryptionEvidence, rotationEvidence];
  } catch {
    return [];
  }
}

// ── isVaultCompliant ──────────────────────────────────────────────────────────

/**
 * isVaultCompliant — quick check: vault encryption + rotation are compliant.
 */
export function isVaultCompliant(input: VaultComplianceInput): boolean {
  const allEncrypted = input.secretCount > 0 && input.encryptedCount === input.secretCount;
  const rotationOk   = (input.staleCount ?? 0) === 0;
  return allEncrypted && input.hasAccessPolicy && rotationOk;
}
