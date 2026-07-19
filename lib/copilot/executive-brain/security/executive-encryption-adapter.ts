/**
 * lib/copilot/executive-brain/security/executive-encryption-adapter.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Executive Brain Encryption Adapter
 *
 * Prepares the Executive Brain for encryption of context snapshots.
 * Does NOT migrate existing data — data migration is deferred to
 * AGENTIK-SECURITY-ENCRYPTION-02.
 *
 * Flow:
 *   Executive Brain
 *     ↓
 *   ExecutiveEncryptionAdapter (this file)
 *     ↓
 *   EncryptionService
 *     ↓
 *   LocalAesGcmProvider (engine)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import { getEncryptionService } from "@/lib/security/encryption/encryption-service";
import {
  serializeEnvelope,
  deserializeEnvelope,
} from "@/lib/security/encryption/encryption-metadata";
import type { EncryptedEnvelope } from "@/lib/security/encryption/encryption-metadata";

// ── Executive Context Field Policy ────────────────────────────────────────────

/**
 * Executive context fields that require encryption.
 * Executive snapshots contain financial summaries and strategic priorities.
 */
export const EXECUTIVE_ENCRYPTED_FIELDS = [
  "contextSnapshot",
  "financialSummary",
  "prioritySummary",
  "signalContext",
] as const;
export type ExecutiveEncryptedField = (typeof EXECUTIVE_ENCRYPTED_FIELDS)[number];

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * ExecutiveEncryptionAdapter — bridges Executive Brain to the Encryption Service.
 * Stateless. Delegates all crypto to EncryptionService.
 */
export class ExecutiveEncryptionAdapter {
  private readonly _assetType = "EXECUTIVE_CONTEXT";

  /**
   * Encrypt an executive context snapshot.
   * Input should be JSON-serialized context data.
   * Returns a JSON-serialized EncryptedEnvelope string for storage.
   * Returns null on failure.
   */
  encryptContext(contextJson: string, orgSlug: string): string | null {
    try {
      const svc    = getEncryptionService();
      const result = svc.encrypt({
        plaintext:  contextJson,
        orgSlug,
        assetType:  this._assetType,
        schemaVersion: "1",
      });
      if (!result) return null;
      return serializeEnvelope(result.envelope);
    } catch {
      return null;
    }
  }

  /**
   * Decrypt a previously encrypted executive context snapshot.
   * Returns the plaintext JSON string on success, null on failure (fail-closed).
   * NEVER log the returned plaintext.
   */
  decryptContext(encryptedContext: string, orgSlug: string): string | null {
    try {
      const envelope = deserializeEnvelope(encryptedContext);
      if (!envelope) return null;
      const svc    = getEncryptionService();
      const result = svc.decrypt({ envelope, orgSlug });
      return result?.plaintext ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Encrypt an arbitrary executive data field.
   * General-purpose — can encrypt any string field in the executive domain.
   */
  encryptField(value: string, orgSlug: string): string | null {
    return this.encryptContext(value, orgSlug);
  }

  /**
   * Decrypt an arbitrary encrypted executive data field.
   */
  decryptField(encryptedValue: string, orgSlug: string): string | null {
    return this.decryptContext(encryptedValue, orgSlug);
  }

  /**
   * Check whether a string value is an encrypted executive context.
   * Structural check only — does not verify cryptographic integrity.
   */
  isEncrypted(value: string): boolean {
    try {
      const envelope = deserializeEnvelope(value);
      return envelope !== null && envelope.meta.assetType === this._assetType;
    } catch {
      return false;
    }
  }

  /**
   * Get the EncryptedEnvelope from a serialized string.
   * Returns null if not a valid envelope.
   */
  getEnvelope(encryptedContext: string): EncryptedEnvelope | null {
    return deserializeEnvelope(encryptedContext);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _adapter: ExecutiveEncryptionAdapter | null = null;

/** Get the singleton ExecutiveEncryptionAdapter instance. */
export function getExecutiveEncryptionAdapter(): ExecutiveEncryptionAdapter {
  if (!_adapter) _adapter = new ExecutiveEncryptionAdapter();
  return _adapter;
}
