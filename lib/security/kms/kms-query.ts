/**
 * lib/security/kms/kms-query.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Query Layer — Read-Only Key Queries
 *
 * Server-only. Pure query functions over the key registry.
 *
 * All queries are tenant-scoped. Cross-tenant reads are NEVER permitted.
 * Returns defensive copies — callers cannot mutate registry state.
 */

import "server-only";

import type { KmsKeyMetadata } from "./kms-key";
import type { KmsProviderType } from "./kms-types";
import { listKeys } from "./key-registry";
import { kmsAuditLog } from "./kms-audit";

// ── Per-tenant queries ────────────────────────────────────────────────────────

/**
 * getActiveKeys — return all ACTIVE keys for a tenant.
 */
export function getActiveKeys(orgSlug: string): KmsKeyMetadata[] {
  return listKeys(orgSlug).filter(k => k.status === "ACTIVE");
}

/**
 * getRotatingKeys — return all ROTATING keys for a tenant.
 */
export function getRotatingKeys(orgSlug: string): KmsKeyMetadata[] {
  return listKeys(orgSlug).filter(k => k.status === "ROTATING");
}

/**
 * getDisabledKeys — return all DISABLED keys for a tenant.
 */
export function getDisabledKeys(orgSlug: string): KmsKeyMetadata[] {
  return listKeys(orgSlug).filter(k => k.status === "DISABLED");
}

/**
 * getRevokedKeys — return all REVOKED keys for a tenant.
 */
export function getRevokedKeys(orgSlug: string): KmsKeyMetadata[] {
  return listKeys(orgSlug).filter(k => k.status === "REVOKED");
}

/**
 * getExpiredKeys — return all keys that have passed their expiresAt timestamp.
 */
export function getExpiredKeys(orgSlug: string): KmsKeyMetadata[] {
  const now = new Date();
  return listKeys(orgSlug).filter(k =>
    k.expiresAt != null && new Date(k.expiresAt) < now,
  );
}

// ── Provider summary ──────────────────────────────────────────────────────────

/**
 * KmsProviderSummary — key distribution across providers.
 */
export interface KmsProviderSummary {
  provider:   KmsProviderType;
  keyCount:   number;
  activeKeys: number;
}

/**
 * getProviderSummary — return provider usage summary for a tenant.
 */
export function getProviderSummary(orgSlug: string): KmsProviderSummary[] {
  const keys  = listKeys(orgSlug);
  const byProvider = new Map<KmsProviderType, KmsKeyMetadata[]>();

  for (const key of keys) {
    const group = byProvider.get(key.provider) ?? [];
    group.push(key);
    byProvider.set(key.provider, group);
  }

  return Array.from(byProvider.entries()).map(([provider, providerKeys]) => ({
    provider,
    keyCount:   providerKeys.length,
    activeKeys: providerKeys.filter(k => k.status === "ACTIVE").length,
  }));
}

// ── Tenant summary ────────────────────────────────────────────────────────────

/**
 * KmsTenantKeySummary — KMS key health overview for a single tenant.
 */
export interface KmsTenantKeySummary {
  orgSlug:         string;
  total:           number;
  active:          number;
  rotating:        number;
  disabled:        number;
  revoked:         number;
  expired:         number;
  recentDenials:   number;
  hasRotatingKeys: boolean;
  hasExpiredKeys:  boolean;
}

/**
 * getTenantKeySummary — return a full KMS health overview for a tenant.
 */
export function getTenantKeySummary(orgSlug: string): KmsTenantKeySummary {
  const keys    = listKeys(orgSlug);
  const now     = new Date();
  const expired = keys.filter(k => k.expiresAt != null && new Date(k.expiresAt) < now);

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h
  const recentDenials = kmsAuditLog
    .getEventsForOrg(orgSlug)
    .filter(e => !e.success && new Date(e.occurredAt) >= windowStart)
    .length;

  return {
    orgSlug,
    total:           keys.length,
    active:          keys.filter(k => k.status === "ACTIVE").length,
    rotating:        keys.filter(k => k.status === "ROTATING").length,
    disabled:        keys.filter(k => k.status === "DISABLED").length,
    revoked:         keys.filter(k => k.status === "REVOKED").length,
    expired:         expired.length,
    recentDenials,
    hasRotatingKeys: keys.some(k => k.status === "ROTATING"),
    hasExpiredKeys:  expired.length > 0,
  };
}

// ── Key lookup convenience ────────────────────────────────────────────────────

/**
 * findKeyByAlgorithm — return all keys using a specific algorithm for a tenant.
 */
export function findKeyByAlgorithm(orgSlug: string, algorithm: string): KmsKeyMetadata[] {
  return listKeys(orgSlug).filter(k => k.algorithm === algorithm);
}

/**
 * findKeyByVersion — return key metadata matching a specific version.
 */
export function findKeyByVersion(orgSlug: string, keyAlias: string, version: number): KmsKeyMetadata | undefined {
  return listKeys(orgSlug).find(k => k.keyAlias === keyAlias && k.version === version);
}
