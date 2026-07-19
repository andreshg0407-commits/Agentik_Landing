/**
 * lib/security/encryption/encryption-types.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Domain Types
 *
 * Canonical types for the Agentik enterprise encryption layer.
 * Complements AGENTIK-SECURITY-VAULT-01 (credentials) and
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 (audit).
 *
 * Scope: encrypts sensitive BUSINESS DATA — memory, playbooks,
 * executive context, financial and commercial records.
 * NOT a replacement for Vault (credentials/secrets remain in Vault).
 *
 * All types are:
 *   - JSON-serializable (no Date objects, no class instances)
 *   - Multi-tenant by design
 *   - Server-safe (no browser APIs)
 *
 * No Prisma. No server-only. No crypto. Pure domain types.
 */

// ── Algorithm ─────────────────────────────────────────────────────────────────

/**
 * Supported encryption algorithms.
 * AES-256-GCM is authenticated encryption — provides confidentiality + integrity.
 */
export type EncryptionAlgorithm = "AES_256_GCM";

/** Current default algorithm. All new payloads use this. */
export const CURRENT_ENCRYPTION_ALGORITHM: EncryptionAlgorithm = "AES_256_GCM";

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Whether a data payload is currently encrypted or decrypted.
 */
export type EncryptionStatus = "ENCRYPTED" | "DECRYPTED";

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Data sensitivity classification that drives encryption requirements.
 *
 * CONFIDENTIAL — Sensitive business data. Encryption required.
 *                Examples: financial records, customer PII, executive context.
 *
 * RESTRICTED   — Highly sensitive data. Encryption required. Strict access.
 *                Examples: employee records, classified strategic memory.
 */
export type EncryptionClassification = "CONFIDENTIAL" | "RESTRICTED";

// ── Encrypted Payload ─────────────────────────────────────────────────────────

/**
 * EncryptedPayload — the canonical shape for all encrypted data in Agentik.
 *
 * Design rules:
 *   - ciphertext and authTag are hex strings (no raw buffers)
 *   - iv is hex string (12 bytes for AES-256-GCM)
 *   - keyVersion is opaque — references a key without exposing it
 *   - encryptedAt is ISO 8601 string
 *   - All fields are required — no partial payloads
 */
export interface EncryptedPayload {
  /** Encryption algorithm used. */
  algorithm:   EncryptionAlgorithm;
  /** Hex-encoded encrypted content. */
  ciphertext:  string;
  /** Hex-encoded initialization vector (12 bytes for AES-256-GCM). */
  iv:          string;
  /** Hex-encoded GCM authentication tag (16 bytes). */
  authTag:     string;
  /** Opaque reference to the key version used for encryption. */
  keyVersion:  string;
  /** ISO 8601 timestamp when encryption occurred. */
  encryptedAt: string;
}

// ── Input / Output ────────────────────────────────────────────────────────────

/**
 * Input to the encryption engine.
 */
export interface EncryptionInput {
  /** The plaintext data to encrypt. Must be a non-empty string. */
  plaintext:      string;
  /** Tenant identifier. Enforces tenant isolation. */
  orgSlug:        string;
  /** Key version to use. If omitted, uses the current active version. */
  keyVersion?:    string;
  /** Optional associated data for GCM authentication (not encrypted, but authenticated). */
  associatedData?: string;
}

/**
 * Result of a successful encryption operation.
 */
export interface EncryptionResult {
  /** The produced encrypted payload. */
  payload:     EncryptedPayload;
  /** The key version used. */
  keyVersion:  string;
  /** Duration in milliseconds. */
  durationMs:  number;
}

/**
 * Input to the decryption engine.
 */
export interface DecryptionInput {
  /** The encrypted payload to decrypt. */
  payload:        EncryptedPayload;
  /** Tenant identifier. Must match the tenant that encrypted the data. */
  orgSlug:        string;
  /** Optional associated data (must match what was used during encryption). */
  associatedData?: string;
}

/**
 * Result of a successful decryption operation.
 */
export interface DecryptionResult {
  /** The recovered plaintext. NEVER log this. */
  plaintext:   string;
  /** The key version that was used for decryption. */
  keyVersion:  string;
  /** Duration in milliseconds. */
  durationMs:  number;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Result of payload validation.
 */
export interface PayloadValidationResult {
  /** Whether the payload is structurally valid. */
  valid:    boolean;
  /** Validation error if invalid. Never exposes key material. */
  reason?:  string;
}

// ── Helper guards ─────────────────────────────────────────────────────────────

/**
 * Type guard: checks if a value looks like an EncryptedPayload.
 * Does NOT verify cryptographic integrity — use the engine for that.
 */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.algorithm === "string" &&
    typeof v.ciphertext === "string" &&
    typeof v.iv === "string" &&
    typeof v.authTag === "string" &&
    typeof v.keyVersion === "string" &&
    typeof v.encryptedAt === "string"
  );
}

/**
 * Safely serialize an EncryptedPayload to a JSON string.
 * Returns null if serialization fails.
 */
export function serializePayload(payload: EncryptedPayload): string | null {
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

/**
 * Safely deserialize an EncryptedPayload from a JSON string or object.
 * Returns null if invalid.
 */
export function deserializePayload(raw: unknown): EncryptedPayload | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (isEncryptedPayload(obj)) return obj;
    return null;
  } catch {
    return null;
  }
}
