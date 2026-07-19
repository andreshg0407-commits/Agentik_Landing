/**
 * lib/security/encryption/encryption-provider.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Provider Contract
 *
 * EncryptionProvider is the pure interface that all encryption implementations
 * must satisfy. This contract is implementation-agnostic — the engine, a future
 * KMS provider, or an HSM adapter all implement this interface.
 *
 * Design:
 *   - No implementation here — contract only
 *   - All methods are async — forward-compatible with remote KMS
 *   - Fail-safe: implementations must never throw into callers
 *   - Never exposes key material through return values
 *
 * No Prisma. No server-only. No crypto. Pure interface.
 */

import type {
  EncryptionInput,
  EncryptionResult,
  DecryptionInput,
  DecryptionResult,
  PayloadValidationResult,
  EncryptedPayload,
} from "./encryption-types";

// ── Provider Interface ────────────────────────────────────────────────────────

/**
 * EncryptionProvider — the encryption capability contract.
 *
 * Every method is:
 *   - Async (KMS-compatible)
 *   - Tenant-aware (orgSlug is required on inputs)
 *   - Fail-safe (implementations catch internal errors, return structured results)
 *   - Non-throwing (null / failure result rather than exceptions)
 */
export interface EncryptionProvider {
  /**
   * Encrypt plaintext data.
   * Returns null if encryption fails (fail-safe).
   * Never logs plaintext.
   */
  encrypt(input: EncryptionInput): Promise<EncryptionResult | null>;

  /**
   * Decrypt an encrypted payload.
   * Returns null if decryption fails (fail-safe, fail-closed).
   * Implementations MUST verify the GCM authentication tag.
   * Implementations MUST enforce tenant isolation.
   * NEVER log the returned plaintext.
   */
  decrypt(input: DecryptionInput): Promise<DecryptionResult | null>;

  /**
   * Check whether this provider can decrypt a given payload.
   * Used for version negotiation and key rotation compatibility.
   * Never throws. Returns false on any error.
   */
  canDecrypt(payload: EncryptedPayload): boolean;

  /**
   * Validate the structural and cryptographic integrity of a payload.
   * Does NOT decrypt — only checks fields and format.
   * Never throws. Returns invalid result on error.
   */
  validatePayload(payload: EncryptedPayload): PayloadValidationResult;
}

// ── Provider Info ─────────────────────────────────────────────────────────────

/**
 * EncryptionProviderInfo — descriptive metadata about a provider implementation.
 * Used for health checks and operational monitoring.
 */
export interface EncryptionProviderInfo {
  /** Stable provider identifier. */
  id:               string;
  /** Human-readable name. */
  name:             string;
  /** Supported algorithm(s). */
  algorithms:       string[];
  /** Key versions this provider can handle. */
  supportedVersions: string[];
  /** Whether this provider is local (no external calls). */
  isLocal:          boolean;
  /** Whether this provider is the current active provider. */
  isActive:         boolean;
}

// ── Provider Error ────────────────────────────────────────────────────────────

/**
 * EncryptionProviderError — structured failure from an EncryptionProvider.
 * Implementations return these in result shapes — never throw raw errors.
 */
export interface EncryptionProviderError {
  code:     EncryptionProviderErrorCode;
  message:  string;
  /** NEVER include key material, plaintext, or ciphertext in context. */
  context?: Record<string, string | number | boolean>;
}

export type EncryptionProviderErrorCode =
  | "ENCRYPT_FAILED"
  | "DECRYPT_FAILED"
  | "INVALID_PAYLOAD"
  | "KEY_VERSION_MISMATCH"
  | "TENANT_MISMATCH"
  | "AUTH_TAG_INVALID"
  | "UNSUPPORTED_ALGORITHM"
  | "KEY_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE";
