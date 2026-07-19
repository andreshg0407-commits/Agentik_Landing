/**
 * lib/security/encryption/encryption-compatibility.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Compatibility Layer
 *
 * Enables coexistence between:
 *   - Encrypted data (EncryptedEnvelope JSON strings)
 *   - Legacy unencrypted data (raw strings from pre-encryption schema)
 *
 * This layer is the bridge that allows gradual migration:
 *   - Read: transparently handles both encrypted and legacy formats
 *   - Write: always writes encrypted (via EncryptionService)
 *   - Detect: identifies which format a stored value uses
 *
 * Design:
 *   - Never forces immediate migration (coexistence is intentional)
 *   - Read path: attempt decrypt → fall back to raw (legacy)
 *   - Write path: always encrypt (no raw writes after migration begins)
 *   - No data loss on detection failure (legacy values pass through)
 *
 * No Prisma. No server-only (detection helpers only). Pure domain logic.
 * The read/write functions that use EncryptionService are server-only
 * and tagged accordingly.
 */

import { isEncryptedPayload } from "./encryption-types";
import { deserializeEnvelope, serializeEnvelope } from "./encryption-metadata";
import type { EncryptedEnvelope } from "./encryption-metadata";

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * isEncrypted — determine whether a stored value is an EncryptedEnvelope.
 *
 * Structural check only. Does NOT verify cryptographic integrity.
 * Safe to call on client or server.
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const envelope = deserializeEnvelope(value);
    return envelope !== null;
  } catch {
    return false;
  }
}

/**
 * isLegacyUnencrypted — determine whether a stored value is raw plaintext.
 * Complement of isEncrypted().
 */
export function isLegacyUnencrypted(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return !isEncrypted(value);
}

/**
 * detectFormat — return the format of a stored value.
 * Returns "encrypted" | "legacy" | "unknown".
 */
export function detectFormat(value: unknown): "encrypted" | "legacy" | "unknown" {
  if (typeof value !== "string") return "unknown";
  if (isEncrypted(value)) return "encrypted";
  if (value.length > 0) return "legacy";
  return "unknown";
}

// ── Envelope extraction ───────────────────────────────────────────────────────

/**
 * extractEnvelope — parse a stored value into an EncryptedEnvelope.
 * Returns null if the value is not encrypted (legacy format).
 * Safe to call client-side (no crypto, structural only).
 */
export function extractEnvelope(value: string): EncryptedEnvelope | null {
  return deserializeEnvelope(value);
}

// ── Server-only read/write helpers ────────────────────────────────────────────

/**
 * readCompatible — transparently read a value that may be encrypted or legacy.
 *
 * - If encrypted: decrypt via EncryptionService and return plaintext.
 * - If legacy: return the raw value unchanged.
 * - On decryption failure: return null (fail-closed for encrypted data).
 *
 * IMPORTANT: Server-only. Never import in client components.
 * NEVER log the returned value.
 */
export async function readCompatible(
  value: string,
  orgSlug: string,
): Promise<string | null> {
  try {
    if (!isEncrypted(value)) {
      // Legacy format — return as-is
      return value;
    }
    const envelope = deserializeEnvelope(value);
    if (!envelope) return value; // malformed — return raw (best effort)

    // Lazy import to keep this module free of server-only at top level
    const { getEncryptionService } = await import("./encryption-service");
    const svc = getEncryptionService();
    const result = svc.decrypt({ envelope, orgSlug });
    return result?.plaintext ?? null;
  } catch {
    return null;
  }
}

/**
 * writeEncrypted — encrypt a value and return the serialized EncryptedEnvelope.
 * Always produces encrypted output — no raw writes.
 *
 * Returns null on failure (fail-safe).
 *
 * IMPORTANT: Server-only. Never import in client components.
 */
export async function writeEncrypted(
  plaintext: string,
  orgSlug:   string,
  assetType: string,
): Promise<string | null> {
  try {
    const { getEncryptionService } = await import("./encryption-service");
    const svc = getEncryptionService();
    const result = svc.encrypt({ plaintext, orgSlug, assetType });
    if (!result) return null;
    return serializeEnvelope(result.envelope);
  } catch {
    return null;
  }
}

// ── Migration utilities ───────────────────────────────────────────────────────

/**
 * CompatibilityStats — summary of encrypted vs legacy values in a dataset.
 */
export interface CompatibilityStats {
  total:     number;
  encrypted: number;
  legacy:    number;
  unknown:   number;
  pctEncrypted: number;
}

/**
 * analyzeCompatibilityStats — scan an array of stored values and
 * return migration progress statistics.
 * Never throws.
 */
export function analyzeCompatibilityStats(values: string[]): CompatibilityStats {
  let encrypted = 0;
  let legacy    = 0;
  let unknown   = 0;

  for (const v of values) {
    const fmt = detectFormat(v);
    if (fmt === "encrypted") encrypted++;
    else if (fmt === "legacy") legacy++;
    else unknown++;
  }

  const total = values.length;
  return {
    total,
    encrypted,
    legacy,
    unknown,
    pctEncrypted: total > 0 ? Math.round((encrypted / total) * 100) : 0,
  };
}

/**
 * isEncryptedPayloadString — check if a string contains a valid EncryptedPayload
 * (not an EncryptedEnvelope — just the payload).
 * Used for fields that store payload JSON directly rather than full envelopes.
 */
export function isEncryptedPayloadString(value: string): boolean {
  try {
    const obj = JSON.parse(value);
    return isEncryptedPayload(obj);
  } catch {
    return false;
  }
}
