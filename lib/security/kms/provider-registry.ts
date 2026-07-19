/**
 * lib/security/kms/provider-registry.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Provider Registry — Registration and Resolution
 *
 * Server-only. Manages the set of available KMS providers.
 *
 * Rules:
 *   - LOCAL provider is always registered as fallback
 *   - AWS/Azure/GCP are registered when SDK is integrated
 *   - resolveProvider() returns LOCAL if preferred provider unavailable
 *   - Unknown provider type → CRITICAL error
 *   - Fail-closed: no registered provider → deny all operations
 */

import "server-only";

import type { KmsProviderType, KmsResult } from "./kms-types";
import type { KmsProvider } from "./kms-provider";
import { localKmsProvider } from "./providers/local-kms-provider";

// ── Registry Store ────────────────────────────────────────────────────────────

const _registry: Map<KmsProviderType, KmsProvider> = new Map();

// Bootstrap with LOCAL provider as the always-available fallback
_registry.set("LOCAL", localKmsProvider);

// ── registerProvider ──────────────────────────────────────────────────────────

/**
 * registerProvider — add a KMS provider to the registry.
 * Call this at application startup when SDKs are available.
 */
export function registerProvider(provider: KmsProvider): void {
  _registry.set(provider.providerType, provider);
}

// ── getProvider ───────────────────────────────────────────────────────────────

/**
 * getProvider — retrieve a registered provider by type.
 * Returns the provider or a PROVIDER_NOT_REGISTERED error.
 */
export function getProvider(providerType: KmsProviderType): KmsResult<KmsProvider> {
  const provider = _registry.get(providerType);
  if (!provider) {
    return {
      ok:        false,
      error:     `provider_not_registered:${providerType}`,
      riskLevel: "CRITICAL",
    };
  }
  return { ok: true, value: provider };
}

// ── resolveProvider ───────────────────────────────────────────────────────────

/**
 * resolveProvider — resolve the best available provider for an operation.
 *
 * Priority:
 *   1. Requested provider (if registered)
 *   2. LOCAL (fallback)
 *   3. Error if nothing available
 */
export function resolveProvider(
  preferred?: KmsProviderType,
): KmsResult<KmsProvider> {
  if (preferred) {
    const result = getProvider(preferred);
    if (result.ok) return result;
  }

  // Fallback to LOCAL
  const local = _registry.get("LOCAL");
  if (local) {
    return { ok: true, value: local };
  }

  return {
    ok:        false,
    error:     "no_kms_provider_available",
    riskLevel: "CRITICAL",
  };
}

// ── listRegisteredProviders ───────────────────────────────────────────────────

/**
 * listRegisteredProviders — return the set of currently registered provider types.
 */
export function listRegisteredProviders(): KmsProviderType[] {
  return Array.from(_registry.keys());
}

/**
 * isProviderRegistered — check if a provider type is registered.
 */
export function isProviderRegistered(providerType: KmsProviderType): boolean {
  return _registry.has(providerType);
}
