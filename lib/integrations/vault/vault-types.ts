/**
 * lib/integrations/vault/vault-types.ts
 *
 * MS-10 — Integration Vault Types
 *
 * Type contracts for the secret vault abstraction layer.
 * Architecture-ready for KMS / Vercel encryption / external vault / HSM.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Vault operations are the ONLY place where plain secret values exist in memory.
 *   All other layers work with VaultSecretMetadata (no plain value).
 *   per-tenant secret isolation enforced by organizationId on every operation.
 */

// ── Secret type catalog ───────────────────────────────────────────────────────

export const SECRET_TYPE = {
  ACCESS_TOKEN:   "access_token",
  REFRESH_TOKEN:  "refresh_token",
  API_KEY:        "api_key",
  WEBHOOK_SECRET: "webhook_secret",
  HMAC_KEY:       "hmac_key",
} as const;
export type SecretType = typeof SECRET_TYPE[keyof typeof SECRET_TYPE];

// ── Vault operation inputs ────────────────────────────────────────────────────

export interface VaultStoreInput {
  organizationId: string;
  connectionId:   string;
  secretType:     SecretType;
  /** Plain value — MUST NOT be logged or passed to client layers */
  plainValue:     string;
  expiresAt?:     Date | null;
}

export interface VaultGetInput {
  organizationId: string;
  connectionId:   string;
  secretType:     SecretType;
}

export interface VaultRotateInput {
  organizationId: string;
  connectionId:   string;
  secretType:     SecretType;
  /** New plain value — MUST NOT be logged */
  newPlainValue:  string;
  expiresAt?:     Date | null;
}

export interface VaultRevokeInput {
  organizationId: string;
  connectionId:   string;
  /** If omitted, revoke ALL secrets for this connection */
  secretType?:    SecretType;
}

// ── Vault output types ────────────────────────────────────────────────────────

/**
 * Returned when a secret is retrieved.
 * plainValue is present only in server-side vault operations.
 * NEVER pass VaultRetrievedSecret to client components.
 */
export interface VaultRetrievedSecret {
  id:           string;
  connectionId: string;
  secretType:   SecretType;
  plainValue:   string;    // ⚠ SERVER ONLY — never serialize to client
  expiresAt:    Date | null;
  isExpired:    boolean;
}

/**
 * Safe metadata — no plain value.
 * Safe to pass to RSC → client boundary.
 */
export interface VaultSecretMetadata {
  id:           string;
  connectionId: string;
  secretType:   SecretType;
  keyVersion:   string;
  expiresAt:    string | null;  // ISO
  isExpired:    boolean;
  revokedAt:    string | null;  // ISO
  isRevoked:    boolean;
}

// ── Vault backend interface ───────────────────────────────────────────────────
// Future: swap implementation for KMS without changing callers.

export interface IVaultBackend {
  store(input: VaultStoreInput):   Promise<VaultSecretMetadata>;
  get(input: VaultGetInput):       Promise<VaultRetrievedSecret | null>;
  rotate(input: VaultRotateInput): Promise<VaultSecretMetadata>;
  revoke(input: VaultRevokeInput): Promise<void>;
}
