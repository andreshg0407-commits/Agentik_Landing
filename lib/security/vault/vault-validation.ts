/**
 * lib/security/vault/vault-validation.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Validation Rules
 *
 * Deterministic, synchronous validation for VaultCreateInput and secret values.
 * No AI, no async, no Prisma, no server-only.
 *
 * Returns ALL validation errors (not just the first).
 */

import type { VaultCreateInput, VaultSecretKind } from "./vault-secret-record";

// ── Validation result ─────────────────────────────────────────────────────────

export interface VaultValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ── Kind constraints ──────────────────────────────────────────────────────────

const KIND_MIN_LENGTH: Partial<Record<VaultSecretKind, number>> = {
  API_KEY:              16,
  ACCESS_TOKEN:         8,
  REFRESH_TOKEN:        8,
  WEBHOOK_SECRET:       16,
  CERTIFICATE_PASSWORD: 4,
  SOFTWARE_PIN:         4,
  OAUTH_PAIR:           8,
  BANKING_CREDENTIAL:   4,
  GENERIC_SECRET:       1,
};

const KIND_MAX_LENGTH: Partial<Record<VaultSecretKind, number>> = {
  API_KEY:              512,
  ACCESS_TOKEN:         2048,
  REFRESH_TOKEN:        2048,
  WEBHOOK_SECRET:       256,
  CERTIFICATE_PASSWORD: 256,
  SOFTWARE_PIN:         64,
  OAUTH_PAIR:           4096,
  BANKING_CREDENTIAL:   2048,
  GENERIC_SECRET:       8192,
};

const VALID_KINDS: VaultSecretKind[] = [
  "API_KEY",
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "WEBHOOK_SECRET",
  "CERTIFICATE_PASSWORD",
  "SOFTWARE_PIN",
  "OAUTH_PAIR",
  "BANKING_CREDENTIAL",
  "GENERIC_SECRET",
];

// ── Validators ────────────────────────────────────────────────────────────────

/**
 * Validate a VaultCreateInput.
 * Returns all errors, not just the first.
 */
export function validateCreateInput(input: VaultCreateInput): VaultValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // orgSlug
  if (!input.orgSlug || input.orgSlug.trim().length === 0) {
    errors.push("orgSlug is required");
  }

  // name
  if (!input.name || input.name.trim().length === 0) {
    errors.push("name is required");
  } else if (input.name.length > 200) {
    errors.push("name must be 200 characters or fewer");
  }

  // kind
  if (!VALID_KINDS.includes(input.kind)) {
    errors.push(`kind "${input.kind}" is not a recognized VaultSecretKind`);
  }

  // classification
  if (input.classification !== "RESTRICTED" && input.classification !== "CONFIDENTIAL") {
    errors.push(`classification must be "RESTRICTED" or "CONFIDENTIAL"`);
  }

  // provider
  if (!input.provider || input.provider.trim().length === 0) {
    errors.push("provider is required");
  }

  // value
  const valueErrors = validateSecretValue(input.value, input.kind);
  errors.push(...valueErrors);

  // expiresAt
  if (input.expiresAt !== undefined) {
    const parsed = Date.parse(input.expiresAt);
    if (isNaN(parsed)) {
      errors.push("expiresAt must be a valid ISO 8601 date string");
    } else if (parsed <= Date.now()) {
      warnings.push("expiresAt is in the past — secret will be considered expired immediately");
    }
  }

  // notes
  if (input.notes !== undefined && input.notes.length > 1000) {
    errors.push("notes must be 1000 characters or fewer");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate the raw secret value for a given kind.
 * Returns an array of error strings (empty = valid).
 */
export function validateSecretValue(value: string, kind: VaultSecretKind): string[] {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    errors.push("secret value is required");
    return errors;
  }

  if (typeof value !== "string") {
    errors.push("secret value must be a string");
    return errors;
  }

  if (value.trim().length === 0) {
    errors.push("secret value must not be empty or whitespace-only");
    return errors;
  }

  const min = KIND_MIN_LENGTH[kind] ?? 1;
  const max = KIND_MAX_LENGTH[kind] ?? 8192;

  if (value.length < min) {
    errors.push(
      `secret value for kind "${kind}" must be at least ${min} characters (got ${value.length})`,
    );
  }

  if (value.length > max) {
    errors.push(
      `secret value for kind "${kind}" must not exceed ${max} characters (got ${value.length})`,
    );
  }

  return errors;
}
