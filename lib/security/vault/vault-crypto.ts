/**
 * vault-crypto.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Encryption Contract
 *
 * AES-256-GCM symmetric encryption for vault secrets.
 *
 * Key management:
 *   VAULT_MASTER_KEY — 32-byte hex string (64 hex chars) in environment.
 *   Must be set in all server environments. Never committed to repository.
 *   Generate with: openssl rand -hex 32
 *
 * Ciphertext format:
 *   base64( IV[12 bytes] || AuthTag[16 bytes] || Ciphertext[N bytes] )
 *   Total prefix overhead: 28 bytes before the actual ciphertext.
 *
 * Rotation:
 *   rotateSecret() decrypts with old key, re-encrypts with new key.
 *   Key version is tracked in EncryptedSecretEntry.keyVersion.
 *   Old key must be kept until all secrets have been rotated.
 *
 * Audit:
 *   hashSecretReference() produces a stable SHA-256 hash of the vault URI
 *   for use in audit logs — logs the reference without revealing content.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log plaintexts, keys, or vault://... URIs in full.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { VaultSecretPayload } from "./vault-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALGORITHM    = "aes-256-gcm" as const;
const IV_LENGTH    = 12;   // 96-bit IV (recommended for GCM)
const TAG_LENGTH   = 16;   // 128-bit GCM authentication tag
const KEY_LENGTH   = 32;   // 256-bit key
const KEY_VERSION  = 1;    // Current key version (increment on rotation)

// ── Master key loading ────────────────────────────────────────────────────────

/**
 * Load the master encryption key from environment.
 *
 * Throws VaultCryptoError if:
 *   - VAULT_MASTER_KEY is not set
 *   - Key is not exactly 64 hex chars (32 bytes)
 *
 * Never cache the key outside this function — load fresh per operation
 * so environment overrides take effect immediately.
 */
export function loadMasterKey(): Buffer {
  const keyHex = process.env["VAULT_MASTER_KEY"];
  if (!keyHex) {
    throw new VaultCryptoError(
      "VAULT_MASTER_KEY environment variable is not set. " +
      "Generate one with: openssl rand -hex 32",
    );
  }
  if (keyHex.length !== 64) {
    throw new VaultCryptoError(
      `VAULT_MASTER_KEY must be 64 hex characters (32 bytes). Got ${keyHex.length} characters.`,
    );
  }
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== KEY_LENGTH) {
    throw new VaultCryptoError(
      `VAULT_MASTER_KEY decoded to ${buf.length} bytes. Expected ${KEY_LENGTH}.`,
    );
  }
  return buf;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a VaultSecretPayload to a base64 ciphertext string.
 *
 * Plaintext is JSON.stringify(payload).
 * Ciphertext format: base64( IV[12] || AuthTag[16] || Ciphertext )
 *
 * @throws VaultCryptoError if VAULT_MASTER_KEY is not set or invalid.
 */
