/**
 * lib/copilot/memory/security/memory-encryption-adapter.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Memory Engine Encryption Adapter
 *
 * Prepares the Copilot Memory Engine for encryption.
 * Does NOT migrate existing data — data migration is deferred to
 * AGENTIK-SECURITY-ENCRYPTION-02.
 *
 * Flow:
 *   Memory Engine
 *     ↓
 *   MemoryEncryptionAdapter (this file)
 *     ↓
 *   EncryptionService
 *     ↓
 *   LocalAesGcmProvider (engine)
 *
 * Adapter responsibilities:
 *   - Determine which memory fields require encryption
 *   - Encrypt content before storage (prepare path)
 *   - Decrypt content after retrieval (prepare path)
 *   - Delegate all cryptographic operations to EncryptionService
 *   - Never implement encryption logic directly
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

// ── Memory Field Policy ───────────────────────────────────────────────────────

/**
 * Memory fields that require encryption before storage.
 * STRATEGIC and PREFERENCE memories may contain sensitive business knowledge.
 */
export const MEMORY_ENCRYPTED_FIELDS = ["content", "summary"] as const;
export type MemoryEncryptedField = (typeof MEMORY_ENCRYPTED_FIELDS)[number];

/**
 * Memory types that require encryption.
 */
export const MEMORY_TYPES_REQUIRING_ENCRYPTION = [
  "STRATEGIC",
  "LEARNING",
] as const;

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * MemoryEncryptionAdapter — bridges the Memory Engine to the Encryption Service.
 * Stateless. Delegates all crypto to EncryptionService.
 */
export class MemoryEncryptionAdapter {
  private readonly _assetType = "COPILOT_MEMORY";

  /**
   * Encrypt a memory content string.
   * Returns a JSON-serialized EncryptedEnvelope string for storage.
   * Returns null on failure (fail-safe).
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
   * Decrypt a previously encrypted memory content string.
   * Input must be the JSON-serialized EncryptedEnvelope produced by encryptContent().
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
   * Determine whether a memory type requires encryption.
   */
  requiresEncryption(memoryType: string): boolean {
    return (MEMORY_TYPES_REQUIRING_ENCRYPTION as readonly string[]).includes(memoryType);
  }

  /**
   * Check whether a string value is an encrypted memory content.
   * Does not verify cryptographic integrity — structural check only.
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
   * Get the EncryptedEnvelope from a serialized string (for inspection).
   * Returns null if not a valid envelope.
   */
  getEnvelope(encryptedContent: string): EncryptedEnvelope | null {
    return deserializeEnvelope(encryptedContent);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _adapter: MemoryEncryptionAdapter | null = null;

/** Get the singleton MemoryEncryptionAdapter instance. */
export function getMemoryEncryptionAdapter(): MemoryEncryptionAdapter {
  if (!_adapter) _adapter = new MemoryEncryptionAdapter();
  return _adapter;
}
