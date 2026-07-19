/**
 * lib/integrations/tiktok/security/tiktok-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * TikTok Integration — Secret Provider
 *
 * Vault-First resolution for TikTok Business API secrets.
 *
 * Secrets managed:
 *   TIKTOK_TOKEN — TikTok Business API access token
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

function makeTikTokResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

let _resolver: VaultFirstResolver | null = null;
function getResolver(): VaultFirstResolver {
  if (!_resolver) _resolver = makeTikTokResolver();
  return _resolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Resolve the TikTok Business API access token for a given org. */
export async function resolveTikTokToken(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.TIKTOK_TOKEN);
}

/** Check if TikTok token is available for a given org. */
export async function hasTikTokToken(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.TIKTOK_TOKEN);
}
