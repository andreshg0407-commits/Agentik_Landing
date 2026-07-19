/**
 * lib/security/encryption/encryption-engine.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Core Encryption Engine
 *
 * Implements AES-256-GCM encryption and decryption using Node.js crypto.
 * No external libraries. No third-party dependencies.
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key (32 bytes)
 *   - 96-bit IV (12 bytes) — randomly generated per operation
 *   - 128-bit authentication tag (16 bytes) — GCM integrity guarantee
 *   - Associated data support for additional authentication
 *
 * Design:
 *   - Fail closed: failed decryption returns null, never partial plaintext
 *   - Never throws into callers (all errors caught internally)
 *   - Never logs plaintext or key material
 *   - Key resolved from env var at call time, discarded immediately after
 *   - All cryptographic outputs hex-encoded for safe serialization
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type {
  EncryptionInput,
  EncryptionResult,
  DecryptionInput,
  DecryptionResult,
  EncryptedPayload,
  PayloadValidationResult,
} from "./encryption-types";
import { CURRENT_ENCRYPTION_ALGORITHM } from "./encryption-types";
import { getActiveKeyVersion, getKeyReference, canDecryptWithVersion } from "./key-management";

// ── Constants ─────────────────────────────────────────────────────────────────

const IV_BYTES        = 12; // 96 bits — standard for AES-256-GCM
const AUTH_TAG_BYTES  = 16; // 128 bits — GCM authentication tag
const KEY_BYTES       = 32; // 256 bits — AES-256

// ── Key Resolution ────────────────────────────────────────────────────────────

/**
 * Resolve key bytes from environment variable for a given key version.
 * Returns null if the env var is not set or the key version is unknown.
 * Key bytes are discarded immediately after use — never stored.
 *
 * Key format:
 *   - Hex string (64 hex chars = 32 bytes) — preferred
 *   - Base64 string (44 chars = 32 bytes) — supported
 *   - Raw UTF-8 string padded/truncated to 32 bytes — fallback (dev only)
 */
function resolveKeyBytes(keyVersion: string): Buffer | null {
  const ref = getKeyReference(keyVersion);
  if (!ref) return null;

  const raw = process.env[ref.envVarName];
  if (!raw || raw.trim().length === 0) return null;

  const trimmed = raw.trim();

  // Hex: 64 chars = 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  // Base64: ~44 chars = 32 bytes
  if (/^[A-Za-z0-9+/=]{44}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === KEY_BYTES) return buf;
  }

  // Fallback: pad/truncate UTF-8 to 32 bytes (dev/test only)
  const buf = Buffer.alloc(KEY_BYTES, 0);
  const src = Buffer.from(trimmed, "utf8");
  src.copy(buf, 0, 0, Math.min(src.length, KEY_BYTES));
  return buf;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * encryptData — encrypt plaintext using AES-256-GCM.
 *
 * Returns EncryptionResult on success, null on failure.
 * Never throws. Never logs plaintext.
 */
