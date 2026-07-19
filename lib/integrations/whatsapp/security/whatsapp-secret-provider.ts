/**
 * lib/integrations/whatsapp/security/whatsapp-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * WhatsApp Integration — Secret Provider
 *
 * Vault-First resolution for WhatsApp Business Platform secrets.
 *
 * Secrets managed:
 *   WHATSAPP_TOKEN     — WhatsApp Business API access token
 *   META_ACCESS_TOKEN  — Meta Graph API access token (shared with Meta integration)
 *
 * Resolution hierarchy (Vault First):
 *   1. VaultService (new, encrypted, org-scoped)
 *   2. Legacy env variables
 *   3. NOT_FOUND — structured error, never throws
 *
 * Existing WhatsApp configuration is NOT modified.
 * This module provides the secure path for future token access.
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

function makeWhatsAppResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

let _resolver: VaultFirstResolver | null = null;
function getResolver(): VaultFirstResolver {
  if (!_resolver) _resolver = makeWhatsAppResolver();
  return _resolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Resolve the WhatsApp Business access token for a given org. */
export async function resolveWhatsAppToken(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.WHATSAPP_TOKEN);
}

/** Resolve the Meta access token for a given org (shared with Meta integration). */
export async function resolveMetaAccessToken(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.META_ACCESS_TOKEN);
}

/** Check if WhatsApp token is available for a given org. */
export async function hasWhatsAppToken(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.WHATSAPP_TOKEN);
}

/** Check if Meta access token is available for a given org. */
export async function hasMetaAccessToken(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.META_ACCESS_TOKEN);
}