export function encryptSecret(payload: VaultSecretPayload): {
  ciphertext: string;
  keyVersion: number;
} {
  const key        = loadMasterKey();
  const iv         = randomBytes(IV_LENGTH);
  const plaintext  = JSON.stringify(payload);

  let cipher;
  try {
    cipher = createCipheriv(ALGORITHM, key, iv);
  } catch (err) {
    throw new VaultCryptoError(
      `Failed to create cipher: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV || AuthTag || Ciphertext → base64
  const packed = Buffer.concat([iv, authTag, encrypted]);

  return {
    ciphertext: packed.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

/**
 * Decrypt a ciphertext string back to a VaultSecretPayload.
 *
 * Expects ciphertext in format: base64( IV[12] || AuthTag[16] || Ciphertext ).
 *
 * @throws VaultCryptoError on any decryption failure (bad key, tampered data, etc.)
 */
export function decryptSecret(ciphertext: string): VaultSecretPayload {
  const key = loadMasterKey();

  let buf: Buffer;
  try {
    buf = Buffer.from(ciphertext, "base64");
  } catch {
    throw new VaultCryptoError("Ciphertext is not valid base64.");
  }

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new VaultCryptoError(
      `Ciphertext is too short (${buf.length} bytes). ` +
      `Minimum is ${IV_LENGTH + TAG_LENGTH + 1} bytes.`,
    );
  }

  const iv         = buf.subarray(0, IV_LENGTH);
  const authTag    = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted  = buf.subarray(IV_LENGTH + TAG_LENGTH);

  let decipher;
  try {
    decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
  } catch (err) {
    throw new VaultCryptoError(
      `Failed to create decipher: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  let plaintext: string;
  try {
    plaintext = decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    // GCM auth tag failure — ciphertext has been tampered with or wrong key
    throw new VaultCryptoError(
      "Decryption failed — ciphertext authentication failed. " +
      "The data may be tampered with or the wrong key is being used.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    throw new VaultCryptoError("Decrypted data is not valid JSON.");
  }

  if (!isVaultSecretPayload(payload)) {
    throw new VaultCryptoError(
      "Decrypted data does not match a known VaultSecretPayload shape.",
    );
  }

  return payload;
}

// ── Key rotation ──────────────────────────────────────────────────────────────

/**
 * Re-encrypt a ciphertext under a new key.
 *
 * Used during key rotation:
 *   1. Load old key into oldKey
 *   2. Set VAULT_MASTER_KEY to the new key
 *   3. Call rotateSecret(ciphertext, oldKey) for each EncryptedSecretEntry
 *   4. Update Integration.secretsJson with new ciphertexts + keyVersion
 *   5. Decommission the old key once all entries are rotated
 *
 * @param ciphertext  Existing ciphertext encrypted under oldKey
 * @param oldKey      32-byte Buffer of the previous master key
 * @returns           New ciphertext + incremented keyVersion
 */
export function rotateSecret(
  ciphertext:  string,
  oldKey:      Buffer,
  newKeyVersion: number,
): { ciphertext: string; keyVersion: number } {
  // Decrypt with old key
  const iv         = Buffer.from(ciphertext, "base64").subarray(0, IV_LENGTH);
  const authTag    = Buffer.from(ciphertext, "base64").subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted  = Buffer.from(ciphertext, "base64").subarray(IV_LENGTH + TAG_LENGTH);

  let plaintext: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, oldKey, iv);
    decipher.setAuthTag(authTag);
    plaintext = decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    throw new VaultCryptoError(
      "Key rotation failed — could not decrypt with the provided old key.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    throw new VaultCryptoError("Key rotation failed — decrypted data is not valid JSON.");
  }

  if (!isVaultSecretPayload(payload)) {
    throw new VaultCryptoError("Key rotation failed — decrypted data is not a valid payload.");
  }

  // Re-encrypt with new key (from VAULT_MASTER_KEY env)
  const result = encryptSecret(payload);
  return { ciphertext: result.ciphertext, keyVersion: newKeyVersion };
}

// ── Reference hashing ─────────────────────────────────────────────────────────

/**
 * Produce a stable, non-reversible hash of a vault URI for audit logs.
 *
 * The hash identifies the reference without revealing the URI content.
 * Suitable for log files, audit tables, and error messages.
 *
 * @param uri  vault://orgId/provider/secretId
 * @returns    First 16 hex chars of SHA-256(uri)
 */
export function hashSecretReference(uri: string): string {
  return createHash("sha256").update(uri, "utf8").digest("hex").slice(0, 16);
}

// ── Type guard ────────────────────────────────────────────────────────────────

/**
 * Runtime type guard for VaultSecretPayload.
 * Checks that the object has a recognized `type` discriminant.
 */
export function isVaultSecretPayload(value: unknown): value is VaultSecretPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const KNOWN_TYPES: VaultSecretPayload["type"][] = [
    "dian_certificate", "dian_software_pin", "api_token", "oauth_token",
    "webhook_secret", "banking_credential", "meta_token", "shopify_token", "tiktok_token",
  ];
  return KNOWN_TYPES.includes(obj["type"] as VaultSecretPayload["type"]);
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class VaultCryptoError extends Error {
  constructor(message: string) {
    super(`[VaultCrypto] ${message}`);
    this.name = "VaultCryptoError";
  }
}