export function encryptData(input: EncryptionInput): EncryptionResult | null {
  const start = Date.now();
  try {
    const keyVersion = input.keyVersion ?? getActiveKeyVersion();
    if (!keyVersion) {
      process.stderr.write("[encryption-engine] No active key version available\n");
      return null;
    }

    const keyBytes = resolveKeyBytes(keyVersion);
    if (!keyBytes) {
      process.stderr.write(`[encryption-engine] Key env var not set for version ${keyVersion}\n`);
      return null;
    }

    if (!input.plaintext || input.plaintext.length === 0) {
      process.stderr.write("[encryption-engine] Cannot encrypt empty plaintext\n");
      return null;
    }

    const iv     = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);

    if (input.associatedData) {
      cipher.setAAD(Buffer.from(input.associatedData, "utf8"));
    }

    const encrypted = Buffer.concat([
      cipher.update(input.plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    // Zero out key bytes immediately
    keyBytes.fill(0);

    const payload: EncryptedPayload = {
      algorithm:   CURRENT_ENCRYPTION_ALGORITHM,
      ciphertext:  encrypted.toString("hex"),
      iv:          iv.toString("hex"),
      authTag:     authTag.toString("hex"),
      keyVersion,
      encryptedAt: new Date().toISOString(),
    };

    return {
      payload,
      keyVersion,
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    process.stderr.write(`[encryption-engine] encryptData error: ${e?.message ?? "unknown"}\n`);
    return null;
  }
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * decryptData — decrypt an AES-256-GCM encrypted payload.
 *
 * Returns DecryptionResult on success, null on failure.
 * Never throws. Never logs plaintext.
 * Verifies authentication tag — rejects tampered payloads.
 */
export function decryptData(input: DecryptionInput): DecryptionResult | null {
  const start = Date.now();
  try {
    const { payload } = input;

    // Validate payload structure first
    const validation = validatePayloadStructure(payload);
    if (!validation.valid) {
      process.stderr.write(`[encryption-engine] Invalid payload: ${validation.reason}\n`);
      return null;
    }

    // Check key version is decryptable
    if (!canDecryptWithVersion(payload.keyVersion)) {
      process.stderr.write(`[encryption-engine] Key version ${payload.keyVersion} cannot decrypt (RETIRED)\n`);
      return null;
    }

    const keyBytes = resolveKeyBytes(payload.keyVersion);
    if (!keyBytes) {
      process.stderr.write(`[encryption-engine] Key env var not set for version ${payload.keyVersion}\n`);
      return null;
    }

    const iv         = Buffer.from(payload.iv, "hex");
    const ciphertext = Buffer.from(payload.ciphertext, "hex");
    const authTag    = Buffer.from(payload.authTag, "hex");

    const decipher = createDecipheriv("aes-256-gcm", keyBytes, iv);
    decipher.setAuthTag(authTag);

    if (input.associatedData) {
      decipher.setAAD(Buffer.from(input.associatedData, "utf8"));
    }

    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } finally {
      // Zero out key bytes immediately regardless of success/failure
      keyBytes.fill(0);
    }

    return {
      plaintext:  decrypted.toString("utf8"),
      keyVersion: payload.keyVersion,
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    // GCM auth tag failure produces "Unsupported state or unable to authenticate data"
    process.stderr.write(`[encryption-engine] decryptData error: ${e?.message ?? "unknown"}\n`);
    return null;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * validatePayloadStructure — check structural integrity of an EncryptedPayload.
 * Does NOT decrypt. Does NOT verify GCM tag (that requires decryption).
 * Never throws.
 */
export function validatePayloadStructure(payload: EncryptedPayload): PayloadValidationResult {
  try {
    if (!payload.algorithm || payload.algorithm !== "AES_256_GCM") {
      return { valid: false, reason: "unsupported_algorithm" };
    }
    if (!payload.ciphertext || !/^[0-9a-fA-F]+$/.test(payload.ciphertext)) {
      return { valid: false, reason: "invalid_ciphertext" };
    }
    if (!payload.iv || !/^[0-9a-fA-F]{24}$/.test(payload.iv)) {
      // 12 bytes = 24 hex chars
      return { valid: false, reason: "invalid_iv" };
    }
    if (!payload.authTag || !/^[0-9a-fA-F]{32}$/.test(payload.authTag)) {
      // 16 bytes = 32 hex chars
      return { valid: false, reason: "invalid_auth_tag" };
    }
    if (!payload.keyVersion || typeof payload.keyVersion !== "string") {
      return { valid: false, reason: "missing_key_version" };
    }
    if (!payload.encryptedAt || !payload.encryptedAt.includes("T")) {
      return { valid: false, reason: "invalid_encrypted_at" };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "validation_error" };
  }
}

// ── Engine Provider ───────────────────────────────────────────────────────────

/**
 * LocalAesGcmProvider — concrete EncryptionProvider backed by Node crypto.
 * Implements the EncryptionProvider interface from encryption-provider.ts.
 */
export class LocalAesGcmProvider {
  readonly id     = "local-aes-256-gcm";
  readonly name   = "Local AES-256-GCM";
  readonly isLocal = true;
  readonly isActive = true;

  async encrypt(input: EncryptionInput): Promise<EncryptionResult | null> {
    return encryptData(input);
  }

  async decrypt(input: DecryptionInput): Promise<DecryptionResult | null> {
    return decryptData(input);
  }

  canDecrypt(payload: EncryptedPayload): boolean {
    try {
      return (
        payload.algorithm === "AES_256_GCM" &&
        canDecryptWithVersion(payload.keyVersion)
      );
    } catch {
      return false;
    }
  }

  validatePayload(payload: EncryptedPayload): PayloadValidationResult {
    return validatePayloadStructure(payload);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _provider: LocalAesGcmProvider | null = null;

/** Get the singleton LocalAesGcmProvider instance. */
export function getLocalAesGcmProvider(): LocalAesGcmProvider {
  if (!_provider) _provider = new LocalAesGcmProvider();
  return _provider;
}
