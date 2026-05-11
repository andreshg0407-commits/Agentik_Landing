/**
 * vault-types.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Type Definitions
 *
 * Defines the full type surface for the Agentik secrets vault:
 *   - SecretRef: what modules receive (never raw secrets)
 *   - VaultSecretPayload: decrypted secret shapes (in-memory only)
 *   - EncryptedSecretEnvelope: what is stored in Integration.secretsJson
 *   - VaultAccessRole: role-based access boundary model
 *   - VaultAccessContext: per-request access context
 *
 * Coverage:
 *   - DIAN certificates (PKCS#12 passwords)
 *   - DIAN software PINs
 *   - PYA / SAG SOAP tokens
 *   - OAuth tokens (Meta, Shopify, TikTok, banking)
 *   - Webhook secrets
 *   - Banking credentials
 *
 * Storage model:
 *   SecretRef references point to secrets stored in Integration.secretsJson.
 *   The vault layer is responsible for encrypting before write and decrypting
 *   after read. Prisma stores encrypted blobs — never plaintext.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: VaultSecretPayload values must never be logged or serialized.
 */

// ── Secret types ─────────────────────────────────────────────────────────────

/**
 * Canonical secret type identifiers.
 * Used for payload routing, audit logging, and redaction rules.
 */
export type VaultSecretType =
  | "dian_certificate"    // PKCS#12 certificate password
  | "dian_software_pin"   // DIAN habilitación/producción software PIN
  | "api_token"           // Generic API token (PYA, SAG, etc.)
  | "oauth_token"         // OAuth 2.0 access + refresh tokens
  | "webhook_secret"      // Webhook signature verify token
  | "banking_credential"  // Banking API username/password/apiKey
  | "meta_token"          // Meta / Facebook Graph API token
  | "shopify_token"       // Shopify Admin API token
  | "tiktok_token";       // TikTok Business API token

// ── Secret reference (public handle) ─────────────────────────────────────────

/**
 * A reference to a secret — not the secret itself.
 *
 * Modules receive SecretRef, not raw values.
 * The vault resolves the ref to a payload at runtime.
 *
 * URI format: vault://<organizationId>/<provider>/<secretId>
 *
 * Examples:
 *   vault://org_castillitos/dian/cert_prod_2024
 *   vault://org_castillitos/pya/soap_token
 *   vault://org_jupiter/meta/page_token_2024
 */
export interface SecretRef {
  /** Full vault URI — primary identifier. */
  uri:            string;
  /** Tenant boundary — same as organizationId in all Agentik models. */
  organizationId: string;
  /** Integration provider (e.g. "dian", "pya", "meta", "shopify"). */
  provider:       string;
  /** Secret ID within the provider for this tenant. */
  secretId:       string;
  /** Type of secret — drives payload shape and redaction rules. */
  type:           VaultSecretType;
}

// ── Decrypted payload shapes ──────────────────────────────────────────────────

/** PKCS#12 certificate password for a DIAN cert. */
export interface DianCertSecretPayload {
  type:         "dian_certificate";
  certPassword: string;
}

/** DIAN software PIN (habilitación or producción registration). */
export interface DianSoftwarePinPayload {
  type: "dian_software_pin";
  pin:  string;
}

/** Generic API token (used for PYA/SAG SOAP authentication). */
export interface ApiTokenPayload {
  type:         "api_token";
  token:        string;
  endpointUrl?: string;
  database?:    string;
}

/** OAuth 2.0 token set. */
export interface OAuthTokenPayload {
  type:          "oauth_token";
  accessToken:   string;
  refreshToken?: string;
  idToken?:      string;
  expiresAt?:    string; // ISO timestamp
}

/** Webhook signature verification secret. */
export interface WebhookSecretPayload {
  type:   "webhook_secret";
  secret: string;
}

/** Banking API credentials. */
export interface BankingCredentialPayload {
  type:     "banking_credential";
  username: string;
  password: string;
  apiKey?:  string;
}

/** Meta / Facebook Graph API token. */
export interface MetaTokenPayload {
  type:        "meta_token";
  accessToken: string;
  pageId?:     string;
  appId?:      string;
}

/** Shopify Admin API access token. */
export interface ShopifyTokenPayload {
  type:        "shopify_token";
  accessToken: string;
  shopDomain:  string;
}

/** TikTok Business API token. */
export interface TikTokTokenPayload {
  type:          "tiktok_token";
  accessToken:   string;
  refreshToken?: string;
  expiresAt?:    string;
}

/** Discriminated union of all payload types. */
export type VaultSecretPayload =
  | DianCertSecretPayload
  | DianSoftwarePinPayload
  | ApiTokenPayload
  | OAuthTokenPayload
  | WebhookSecretPayload
  | BankingCredentialPayload
  | MetaTokenPayload
  | ShopifyTokenPayload
  | TikTokTokenPayload;

