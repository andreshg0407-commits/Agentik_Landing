/**
 * lib/security/kms/kms-types.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Domain Types — Core Primitives
 *
 * No server-only. No Prisma. Pure domain contracts.
 * All types are JSON-serializable.
 * Never include key material in any type.
 */

// ── Provider Types ────────────────────────────────────────────────────────────

/**
 * KmsProviderType — the underlying key management backend.
 */
export type KmsProviderType =
  | "LOCAL"              // In-process AES-256-GCM (development / on-prem fallback)
  | "AWS_KMS"            // Amazon Web Services KMS
  | "AZURE_KEY_VAULT"    // Microsoft Azure Key Vault
  | "GCP_KMS"            // Google Cloud KMS
  | "CUSTOM";            // Custom / HSM adapter

// ── Key Status ────────────────────────────────────────────────────────────────

/**
 * KmsKeyStatus — lifecycle state of a managed key.
 */
export type KmsKeyStatus =
  | "ACTIVE"    // Key is in use
  | "ROTATING"  // Rotation in progress — old version still valid during grace period
  | "DISABLED"  // Key is temporarily suspended
  | "REVOKED"   // Key is permanently disabled — no new operations allowed
  | "PENDING";  // Key created but not yet activated

// ── KMS Operations ────────────────────────────────────────────────────────────

/**
 * KmsOperation — actions that can be performed on or with a key.
 */
export type KmsOperation =
  | "GENERATE_KEY"
  | "ENCRYPT"
  | "DECRYPT"
  | "ROTATE_KEY"
  | "DISABLE_KEY"
  | "ENABLE_KEY"
  | "DELETE_KEY";

// ── KMS Risk Level ────────────────────────────────────────────────────────────

/**
 * KmsRiskLevel — risk level of a KMS operation or event.
 */
export type KmsRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── KMS Health ────────────────────────────────────────────────────────────────

/**
 * KmsHealthStatus — operational health of the KMS subsystem.
 */
export type KmsHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

// ── KMS Result ────────────────────────────────────────────────────────────────

/**
 * KmsResult<T> — standard wrapper for KMS operation results.
 * On failure: ok=false, error contains machine-readable reason.
 * On success: ok=true, value contains the operation result.
 * Key material is NEVER included in value.
 */
export type KmsResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string; riskLevel?: KmsRiskLevel };

// ── KMS Error Codes ───────────────────────────────────────────────────────────

export type KmsErrorCode =
  | "KEY_NOT_FOUND"
  | "KEY_DISABLED"
  | "KEY_REVOKED"
  | "PROVIDER_UNAVAILABLE"
  | "OPERATION_NOT_PERMITTED"
  | "TENANT_MISMATCH"
  | "RBAC_DENIED"
  | "ZERO_TRUST_DENIED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "ROTATION_IN_PROGRESS"
  | "INVALID_KEY_ALIAS"
  | "PROVIDER_NOT_REGISTERED"
  | "UNKNOWN";

// ── KMS Audit Event Types ─────────────────────────────────────────────────────

export type KmsAuditEventType =
  | "KEY_GENERATED"
  | "KEY_USED"
  | "KEY_ROTATED"
  | "KEY_DISABLED"
  | "KEY_ENABLED"
  | "KEY_DELETED"
  | "KMS_ACCESS_DENIED"
  | "KMS_PROVIDER_FAILURE";

// ── KMS Access Context ────────────────────────────────────────────────────────

/**
 * KmsAccessContext — who is performing a KMS operation and where.
 * Passed to RBAC and Zero Trust gates.
 */
export interface KmsAccessContext {
  /** Subject requesting the KMS operation. */
  subjectId:   string;
  /** Subject type. */
  subjectType: "USER" | "AGENT" | "SYSTEM" | "SERVICE_ACCOUNT";
  /** Tenant scope. */
  orgSlug:     string;
  /** Operation being performed. */
  operation:   KmsOperation;
  /** Target key alias (human-readable name). */
  keyAlias:    string;
  /** Target key ID (if already resolved). */
  keyId?:      string;
  /** Session ID for Zero Trust evaluation. */
  sessionId?:  string;
  /** IP address of the caller. */
  ipAddress?:  string;
  /** Whether MFA was verified. */
  mfaVerified?: boolean;
}

// ── Operation Risk Map ────────────────────────────────────────────────────────

/**
 * KMS_OPERATION_RISK — inherent risk of each KMS operation.
 */
export const KMS_OPERATION_RISK: Record<KmsOperation, KmsRiskLevel> = {
  GENERATE_KEY: "HIGH",
  ENCRYPT:      "MEDIUM",
  DECRYPT:      "HIGH",
  ROTATE_KEY:   "CRITICAL",
  DISABLE_KEY:  "CRITICAL",
  ENABLE_KEY:   "HIGH",
  DELETE_KEY:   "CRITICAL",
};

// ── Provider Priority ─────────────────────────────────────────────────────────

/**
 * Provider resolution priority (lower = preferred).
 */
export const KMS_PROVIDER_PRIORITY: Record<KmsProviderType, number> = {
  AWS_KMS:         1,
  AZURE_KEY_VAULT: 2,
  GCP_KMS:         3,
  CUSTOM:          4,
  LOCAL:           99,  // Fallback only
};
