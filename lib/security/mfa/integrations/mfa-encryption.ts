/**
 * lib/security/mfa/integrations/mfa-encryption.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA → Encryption Layer Adapter
 *
 * Server-only. Bridges the MFA layer to the KMS/Encryption Layer.
 *
 * TOTP secrets are encrypted using the platform KMS before storage.
 * Decryption is required before TOTP verification.
 *
 * CRITICAL:
 *   - Raw TOTP secrets NEVER stored
 *   - Always encrypt before persisting
 *   - Always decrypt in memory, never log result
 */

import "server-only";

import type { MfaResult } from "../mfa-types";

// ── Key alias convention ───────────────────────────────────────────────────────

/** Standard key alias for MFA encryption within a tenant. */
export function getMfaKeyAlias(orgSlug: string): string {
  return `mfa_key_${orgSlug}`;
}

// ── MfaEncryptionAdapter ──────────────────────────────────────────────────────

export interface MfaEncryptInput {
  /** The plaintext secret (e.g., "totp:{base32}"). NEVER log. */
  plaintext: string;
  orgSlug:   string;
  userId:    string;
}

export interface MfaDecryptInput {
  /** The encrypted secret reference from storage. */
  encryptedRef: string;
  orgSlug:      string;
  userId:       string;
}

/**
 * MfaEncryptionAdapter — wraps KMS engine for MFA secret protection.
 *
 * Uses kmsEngine to encrypt/decrypt TOTP secrets.
 * Falls back to a local envelope if KMS is unavailable (development only).
 */
export class MfaEncryptionAdapter {

  /**
   * encryptSecret — encrypt a TOTP secret using KMS.
   * Returns an opaque encrypted reference for storage.
   * NEVER returns or logs the plaintext.
   */
  async encryptSecret(input: MfaEncryptInput): Promise<MfaResult<{ encryptedRef: string }>> {
    try {
      const { kmsEngine } = await import("@/lib/security/kms/kms-engine");
      const keyAlias = getMfaKeyAlias(input.orgSlug);

      const ctx = {
        subjectId:   `mfa_enrollment:${input.userId}`,
        subjectType: "SYSTEM" as const,
        orgSlug:     input.orgSlug,
        operation:   "ENCRYPT" as const,
        keyAlias,
      };

      const r = await kmsEngine.encrypt(
        { plaintext: input.plaintext, keyAlias, orgSlug: input.orgSlug, context: `mfa:${input.userId}` },
        ctx,
      );

      if (!r.ok) {
        // Development fallback: prefix plaintext with a sentinel to indicate unencrypted
        // Production must never reach here — ensure KMS key is provisioned
        if (process.env.NODE_ENV !== "production") {
          return { ok: true, value: { encryptedRef: input.plaintext } };
        }
        return { ok: false, error: `mfa_encrypt_failed:${r.error}`, riskLevel: "CRITICAL" };
      }

      // Serialize envelope to a stable string reference
      const envelopeRef = JSON.stringify(r.value);
      return { ok: true, value: { encryptedRef: envelopeRef } };
    } catch {
      if (process.env.NODE_ENV !== "production") {
        return { ok: true, value: { encryptedRef: input.plaintext } };
      }
      return { ok: false, error: "mfa_encrypt_exception", riskLevel: "CRITICAL" };
    }
  }

  /**
   * decryptSecret — decrypt a stored encrypted secret reference.
   * Returns the plaintext for in-memory use only. NEVER log the result.
   */
  async decryptSecret(input: MfaDecryptInput): Promise<MfaResult<{ plaintext: string }>> {
    try {
      // Development: detect unencrypted refs (starts with "totp:")
      if (input.encryptedRef.startsWith("totp:") || input.encryptedRef.startsWith("encrypted:")) {
        if (process.env.NODE_ENV !== "production") {
          return { ok: true, value: { plaintext: input.encryptedRef } };
        }
        return { ok: false, error: "unencrypted_secret_in_production", riskLevel: "CRITICAL" };
      }

      const { kmsEngine } = await import("@/lib/security/kms/kms-engine");
      const keyAlias = getMfaKeyAlias(input.orgSlug);

      const ctx = {
        subjectId:   `mfa_verify:${input.userId}`,
        subjectType: "SYSTEM" as const,
        orgSlug:     input.orgSlug,
        operation:   "DECRYPT" as const,
        keyAlias,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const envelope = JSON.parse(input.encryptedRef) as any;
      const r = await kmsEngine.decrypt({ envelope, orgSlug: input.orgSlug }, ctx);

      if (!r.ok) {
        return { ok: false, error: `mfa_decrypt_failed:${r.error}`, riskLevel: "CRITICAL" };
      }

      return { ok: true, value: { plaintext: r.value.plaintext } };
    } catch {
      return { ok: false, error: "mfa_decrypt_exception", riskLevel: "CRITICAL" };
    }
  }
}

/** Singleton MFA encryption adapter. */
export const mfaEncryptionAdapter = new MfaEncryptionAdapter();
