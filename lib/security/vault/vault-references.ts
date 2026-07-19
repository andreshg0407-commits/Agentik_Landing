/**
 * vault-references.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Secret Reference Utilities
 *
 * SecretRef URI format: vault://<organizationId>/<provider>/<secretId>
 *
 * Examples:
 *   vault://org_castillitos/dian/cert_prod_2024
 *   vault://org_castillitos/pya/soap_token
 *   vault://org_jupiter/meta/page_token_2024
 *   vault://org_arketops/shopify/admin_token
 *   vault://org_diana/banking/bancolombia_api
 *
 * Modules receive SecretRef objects, never raw secret values.
 * The vault resolves refs to payloads at runtime.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { SecretRef, VaultSecretType } from "./vault-types";

// ── URI schema ────────────────────────────────────────────────────────────────

const VAULT_SCHEME  = "vault://";
const URI_PATTERN   = /^vault:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * Build a SecretRef from components.
 *
 * All components are validated — none may be empty or contain slashes.
 *
 * @param organizationId  Tenant org ID (e.g. "org_castillitos")
 * @param provider        Integration provider slug (e.g. "dian", "pya", "meta")
 * @param secretId        Unique secret identifier within the org+provider scope
 * @param type            VaultSecretType discriminant
 */
export function buildSecretRef(
  organizationId: string,
  provider:       string,
  secretId:       string,
  type:           VaultSecretType,
): SecretRef {
  validateComponent("organizationId", organizationId);
  validateComponent("provider",       provider);
  validateComponent("secretId",       secretId);

  const uri = `${VAULT_SCHEME}${organizationId}/${provider}/${secretId}`;

  return { uri, organizationId, provider, secretId, type };
}

/**
 * Parse a vault:// URI string into a SecretRef.
 *
 * @throws VaultRefError if the URI is not a valid vault:// URI.
 */
export function parseSecretRef(
  uri:  string,
  type: VaultSecretType,
): SecretRef {
  const match = URI_PATTERN.exec(uri);
  if (!match) {
    throw new VaultRefError(
      `Invalid vault URI: "${uri}". ` +
      `Expected format: vault://<organizationId>/<provider>/<secretId>`,
    );
  }

  const [, organizationId, provider, secretId] = match as unknown as [string, string, string, string];

  return { uri, organizationId, provider, secretId, type };
}

// ── Standard ref builders ─────────────────────────────────────────────────────

/**
 * Build a SecretRef for a DIAN certificate password.
 *
 * Matches TenantCertificateRef.id in the DIAN tenant layer.
 *
 * @param organizationId  Tenant org ID
 * @param certId          TenantCertificateRef.id (e.g. "cert_prod_2024")
 */
export function dianCertRef(organizationId: string, certId: string): SecretRef {
  return buildSecretRef(organizationId, "dian", certId, "dian_certificate");
}

/**
 * Build a SecretRef for a DIAN software PIN.
 *
 * @param organizationId  Tenant org ID
 */
export function dianSoftwarePinRef(organizationId: string): SecretRef {
  return buildSecretRef(organizationId, "dian", "software_pin", "dian_software_pin");
}

/**
 * Build a SecretRef for a PYA/SAG SOAP API token.
 *
 * @param organizationId  Tenant org ID
 */
export function pyaTokenRef(organizationId: string): SecretRef {
  return buildSecretRef(organizationId, "pya", "soap_token", "api_token");
}

/**
 * Build a SecretRef for a Meta / Facebook Graph API token.
 *
 * @param organizationId  Tenant org ID
 * @param tokenId         Token identifier (e.g. "page_token", "system_token")
 */
export function metaTokenRef(organizationId: string, tokenId: string): SecretRef {
  return buildSecretRef(organizationId, "meta", tokenId, "meta_token");
}

/**
 * Build a SecretRef for a Shopify Admin API token.
 *
 * @param organizationId  Tenant org ID
 */
export function shopifyTokenRef(organizationId: string): SecretRef {
  return buildSecretRef(organizationId, "shopify", "admin_token", "shopify_token");
}

/**
 * Build a SecretRef for a TikTok Business API token.
 *
 * @param organizationId  Tenant org ID
 */
export function tiktokTokenRef(organizationId: string): SecretRef {
  return buildSecretRef(organizationId, "tiktok", "access_token", "tiktok_token");
}

/**
 * Build a SecretRef for a banking credential.
 *
 * @param organizationId  Tenant org ID
 * @param bankSlug        Bank identifier slug (e.g. "bancolombia", "davivienda")
 */
export function bankingCredentialRef(organizationId: string, bankSlug: string): SecretRef {
  return buildSecretRef(organizationId, "banking", bankSlug, "banking_credential");
}

// ── Guards and checks ─────────────────────────────────────────────────────────

/**
 * Check if a string is a vault:// URI.
 *
 * Use this before calling parseSecretRef() to avoid throwing on non-URI values.
 */
export function isVaultUri(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(VAULT_SCHEME);
}

/**
 * Check if two SecretRefs refer to the same secret.
 */
export function refEquals(a: SecretRef, b: SecretRef): boolean {
  return a.uri === b.uri;
}

/**
 * Extract a display-safe label from a SecretRef (no org or secret details).
 *
 * Suitable for UI and non-sensitive log output.
 *
 * @returns e.g. "dian/cert_prod_2024"
 */
export function refLabel(ref: SecretRef): string {
  return `${ref.provider}/${ref.secretId}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateComponent(name: string, value: string): void {
  if (!value || typeof value !== "string") {
    throw new VaultRefError(`SecretRef component "${name}" must be a non-empty string.`);
  }
  if (value.includes("/")) {
    throw new VaultRefError(
      `SecretRef component "${name}" must not contain slashes. Got: "${value}"`,
    );
  }
  if (value.includes(" ")) {
    throw new VaultRefError(
      `SecretRef component "${name}" must not contain spaces. Got: "${value}"`,
    );
  }
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class VaultRefError extends Error {
  constructor(message: string) {
    super(`[VaultRef] ${message}`);
    this.name = "VaultRefError";
  }
}