// ── Encrypted storage envelope ────────────────────────────────────────────────

/**
 * Top-level structure stored in Integration.secretsJson.
 *
 * Version "2" — vault-managed envelope (replaces ad-hoc v1 shapes).
 * The ciphertext field in each entry is:
 *   base64( IV(12 bytes) || AuthTag(16 bytes) || AES-256-GCM-ciphertext )
 */
export interface VaultSecretEnvelope {
  version:    "2";
  algorithm:  "aes-256-gcm";
  secrets:    EncryptedSecretEntry[];
}

/** A single encrypted secret stored inside a VaultSecretEnvelope. */
export interface EncryptedSecretEntry {
  /** Matches SecretRef.secretId. */
  id:         string;
  /** Secret type — for routing and audit. Does not reveal content. */
  type:       VaultSecretType;
  /**
   * AES-256-GCM encrypted payload.
   * Format: base64( IV[12] || AuthTag[16] || Ciphertext )
   * Plaintext is JSON.stringify(VaultSecretPayload).
   */
  ciphertext: string;
  /** Key version for rotation tracking. Starts at 1. */
  keyVersion: number;
  /** ISO timestamp — when this entry was first created. */
  createdAt:  string;
  /** ISO timestamp — when this entry was last rotated. Null if never rotated. */
  rotatedAt:  string | null;
}

// ── Role-based access model ───────────────────────────────────────────────────

/**
 * Role boundaries for vault operations.
 *
 * SUPER_ADMIN      Can read and write secrets for any org (Agentik platform admins).
 * ORG_ADMIN        Can manage secrets for their organization.
 * FINANCE_ADMIN    Can read fiscal secrets (DIAN certs/PINs) for their org.
 * AGENTIK_SERVICE  Backend service account — read-only, no rotation.
 * OPERATOR         Read-only view of secret metadata (never raw values).
 */
export type VaultAccessRole =
  | "SUPER_ADMIN"
  | "ORG_ADMIN"
  | "FINANCE_ADMIN"
  | "AGENTIK_SERVICE"
  | "OPERATOR";

/**
 * Per-request access context passed to vault operations.
 * Populated by the authentication layer before calling vault methods.
 */
export interface VaultAccessContext {
  /** ID of the user or service making the request. */
  accessedBy:     string;
  /** Role of the caller — determines allowed operations. */
  role:           VaultAccessRole;
  /** Organization ID the caller is acting on behalf of. */
  organizationId: string;
  /** Optional request ID for distributed tracing. */
  requestId?:     string;
}

// ── Role permission map ───────────────────────────────────────────────────────

export type VaultOperation = "READ" | "WRITE" | "ROTATE" | "DELETE";

/**
 * Which operations each role is allowed to perform.
 * Enforced by SecureVault before dispatching any operation.
 */
export const VAULT_ROLE_PERMISSIONS: Record<VaultAccessRole, VaultOperation[]> = {
  SUPER_ADMIN:      ["READ", "WRITE", "ROTATE", "DELETE"],
  ORG_ADMIN:        ["READ", "WRITE", "ROTATE"],
  FINANCE_ADMIN:    ["READ"],
  AGENTIK_SERVICE:  ["READ"],
  OPERATOR:         [],
} as const;

/**
 * Which secret types each role may access.
 * SUPER_ADMIN and AGENTIK_SERVICE can access all types.
 * ORG_ADMIN can access all org-scoped secrets.
 * FINANCE_ADMIN is restricted to fiscal secrets only.
 * OPERATOR has no access to any secret values.
 */
export const VAULT_ROLE_SECRET_TYPES: Record<VaultAccessRole, VaultSecretType[] | "*"> = {
  SUPER_ADMIN:      "*",
  ORG_ADMIN:        "*",
  FINANCE_ADMIN:    ["dian_certificate", "dian_software_pin"],
  AGENTIK_SERVICE:  "*",
  OPERATOR:         [],
} as const;

// ── Vault operation result ─────────────────────────────────────────────────────

export interface VaultReadResult<T extends VaultSecretPayload = VaultSecretPayload> {
  success:    true;
  payload:    T;
  ref:        SecretRef;
  durationMs: number;
}

export interface VaultErrorResult {
  success:    false;
  error:      string;
  code:       VaultErrorCode;
  durationMs: number;
}

export type VaultResult<T extends VaultSecretPayload = VaultSecretPayload> =
  | VaultReadResult<T>
  | VaultErrorResult;

export type VaultErrorCode =
  | "NOT_FOUND"
  | "DECRYPTION_FAILED"
  | "ENCRYPTION_FAILED"
  | "ACCESS_DENIED"
  | "INVALID_REF"
  | "INVALID_PAYLOAD"
  | "KEY_NOT_CONFIGURED"
  | "STORE_READ_FAILED"
  | "STORE_WRITE_FAILED";
