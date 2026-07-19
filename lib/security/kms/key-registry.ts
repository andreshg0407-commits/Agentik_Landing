/**
 * lib/security/kms/key-registry.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Key Registry — Key Metadata Index
 *
 * Server-only. In-memory key metadata registry.
 *
 * CRITICAL CONSTRAINTS:
 *   - Only metadata is stored here — never key material
 *   - All operations are tenant-scoped (orgSlug required)
 *   - Cross-tenant access is NEVER permitted
 *   - Keys are indexed by (orgSlug, keyAlias) for O(1) lookup
 *
 * Note: This is an in-memory registry for the current process.
 * For persistence across restarts, use prisma-kms-repository.ts.
 * The engine syncs persistent state into this registry on startup.
 */

import "server-only";

import type { KmsKeyMetadata } from "./kms-key";
import type { KmsResult } from "./kms-types";

// ── Internal storage ──────────────────────────────────────────────────────────

/** Primary index: keyId → metadata */
const _byId: Map<string, KmsKeyMetadata> = new Map();

/** Secondary index: "orgSlug::keyAlias" → keyId */
const _byAlias: Map<string, string> = new Map();

function aliasKey(orgSlug: string, keyAlias: string): string {
  return `${orgSlug}::${keyAlias}`;
}

// ── registerKey ───────────────────────────────────────────────────────────────

/**
 * registerKey — add or update a key's metadata in the registry.
 * Does NOT store key material.
 */
export function registerKey(metadata: KmsKeyMetadata): KmsResult<KmsKeyMetadata> {
  if (!metadata.keyId || !metadata.orgSlug || !metadata.keyAlias) {
    return { ok: false, error: "invalid_key_metadata:missing_required_fields", riskLevel: "CRITICAL" };
  }

  const ak = aliasKey(metadata.orgSlug, metadata.keyAlias);

  // If alias already exists for a different keyId → reject
  const existing = _byAlias.get(ak);
  if (existing && existing !== metadata.keyId) {
    return { ok: false, error: "key_alias_conflict_different_keyId", riskLevel: "HIGH" };
  }

  _byId.set(metadata.keyId, { ...metadata });
  _byAlias.set(ak, metadata.keyId);

  return { ok: true, value: { ...metadata } };
}

// ── getKey ────────────────────────────────────────────────────────────────────

/**
 * getKey — look up metadata by keyId and orgSlug.
 */
export function getKey(keyId: string, orgSlug: string): KmsResult<KmsKeyMetadata> {
  const meta = _byId.get(keyId);
  if (!meta) {
    return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
  }
  if (meta.orgSlug !== orgSlug) {
    return { ok: false, error: "cross_tenant_key_access_denied", riskLevel: "CRITICAL" };
  }
  return { ok: true, value: { ...meta } };
}

// ── getKeyByAlias ─────────────────────────────────────────────────────────────

/**
 * getKeyByAlias — look up metadata by (orgSlug, keyAlias).
 */
export function getKeyByAlias(orgSlug: string, keyAlias: string): KmsResult<KmsKeyMetadata> {
  const ak    = aliasKey(orgSlug, keyAlias);
  const keyId = _byAlias.get(ak);
  if (!keyId) {
    return { ok: false, error: "key_alias_not_found", riskLevel: "HIGH" };
  }
  return getKey(keyId, orgSlug);
}

// ── getKeyVersion ─────────────────────────────────────────────────────────────

/**
 * getKeyVersion — retrieve metadata and confirm a specific version is tracked.
 */
export function getKeyVersion(keyId: string, orgSlug: string, version: number): KmsResult<KmsKeyMetadata> {
  const result = getKey(keyId, orgSlug);
  if (!result.ok) return result;
  if (result.value.version < version) {
    return { ok: false, error: "key_version_not_found", riskLevel: "HIGH" };
  }
  return result;
}

// ── listKeys ──────────────────────────────────────────────────────────────────

/**
 * listKeys — return all keys for a tenant.
 */
export function listKeys(orgSlug: string): KmsKeyMetadata[] {
  return Array.from(_byId.values())
    .filter(m => m.orgSlug === orgSlug)
    .map(m => ({ ...m }));
}

/**
 * listKeysByTenant — alias for listKeys (explicit name for multi-tenant clarity).
 */
export function listKeysByTenant(orgSlug: string): KmsKeyMetadata[] {
  return listKeys(orgSlug);
}

// ── updateKey ─────────────────────────────────────────────────────────────────

/**
 * updateKey — update mutable metadata fields for an existing key.
 * keyId and orgSlug cannot be changed.
 */
export function updateKey(keyId: string, orgSlug: string, updates: Partial<Omit<KmsKeyMetadata, "keyId" | "orgSlug">>): KmsResult<KmsKeyMetadata> {
  const result = getKey(keyId, orgSlug);
  if (!result.ok) return result;

  const updated: KmsKeyMetadata = { ...result.value, ...updates, keyId, orgSlug };
  _byId.set(keyId, updated);

  return { ok: true, value: { ...updated } };
}

// ── removeKey ─────────────────────────────────────────────────────────────────

/**
 * removeKey — remove a key from the registry.
 * Used after permanent deletion.
 */
export function removeKey(keyId: string, orgSlug: string): KmsResult<{ removed: boolean }> {
  const result = getKey(keyId, orgSlug);
  if (!result.ok) return result;

  const ak = aliasKey(orgSlug, result.value.keyAlias);
  _byId.delete(keyId);
  _byAlias.delete(ak);

  return { ok: true, value: { removed: true } };
}

// ── Registry stats ────────────────────────────────────────────────────────────

/**
 * getRegistryStats — summary of registered keys.
 */
export function getRegistryStats(): { total: number; byStatus: Record<string, number> } {
  const all = Array.from(_byId.values());
  const byStatus: Record<string, number> = {};
  for (const k of all) {
    byStatus[k.status] = (byStatus[k.status] ?? 0) + 1;
  }
  return { total: all.length, byStatus };
}

/** Reset registry (for testing only). */
export function _resetRegistry(): void {
  _byId.clear();
  _byAlias.clear();
}
