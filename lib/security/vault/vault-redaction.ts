/**
 * vault-redaction.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Redaction System
 *
 * Provides safe display and logging of secret-adjacent data.
 * Use these utilities EVERYWHERE a secret value might appear in:
 *   - Error messages
 *   - Log lines
 *   - API responses
 *   - Debug output
 *
 * Rules:
 *   - Never log raw secret values
 *   - Show only reference metadata in logs (hash, type, org, provider)
 *   - Mask all string values in known sensitive fields
 *   - redactObjectSecrets() is safe to call on any JSON object before logging
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { SecretRef, VaultSecretPayload, VaultSecretType } from "./vault-types";
import { hashSecretReference } from "./vault-crypto";

// ── Known sensitive field names ───────────────────────────────────────────────

/**
 * Field names that are always redacted, regardless of object nesting depth.
 *
 * This list is conservative — add any field that may hold secret material.
 */
export const REDACT_FIELD_NAMES = new Set<string>([
  "password",
  "certPassword",
  "certPass",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiKey",
  "api_key",
  "secret",
  "secretKey",
  "secretsJson",
  "credentialsJson",
  "pin",
  "softwarePin",
  "privateKey",
  "signingKey",
  "encryptionKey",
  "masterKey",
  "webhookSecret",
  "verifyToken",
]);

// ── Masking utilities ─────────────────────────────────────────────────────────

/**
 * Mask a secret string, showing only the first 4 characters.
 *
 * Examples:
 *   "super-secret-token" → "supe****"
 *   "abc"                → "****"
 *   ""                   → "****"
 */
export function maskSecret(value: string): string {
  if (!value || value.length <= 4) return "****";
  return value.slice(0, 4) + "****";
}

/**
 * Check if a value looks like it might be a secret.
 *
 * Heuristic: strings longer than 8 chars that aren't URLs or dates.
 * Used in redactObjectSecrets for unlabelled fields.
 */
export function looksLikeSecret(value: string): boolean {
  if (value.length < 8) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return false; // ISO date
  if (/^[a-zA-Z0-9_-]+$/.test(value) && value.length > 16) return true; // API key pattern
  return false;
}

// ── Object deep-redaction ─────────────────────────────────────────────────────

/**
 * Deep-redact all known sensitive fields in an object.
 *
 * Recursively traverses the object and replaces string values of known
 * sensitive field names with "****".
 *
 * Safe to call on any JSON-serializable value.
 * Arrays are traversed. Non-objects are returned as-is.
 *
 * @param obj  Any value — typically a plain object before logging.
 * @returns    A new object with sensitive fields replaced.
 */
export function redactObjectSecrets<T>(obj: T): T {
  return redactDeep(obj) as T;
}

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string")  return value; // strings only redacted by key
  if (typeof value === "number")  return value;
  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map(item => redactDeep(item));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_FIELD_NAMES.has(key)) {
        // Redact the value regardless of its type
        result[key] = typeof val === "string" ? maskSecret(val) : "****";
      } else {
        result[key] = redactDeep(val);
      }
    }
    return result;
  }

  return value;
}

// ── Safe secret metadata ───────────────────────────────────────────────────────

/**
 * Safe metadata about a secret reference — suitable for logs and API responses.
 *
 * Never includes the URI (which contains org + provider + secretId).
 * The referenceHash is a 16-char truncated SHA-256 of the URI.
 */
export interface SafeSecretMetadata {
  referenceHash:  string;    // sha256(uri)[0:16] — non-reversible
  provider:       string;    // "dian", "pya", "meta", etc.
  type:           VaultSecretType;
  organizationId: string;
}

/**
 * Extract display-safe metadata from a SecretRef.
 *
 * Use this in log lines and error messages to identify which secret
 * was accessed without revealing the full URI or any secret content.
 */
export function safeSecretMetadata(ref: SecretRef): SafeSecretMetadata {
  return {
    referenceHash:  hashSecretReference(ref.uri),
    provider:       ref.provider,
    type:           ref.type,
    organizationId: ref.organizationId,
  };
}

// ── Payload redaction ─────────────────────────────────────────────────────────

/**
 * Redact all sensitive fields from a VaultSecretPayload for safe display.
 *
 * Returns an object with only the type discriminant visible.
 * All credential fields are masked.
 *
 * Use in error messages and debug output when you need to identify
 * the payload type without revealing content.
 */
export function redactPayload(payload: VaultSecretPayload): Record<string, unknown> {
  return redactObjectSecrets(payload) as unknown as Record<string, unknown>;
}

/**
 * Build a safe one-line description of a payload for logging.
 *
 * @returns e.g. "dian_certificate (4 fields)"
 */
export function describePayload(payload: VaultSecretPayload): string {
  const fieldCount = Object.keys(payload).length;
  return `${payload.type} (${fieldCount} field${fieldCount === 1 ? "" : "s"})`;
}
