/**
 * lib/integrations/dian/security/dian-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * DIAN Integration — Secret Provider
 *
 * Vault-First resolution for DIAN electronic invoicing secrets.
 * DIAN secrets are the highest-risk category: compromised certificates
 * can result in regulatory violations and audit failures.
 *
 * Secrets managed:
 *   DIAN_CERTIFICATE  — PKCS#12 certificate path or base64 content
 *   DIAN_PASSWORD     — Certificate password (NEVER log this)
 *
 * Special handling:
 *   - DIAN_CERTIFICATE in legacy is a filesystem PATH (not the cert bytes)
 *   - In Vault, the cert will be stored as base64-encoded bytes
 *   - This provider bridges both representations
 *
 * The existing CertificateVault interface (certificate-vault.ts) is
 * NOT modified. This provider is the migration path.
 *
 * Resolution hierarchy (Vault First):
 *   1. VaultService (new, encrypted, org-scoped)
 *   2. Legacy env variables (filesystem paths)
 *   3. NOT_FOUND — structured error, never throws
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * CRITICAL: DIAN passwords must NEVER appear in logs, errors, or audit events.
 */

import { EnvironmentSecretProvider, LegacyVaultSecretProvider } from "@/lib/security/vault/legacy-secret-adapter";
import { VaultFirstResolver } from "@/lib/security/vault/vault-first-resolver";
import { SECRET_KEYS, notFoundResult, type SecretProvider, type SecretResolutionResult } from "@/lib/security/vault/secret-provider";

// ── Vault stub ────────────────────────────────────────────────────────────────

class VaultSecretProviderStub implements SecretProvider {
  readonly providerId = "vault-stub";
  async getSecret(orgSlug: string, secretKey: string): Promise<SecretResolutionResult> {
    return notFoundResult(orgSlug, secretKey, 0);
  }
  async hasSecret(_o: string, _k: string): Promise<boolean> { return false; }
  async listSecrets(_o: string): Promise<string[]> { return []; }
}

// ── Resolver ──────────────────────────────────────────────────────────────────

function makeDianResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

let _certResolver:     VaultFirstResolver | null = null;
let _passwordResolver: VaultFirstResolver | null = null;

function getCertResolver(): VaultFirstResolver {
  if (!_certResolver) _certResolver = makeDianResolver();
  return _certResolver;
}

function getPasswordResolver(): VaultFirstResolver {
  if (!_passwordResolver) _passwordResolver = makeDianResolver();
  return _passwordResolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the DIAN certificate reference for a given org.
 *
 * Legacy: returns the filesystem PATH to the .p12 file.
 * Vault:  will return base64-encoded cert bytes (post-migration).
 *
 * Never throws. Check result.found before using result.secret.
 */
export async function resolveDianCertificate(orgSlug: string): Promise<SecretResolutionResult> {
  return getCertResolver().resolve(orgSlug, SECRET_KEYS.DIAN_CERTIFICATE);
}

/**
 * Resolve the DIAN certificate password for a given org.
 *
 * CRITICAL: The resolved value must NEVER be logged or included in errors.
 * Use result.secret transiently — never store it beyond the signing operation.
 *
 * Never throws. Check result.found before using result.secret.
 */
export async function resolveDianPassword(orgSlug: string): Promise<SecretResolutionResult> {
  return getPasswordResolver().resolve(orgSlug, SECRET_KEYS.DIAN_PASSWORD);
}

/** Check if DIAN certificate reference is available for a given org. */
export async function hasDianCertificate(orgSlug: string): Promise<boolean> {
  return getCertResolver().has(orgSlug, SECRET_KEYS.DIAN_CERTIFICATE);
}

/** Check if DIAN certificate password is available for a given org. */
export async function hasDianPassword(orgSlug: string): Promise<boolean> {
  return getPasswordResolver().has(orgSlug, SECRET_KEYS.DIAN_PASSWORD);
}
