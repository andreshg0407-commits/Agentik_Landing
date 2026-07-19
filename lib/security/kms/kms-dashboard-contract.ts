/**
 * lib/security/kms/kms-dashboard-contract.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Dashboard Contract — Pure Domain Aggregators
 *
 * No server-only. No Prisma. Pure domain contracts.
 * Aggregates KMS audit events and key metadata into dashboard shapes.
 *
 * These are the contracts consumed by the KMS admin dashboard
 * (to be built in a future UX sprint).
 */

import type { KmsKeyMetadata } from "./kms-key";
import type { KmsAuditEvent } from "./kms-audit";
import type { KmsHealthStatus, KmsProviderType } from "./kms-types";

// ── KMS Dashboard Payload ─────────────────────────────────────────────────────

export interface KmsDashboardPayload {
  /** Total number of registered keys across all tenants. */
  keysTotal:        number;
  /** Number of ACTIVE keys. */
  keysActive:       number;
  /** Number of keys currently ROTATING. */
  keysRotating:     number;
  /** Number of DISABLED keys. */
  keysDisabled:     number;
  /** Number of REVOKED keys. */
  keysRevoked:      number;
  /** Number of keys expired (expiresAt < now). */
  keysExpired:      number;
  /** Total KMS operations audited. */
  totalOperations:  number;
  /** Number of denied operations in the window. */
  deniedOperations: number;
  /** Number of key rotations in the window. */
  rotationsInWindow: number;
  /** Provider breakdown: provider → key count. */
  keysByProvider:   Record<KmsProviderType, number>;
  /** Overall KMS health status. */
  healthStatus:     KmsHealthStatus;
  /** ISO 8601 timestamp of this snapshot. */
  generatedAt:      string;
  /** Events included in this window. */
  windowStart:      string;
  windowEnd:        string;
}

// ── buildKmsDashboard ─────────────────────────────────────────────────────────

/**
 * buildKmsDashboard — aggregate key metadata and audit events into a dashboard.
 *
 * Pure function. Never throws. Uses empty arrays as defaults.
 */
export function buildKmsDashboard(
  keys:        KmsKeyMetadata[],
  events:      KmsAuditEvent[],
  healthStatus: KmsHealthStatus,
  windowStart:  string,
  windowEnd:    string,
): KmsDashboardPayload {
  const now         = new Date().toISOString();
  const windowStart_d = new Date(windowStart);
  const windowEnd_d   = new Date(windowEnd);

  const keysActive   = keys.filter(k => k.status === "ACTIVE").length;
  const keysRotating = keys.filter(k => k.status === "ROTATING").length;
  const keysDisabled = keys.filter(k => k.status === "DISABLED").length;
  const keysRevoked  = keys.filter(k => k.status === "REVOKED").length;
  const keysExpired  = keys.filter(k =>
    k.expiresAt != null && new Date(k.expiresAt) < new Date(),
  ).length;

  const windowEvents = events.filter(e => {
    const ts = new Date(e.occurredAt);
    return ts >= windowStart_d && ts <= windowEnd_d;
  });

  const deniedOperations  = windowEvents.filter(e => !e.success).length;
  const rotationsInWindow = windowEvents.filter(e => e.eventType === "KEY_ROTATED").length;

  const keysByProvider = keys.reduce(
    (acc, k) => {
      acc[k.provider] = (acc[k.provider] ?? 0) + 1;
      return acc;
    },
    {} as Record<KmsProviderType, number>,
  );

  return {
    keysTotal:         keys.length,
    keysActive,
    keysRotating,
    keysDisabled,
    keysRevoked,
    keysExpired,
    totalOperations:   windowEvents.length,
    deniedOperations,
    rotationsInWindow,
    keysByProvider,
    healthStatus,
    generatedAt:       now,
    windowStart,
    windowEnd,
  };
}

// ── buildEmptyKmsDashboard ────────────────────────────────────────────────────

/**
 * buildEmptyKmsDashboard — return a zeroed dashboard payload.
 */
export function buildEmptyKmsDashboard(): KmsDashboardPayload {
  const now = new Date().toISOString();
  return {
    keysTotal:         0,
    keysActive:        0,
    keysRotating:      0,
    keysDisabled:      0,
    keysRevoked:       0,
    keysExpired:       0,
    totalOperations:   0,
    deniedOperations:  0,
    rotationsInWindow: 0,
    keysByProvider:    {} as Record<KmsProviderType, number>,
    healthStatus:      "UNAVAILABLE",
    generatedAt:       now,
    windowStart:       now,
    windowEnd:         now,
  };
}

// ── KMS Tenant Summary ────────────────────────────────────────────────────────

export interface KmsTenantSummary {
  orgSlug:     string;
  keysTotal:   number;
  keysActive:  number;
  lastActivity: string | null;
}

/**
 * buildTenantSummaries — group key metadata by tenant.
 */
export function buildTenantSummaries(keys: KmsKeyMetadata[]): KmsTenantSummary[] {
  const byTenant = new Map<string, KmsKeyMetadata[]>();

  for (const key of keys) {
    const group = byTenant.get(key.orgSlug) ?? [];
    group.push(key);
    byTenant.set(key.orgSlug, group);
  }

  return Array.from(byTenant.entries()).map(([orgSlug, tenantKeys]) => ({
    orgSlug,
    keysTotal:    tenantKeys.length,
    keysActive:   tenantKeys.filter(k => k.status === "ACTIVE").length,
    lastActivity: tenantKeys.reduce<string | null>((latest, k) => {
      const ts = k.rotatedAt ?? k.createdAt;
      return !latest || ts > latest ? ts : latest;
    }, null),
  }));
}
