/**
 * lib/security/encryption/key-management.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Key Management Domain
 *
 * Defines key REFERENCES and lifecycle states.
 * Does NOT store, generate, or expose actual key material.
 *
 * Key material lives only in:
 *   - Environment variables (current: AGENTIK_ENCRYPTION_KEY)
 *   - Future: KMS (AGENTIK-SECURITY-KMS-01)
 *
 * This module manages opaque references — version IDs, status, rotation state.
 * The engine resolves actual key bytes from env at encryption time and
 * discards them immediately after use.
 *
 * No Prisma. No server-only. No crypto. Pure domain data.
 */

// ── Key Status ────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of an encryption key version.
 *
 * ACTIVE   — Currently in use for new encryptions.
 * ROTATING — New key is active; this key still decrypts legacy data.
 * RETIRED  — Key is no longer in use. Only kept for decryption compatibility.
 */
export type KeyStatus = "ACTIVE" | "ROTATING" | "RETIRED";

// ── Key Reference ─────────────────────────────────────────────────────────────

/**
 * EncryptionKeyReference — an opaque pointer to a key version.
 * NEVER contains actual key material.
 *
 * The actual key bytes are resolved from environment variables or KMS
 * at encryption/decryption time by the engine — never stored in this struct.
 */
export interface EncryptionKeyReference {
  /** Unique version identifier. Format: "v{n}" e.g. "v1", "v2". */
  keyId:      string;
  /** Version number. Monotonically increasing. */
  version:    number;
  /** Lifecycle status of this key. */
  status:     KeyStatus;
  /**
   * The environment variable that holds the key bytes for this version.
   * The env var name is safe to store — not the value.
   */
  envVarName: string;
  /** ISO 8601 date when this key version was introduced. */
  createdAt:  string;
  /**
   * ISO 8601 date when this key was retired (null if still active/rotating).
   */
  retiredAt:  string | null;
}

// ── Key Registry ──────────────────────────────────────────────────────────────

/**
 * KEY_VERSION_REGISTRY — all known key versions, newest first.
 *
 * To rotate keys:
 *   1. Add a new entry at the top with status ACTIVE.
 *   2. Set the previous ACTIVE entry to ROTATING.
 *   3. Old ROTATING entries remain for legacy decryption.
 *   4. Run AGENTIK-SECURITY-SECRET-ROTATION-01 to re-encrypt data.
 */
export const KEY_VERSION_REGISTRY: ReadonlyArray<EncryptionKeyReference> = [
  {
    keyId:      "v1",
    version:    1,
    status:     "ACTIVE",
    envVarName: "AGENTIK_ENCRYPTION_KEY",
    createdAt:  "2026-06-06T00:00:00.000Z",
    retiredAt:  null,
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/**
 * Get the currently ACTIVE key reference.
 * Returns null if no active key exists (should never happen in production).
 */
export function getActiveKeyReference(): EncryptionKeyReference | null {
  return KEY_VERSION_REGISTRY.find(k => k.status === "ACTIVE") ?? null;
}

/**
 * Get a key reference by its keyId.
 * Returns null if not found.
 */
export function getKeyReference(keyId: string): EncryptionKeyReference | null {
  return KEY_VERSION_REGISTRY.find(k => k.keyId === keyId) ?? null;
}

/**
 * Get the current active key version ID (e.g., "v1").
 * Returns null if no active key is registered.
 */
export function getActiveKeyVersion(): string | null {
  return getActiveKeyReference()?.keyId ?? null;
}

/**
 * Check whether a key version can decrypt data.
 * ACTIVE and ROTATING keys can decrypt. RETIRED keys cannot.
 */
export function canDecryptWithVersion(keyId: string): boolean {
  const ref = getKeyReference(keyId);
  if (!ref) return false;
  return ref.status === "ACTIVE" || ref.status === "ROTATING";
}

/**
 * Get all key versions that can still decrypt data.
 */
export function getDecryptableKeyVersions(): EncryptionKeyReference[] {
  return KEY_VERSION_REGISTRY.filter(
    k => k.status === "ACTIVE" || k.status === "ROTATING",
  );
}

/**
 * Summarize key registry state for health checks.
 * Returns safe data — no key material.
 */
export function getKeyRegistrySummary(): {
  totalVersions:      number;
  activeVersions:     number;
  rotatingVersions:   number;
  retiredVersions:    number;
  currentKeyId:       string | null;
} {
  const active   = KEY_VERSION_REGISTRY.filter(k => k.status === "ACTIVE");
  const rotating = KEY_VERSION_REGISTRY.filter(k => k.status === "ROTATING");
  const retired  = KEY_VERSION_REGISTRY.filter(k => k.status === "RETIRED");
  return {
    totalVersions:    KEY_VERSION_REGISTRY.length,
    activeVersions:   active.length,
    rotatingVersions: rotating.length,
    retiredVersions:  retired.length,
    currentKeyId:     active[0]?.keyId ?? null,
  };
}
