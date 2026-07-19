/**
 * lib/integrations/erp/security/erp-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * ERP/SAG Integration — Secret Provider
 *
 * Vault-First resolution for ERP (SAG) integration secrets.
 *
 * Secrets managed:
 *   ERP_PASSWORD       — ERP/SAG service account password
 *   ERP_API_KEY        — ERP/SAG API key
 *   ERP_WEBHOOK_SECRET — ERP/SAG webhook signature verification secret
 *
 * Resolution hierarchy (Vault First):
 *   1. VaultService (new, encrypted, org-scoped)
 *   2. Legacy env variables
 *   3. NOT_FOUND — structured error, never throws
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * CRITICAL: ERP_PASSWORD must NEVER appear in logs, errors, or audit events.
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

function makeErpResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

let _passwordResolver:      VaultFirstResolver | null = null;
let _apiKeyResolver:        VaultFirstResolver | null = null;
let _webhookSecretResolver: VaultFirstResolver | null = null;

function getPasswordResolver(): VaultFirstResolver {
  if (!_passwordResolver) _passwordResolver = makeErpResolver();
  return _passwordResolver;
}

function getApiKeyResolver(): VaultFirstResolver {
  if (!_apiKeyResolver) _apiKeyResolver = makeErpResolver();
  return _apiKeyResolver;
}

function getWebhookSecretResolver(): VaultFirstResolver {
  if (!_webhookSecretResolver) _webhookSecretResolver = makeErpResolver();
  return _webhookSecretResolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the ERP/SAG service account password for a given org.
 *
 * CRITICAL: The resolved value must NEVER be logged or included in errors.
 * Use result.secret transiently — never store it beyond the ERP call.
 *
 * Never throws. Check result.found before using result.secret.
 */
export async function resolveErpPassword(orgSlug: string): Promise<SecretResolutionResult> {
  return getPasswordResolver().resolve(orgSlug, SECRET_KEYS.ERP_PASSWORD);
}

/**
 * Resolve the ERP/SAG API key for a given org.
 * Never throws. Check result.found before using result.secret.
 */
export async function resolveErpApiKey(orgSlug: string): Promise<SecretResolutionResult> {
  return getApiKeyResolver().resolve(orgSlug, SECRET_KEYS.ERP_API_KEY);
}

/**
 * Resolve the ERP/SAG webhook signature secret for a given org.
 * Never throws. Check result.found before using result.secret.
 */
export async function resolveErpWebhookSecret(orgSlug: string): Promise<SecretResolutionResult> {
  return getWebhookSecretResolver().resolve(orgSlug, SECRET_KEYS.ERP_WEBHOOK_SECRET);
}

/** Check if ERP password is available for a given org. */
export async function hasErpPassword(orgSlug: string): Promise<boolean> {
  return getPasswordResolver().has(orgSlug, SECRET_KEYS.ERP_PASSWORD);
}

/** Check if ERP API key is available for a given org. */
export async function hasErpApiKey(orgSlug: string): Promise<boolean> {
  return getApiKeyResolver().has(orgSlug, SECRET_KEYS.ERP_API_KEY);
}

/** Check if ERP webhook secret is available for a given org. */
export async function hasErpWebhookSecret(orgSlug: string): Promise<boolean> {
  return getWebhookSecretResolver().has(orgSlug, SECRET_KEYS.ERP_WEBHOOK_SECRET);
}
