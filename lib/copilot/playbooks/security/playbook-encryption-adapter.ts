/**
 * lib/copilot/playbooks/security/playbook-encryption-adapter.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Playbooks Encryption Adapter
 *
 * Prepares the Playbook Engine for encryption.
 * Does NOT migrate existing data — data migration is deferred to
 * AGENTIK-SECURITY-ENCRYPTION-02.
 *
 * Flow:
 *   Playbook Engine
 *     ↓
 *   PlaybookEncryptionAdapter (this file)
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

// ── Playbook Field Policy ─────────────────────────────────────────────────────

/**
 * Playbook fields that require encryption before storage.
 */
export const PLAYBOOK_ENCRYPTED_FIELDS = ["content", "steps", "notes"] as const;
export type PlaybookEncryptedField = (typeof PLAYBOOK_ENCRYPTED_FIELDS)[number];

/**
 * Playbook categories that require encryption (sensitive business logic).
 */
export const PLAYBOOK_CATEGORIES_REQUIRING_ENCRYPTION = [
  "FINANCE",
  "EXECUTIVE",
  "OPERATIONS",
  "COLLECTIONS",
] as const;

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * PlaybookEncryptionAdapter — bridges the Playbook Engine to the Encryption Service.
 * Stateless. Delegates all crypto to EncryptionService.
 */
export class PlaybookEncryptionAdapter {
  private readonly _assetType = "PLAYBOOK";

  /**
   * Encrypt playbook content (body, steps, or notes).
   * Returns a JSON-serialized EncryptedEnvelope string for storage.
   * Returns null on failure.
   */
  encryptContent(content: string, orgSlug: string): string | null {
    try {
      const svc    = getEncryptionService();
      const result = svc.encrypt({
        plaintext:  content,
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
   * Decrypt a previously encrypted playbook content string.
   * Returns the plaintext on success, null on failure (fail-closed).
   * NEVER log the returned plaintext.
   */
  decryptContent(encryptedContent: string, orgSlug: string): string | null {
    try {
      const envelope = deserializeEnvelope(encryptedContent);
      if (!envelope) return null;
      const svc    = getEncryptionService();
      const result = svc.decrypt({ envelope, orgSlug });
      return result?.plaintext ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Determine whether a playbook category requires encryption.
   */
  requiresEncryption(category: string): boolean {
    return (PLAYBOOK_CATEGORIES_REQUIRING_ENCRYPTION as readonly string[]).includes(category);
  }

  /**
   * Check whether a string value is an encrypted playbook content.
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
  getEnvelope(encryptedContent: string): EncryptedEnvelope | null {
    return deserializeEnvelope(encryptedContent);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _adapter: PlaybookEncryptionAdapter | null = null;

/** Get the singleton PlaybookEncryptionAdapter instance. */
export function getPlaybookEncryptionAdapter(): PlaybookEncryptionAdapter {
  if (!_adapter) _adapter = new PlaybookEncryptionAdapter();
  return _adapter;
}
