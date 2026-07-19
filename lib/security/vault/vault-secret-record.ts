/**
 * lib/security/vault/vault-secret-record.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Secret Record Types
 *
 * Defines the type surface for the new VaultSecret Prisma model.
 * Separate from vault-types.ts (AGENTIK-SECURE-VAULT-01) to avoid
 * coupling the two vault architectures.
 *
 * Architecture:
 *   - VaultSecret is stored in its own Prisma model (not Integration.secretsJson)
 *   - Scoped to orgSlug (not IntegrationConnection)
 *   - AES-256-GCM encryption via vault-encryption.ts
 *   - Full audit via VaultServiceAuditLog
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * All timestamps are ISO 8601 strings (no Date objects in domain types).
 */

// ── Secret kind ───────────────────────────────────────────────────────────────

/**
 * Kind of secret — uppercase canonical identifiers for the new vault.
 * Distinct from legacy VaultSecretType (lowercase) in vault-types.ts.
 */
export type VaultSecretKind =
  | "API_KEY"               // Generic API key (OpenAI, Anthropic, etc.)
  | "ACCESS_TOKEN"          // OAuth / platform access token
  | "REFRESH_TOKEN"         // OAuth refresh token
  | "WEBHOOK_SECRET"        // Webhook signature verification secret
  | "CERTIFICATE_PASSWORD"  // PKCS#12 certificate password (DIAN)
  | "SOFTWARE_PIN"          // DIAN software PIN
  | "OAUTH_PAIR"            // Access + refresh token pair (stored together)
  | "BANKING_CREDENTIAL"    // Banking API credential bundle
  | "GENERIC_SECRET";       // Fallback for unclassified secrets

// ── Status ────────────────────────────────────────────────────────────────────

export type VaultSecretStatus = "ACTIVE" | "DISABLED" | "REVOKED" | "EXPIRED";

// ── Classification ────────────────────────────────────────────────────────────

export type VaultSecretClassification = "RESTRICTED" | "CONFIDENTIAL";

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * VaultSecretMetadata — all fields except the secret value.
 * Safe to return to callers; never contains the raw secret.
 */
export interface VaultSecretMetadata {
  /** Vault-generated ID (cuid). */
  id:             string;
  /** Org that owns this secret. */
  orgSlug:        string;
  /** Human-readable name (e.g. "OpenAI Production Key"). */
  name:           string;
  /** Kind of secret — determines validation rules and audit category. */
  kind:           VaultSecretKind;
  /** Data sensitivity classification. */
  classification: VaultSecretClassification;
  /** Provider this secret belongs to (e.g. "openai", "meta", "dian"). */
  provider:       string;
  /** Arbitrary tags for discovery (e.g. ["production", "finance"]). */
  tags:           string[];
  /** Lifecycle status. */
  status:         VaultSecretStatus;
  /** Encryption key version (for rotation tracking). */
  keyVersion:     number;
  /** ISO timestamp — when this secret was created. */
  createdAt:      string;
  /** ISO timestamp — when this secret was last updated. */
  updatedAt:      string;
  /** ISO timestamp — when this secret was last accessed. */
  lastAccessedAt: string | null;
  /** ISO timestamp — when this secret expires. Null = no expiry. */
  expiresAt:      string | null;
  /** ISO timestamp — when this secret was revoked. Null = active. */
  revokedAt:      string | null;
  /** Free-form notes (never contains secret content). */
  notes:          string | null;
}

// ── Full record (with masked value) ──────────────────────────────────────────

/**
 * VaultSecretRecord — metadata + masked value.
 * The actual secret is masked (first 4 chars + ****).
 * Use VaultService.readSecret() to get the plaintext value — with full audit.
 */
export interface VaultSecretRecord extends VaultSecretMetadata {
  /** Masked secret value — safe to display in UI. */
  maskedValue: string;
}

// ── Input shapes ──────────────────────────────────────────────────────────────

export interface VaultCreateInput {
  orgSlug:        string;
  name:           string;
  kind:           VaultSecretKind;
  classification: VaultSecretClassification;
  provider:       string;
  /** Raw plaintext value — encrypted before storage. */
  value:          string;
  tags?:          string[];
  expiresAt?:     string; // ISO 8601
  notes?:         string;
}

export interface VaultUpdateInput {
  name?:      string;
  tags?:      string[];
  expiresAt?: string | null;
  notes?:     string | null;
}

// ── Caller ────────────────────────────────────────────────────────────────────

export interface VaultCaller {
  /** Actor ID (user ID, service ID, agent ID). */
  actorId:    string;
  /** Actor type. */
  actorType:  "USER" | "SERVICE" | "AGENT" | "SYSTEM";
  /** Org the caller acts on behalf of. */
  orgSlug:    string;
  /** Optional request ID for distributed tracing. */
  requestId?: string;
}

// ── Operation results ─────────────────────────────────────────────────────────

export interface VaultWriteResult {
  success:    true;
  record:     VaultSecretRecord;
  durationMs: number;
}

export interface VaultReadResult {
  success:    true;
  value:      string;
  metadata:   VaultSecretMetadata;
  durationMs: number;
}

export interface VaultListResult {
  success:    true;
  records:    VaultSecretRecord[];
  total:      number;
  durationMs: number;
}

export interface VaultDeleteResult {
  success:    true;
  durationMs: number;
}

export interface VaultServiceError {
  success:    false;
  error:      string;
  code:       VaultServiceErrorCode;
  durationMs: number;
}

export type VaultServiceResult<T extends { success: true }> = T | VaultServiceError;

export type VaultServiceErrorCode =
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "INVALID_INPUT"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "STORE_ERROR"
  | "VALIDATION_FAILED"
  | "ALREADY_REVOKED"
  | "ALREADY_DISABLED"
  | "SECRET_EXPIRED";
