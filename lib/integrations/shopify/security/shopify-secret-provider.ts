/**
 * lib/integrations/shopify/security/shopify-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Shopify Integration — Secret Provider
 *
 * Vault-First resolution for Shopify Admin API secrets.
 * The existing ShopifyAdminClient injects the access token at call time.
 * This provider is the secure path for obtaining that token.
 *
 * Secrets managed:
 *   SHOPIFY_TOKEN          — Shopify Admin API access token
 *   SHOPIFY_WEBHOOK_SECRET — HMAC webhook signature verification secret
 *
 * Resolution hierarchy (Vault First):
 *   1. VaultService (new, encrypted, org-scoped)
 *   2. Legacy env variables
 *   3. NOT_FOUND — structured error, never throws
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log token values.
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

function makeShopifyResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

let _resolver: VaultFirstResolver | null = null;
function getResolver(): VaultFirstResolver {
  if (!_resolver) _resolver = makeShopifyResolver();
  return _resolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Resolve the Shopify Admin API access token for a given org. */
export async function resolveShopifyToken(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.SHOPIFY_TOKEN);
}

/** Resolve the Shopify webhook signature secret for a given org. */
export async function resolveShopifyWebhookSecret(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.SHOPIFY_WEBHOOK_SECRET);
}

/** Check if Shopify token is available for a given org. */
export async function hasShopifyToken(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.SHOPIFY_TOKEN);
}

/** Check if Shopify webhook secret is available for a given org. */
export async function hasShopifyWebhookSecret(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.SHOPIFY_WEBHOOK_SECRET);
}
