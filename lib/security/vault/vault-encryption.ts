/**
 * lib/security/vault/vault-encryption.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — String-Level Encryption
 *
 * Wraps Node.js crypto primitives for raw string secret values.
 * The legacy vault-crypto.ts operates on typed VaultSecretPayload objects.
 * This module encrypts/decrypts arbitrary string values for the new vault.
 *
 * Algorithm: AES-256-GCM
 * Key:       VAULT_MASTER_KEY (32-byte hex, 64 hex chars) from environment
 * Format:    base64( IV[12 bytes] || AuthTag[16 bytes] || Ciphertext )
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log the plaintext value or the key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALGORITHM  = "aes-256-gcm" as const;
const IV_LENGTH  = 12;  // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;  // 128-bit GCM authentication tag
const KEY_LENGTH = 32;  // 256-bit key

// Current key version — increment on key rotation
const CURRENT_KEY_VERSION = 1;

// ── Key loading ────────────────────────────────────────────────────────────────

/**
 * Load the master encryption key from environment.
 * Never cache — load fresh per operation so env overrides take effect.
 * @throws VaultEncryptionError if VAULT_MASTER_KEY is missing or invalid
 */
function loadKey(): Buffer {
  const keyHex = process.env["VAULT_MASTER_KEY"];
  if (!keyHex) {
    throw new VaultEncryptionError(
      "VAULT_MASTER_KEY is not set. Generate with: openssl rand -hex 32",
    );
  }
  if (keyHex.length !== 64) {
    throw new VaultEncryptionError(
      `VAULT_MASTER_KEY must be 64 hex chars (32 bytes). Got ${keyHex.length}.`,
    );
  }
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== KEY_LENGTH) {
    throw new VaultEncryptionError(
      `VAULT_MASTER_KEY decoded to ${buf.length} bytes, expected ${KEY_LENGTH}.`,
    );
  }
  return buf;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a raw string secret value.
 *
 * @returns { ciphertext: base64(IV||AuthTag||Ciphertext), keyVersion }
 * @throws VaultEncryptionError if key is missing, invalid, or cipher creation fails
 */
export function encryptRawSecret(value: string): {
  ciphertext: string;
  keyVersion: number;
} {
  const key = loadKey();
  const iv  = randomBytes(IV_LENGTH);

  let cipher;
  try {
    cipher = createCipheriv(ALGORITHM, key, iv);
  } catch (err) {
    throw new VaultEncryptionError(
      `Failed to create cipher: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV || AuthTag || Ciphertext → base64
  const packed = Buffer.concat([iv, authTag, encrypted]);

  return {
    ciphertext: packed.toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * Decrypt a ciphertext back to the raw string secret value.
 *
 * @throws VaultEncryptionError on any failure (bad key, tampered data, wrong format)
 */
export function decryptRawSecret(ciphertext: string): string {
  const key = loadKey();

  let buf: Buffer;
  try {
    buf = Buffer.from(ciphertext, "base64");
  } catch {
    throw new VaultEncryptionError("Ciphertext is not valid base64.");
  }

  const minLength = IV_LENGTH + TAG_LENGTH + 1;
  if (buf.length < minLength) {
    throw new VaultEncryptionError(
      `Ciphertext too short (${buf.length} bytes). Minimum is ${minLength}.`,
    );
  }

  const iv        = buf.subarray(0, IV_LENGTH);
  const authTag   = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  let decipher;
  try {
    decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
  } catch (err) {
    throw new VaultEncryptionError(
      `Failed to create decipher: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  try {
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    // GCM auth tag failure — tampered ciphertext or wrong key
    throw new VaultEncryptionError(
      "Decryption authentication failed — wrong key or tampered data.",
    );
  }
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class VaultEncryptionError extends Error {
  constructor(message: string) {
    super(`[VaultEncryption] ${message}`);
    this.name = "VaultEncryptionError";
  }
}
