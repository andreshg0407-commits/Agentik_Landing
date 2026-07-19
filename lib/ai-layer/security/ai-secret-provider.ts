/**
 * lib/ai-layer/security/ai-secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * AI Layer — Secret Provider
 *
 * Vault-First resolution for AI provider API keys.
 * Wraps the existing pattern of reading OPENAI_API_KEY and ANTHROPIC_API_KEY
 * from process.env behind the VaultFirstResolver abstraction.
 *
 * Resolution hierarchy:
 *   1. VaultService (new, encrypted, org-scoped)
 *   2. Legacy env (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 *   3. NOT_FOUND — never throws
 *
 * Existing AI adapter behavior is NOT changed.
 * This module provides the new secure path for future consumption.
 *
 * IMPORTANT: Never log resolved key values.
 * IMPORTANT: Backend-only — never import in client components.
 */

import { EnvironmentSecretProvider, LegacyVaultSecretProvider } from "@/lib/security/vault/legacy-secret-adapter";
import { VaultFirstResolver } from "@/lib/security/vault/vault-first-resolver";
import { SECRET_KEYS, type SecretResolutionResult } from "@/lib/security/vault/secret-provider";

// ── Vault provider stub ───────────────────────────────────────────────────────

// VaultService-backed provider is wired when Prisma is regenerated (post AGENTIK-SECURITY-VAULT-01).
// Until then, this stub returns not-found, causing fallthrough to environment.

import type { SecretProvider } from "@/lib/security/vault/secret-provider";
import { notFoundResult } from "@/lib/security/vault/secret-provider";

class VaultSecretProviderStub implements SecretProvider {
  readonly providerId = "vault-stub";
  async getSecret(orgSlug: string, secretKey: string): Promise<SecretResolutionResult> {
    return notFoundResult(orgSlug, secretKey, 0);
  }
  async hasSecret(_orgSlug: string, _secretKey: string): Promise<boolean> { return false; }
  async listSecrets(_orgSlug: string): Promise<string[]> { return []; }
}

// ── Resolver factory ──────────────────────────────────────────────────────────

function makeAiResolver(): VaultFirstResolver {
  return new VaultFirstResolver({
    vaultProvider:       new VaultSecretProviderStub(),
    legacyProvider:      new LegacyVaultSecretProvider(),
    environmentProvider: new EnvironmentSecretProvider(),
    shadowMode:          process.env["VAULT_SHADOW_MODE"] === "true",
  });
}

// Singleton — shared across all AI layer operations within a process.
let _resolver: VaultFirstResolver | null = null;

function getResolver(): VaultFirstResolver {
  if (!_resolver) _resolver = makeAiResolver();
  return _resolver;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the OpenAI API key for a given org.
 * Vault first → legacy env → not found.
 * Never throws.
 */
export async function resolveOpenAiApiKey(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.OPENAI_API_KEY);
}

/**
 * Resolve the Anthropic API key for a given org.
 * Vault first → legacy env → not found.
 * Never throws.
 */
export async function resolveAnthropicApiKey(orgSlug: string): Promise<SecretResolutionResult> {
  return getResolver().resolve(orgSlug, SECRET_KEYS.ANTHROPIC_API_KEY);
}

/**
 * Check if OpenAI API key is available for a given org.
 * Does not decrypt the value — lighter than resolve.
 */
export async function hasOpenAiApiKey(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.OPENAI_API_KEY);
}

/**
 * Check if Anthropic API key is available for a given org.
 */
export async function hasAnthropicApiKey(orgSlug: string): Promise<boolean> {
  return getResolver().has(orgSlug, SECRET_KEYS.ANTHROPIC_API_KEY);
}
