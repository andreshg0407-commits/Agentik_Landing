/**
 * lib/security/kms/kms-report-builder.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Report Builder — Structured Compliance and Operational Reports
 *
 * No server-only. No Prisma. Pure domain aggregators.
 * All reports are JSON-serializable and tenant-scoped.
 */

import type { KmsKeyMetadata } from "./kms-key";
import type { KmsAuditEvent } from "./kms-audit";
import type { KmsHealthStatus, KmsProviderType } from "./kms-types";

// ── Key Inventory Report ──────────────────────────────────────────────────────

export interface KmsKeyInventoryReport {
  orgSlug:        string;
  generatedAt:    string;
  totalKeys:      number;
  byStatus:       Record<string, number>;
  byProvider:     Record<KmsProviderType, number>;
  byAlgorithm:    Record<string, number>;
  expiringKeys:   KmsKeyMetadata[];
  rotatingKeys:   KmsKeyMetadata[];
  revokedKeys:    KmsKeyMetadata[];
}

/**
 * buildKeyInventoryReport — summarize key state for a tenant.
 */
export function buildKeyInventoryReport(
  orgSlug:   string,
  keys:      KmsKeyMetadata[],
  daysUntilExpiry: number = 30,
): KmsKeyInventoryReport {
  const now       = new Date();
  const cutoff    = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);
  const tenantKeys = keys.filter(k => k.orgSlug === orgSlug);

  const byStatus: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byAlgorithm: Record<string, number> = {};

  for (const k of tenantKeys) {
    byStatus[k.status]       = (byStatus[k.status] ?? 0) + 1;
    byProvider[k.provider]   = (byProvider[k.provider] ?? 0) + 1;
    byAlgorithm[k.algorithm] = (byAlgorithm[k.algorithm] ?? 0) + 1;
  }

  const expiringKeys = tenantKeys.filter(k =>
    k.expiresAt != null &&
    new Date(k.expiresAt) > now &&
    new Date(k.expiresAt) <= cutoff,
  );

  return {
    orgSlug,
    generatedAt:  now.toISOString(),
    totalKeys:    tenantKeys.length,
    byStatus,
    byProvider:   byProvider as Record<KmsProviderType, number>,
    byAlgorithm,
    expiringKeys,
    rotatingKeys: tenantKeys.filter(k => k.status === "ROTATING"),
    revokedKeys:  tenantKeys.filter(k => k.status === "REVOKED"),
  };
}

// ── Provider Report ───────────────────────────────────────────────────────────

export interface KmsProviderReport {
  generatedAt:    string;
  totalProviders: number;
  providers: Array<{
    type:       KmsProviderType;
    keyCount:   number;
    activeKeys: number;
    status:     KmsHealthStatus;
  }>;
}

/**
 * buildProviderReport — summarize provider usage across all tenants.
 */
export function buildProviderReport(
  keys:           KmsKeyMetadata[],
  providerHealth: Record<KmsProviderType, KmsHealthStatus>,
): KmsProviderReport {
  const byProvider = new Map<KmsProviderType, KmsKeyMetadata[]>();

  for (const key of keys) {
    const group = byProvider.get(key.provider) ?? [];
    group.push(key);
    byProvider.set(key.provider, group);
  }

  const providers = Array.from(byProvider.entries()).map(([type, providerKeys]) => ({
    type,
    keyCount:   providerKeys.length,
    activeKeys: providerKeys.filter(k => k.status === "ACTIVE").length,
    status:     providerHealth[type] ?? "UNAVAILABLE",
  }));

  return {
    generatedAt:    new Date().toISOString(),
    totalProviders: providers.length,
    providers,
  };
}

// ── Rotation Report ───────────────────────────────────────────────────────────

export interface KmsRotationReport {
  orgSlug:           string;
  generatedAt:       string;
  windowDays:        number;
  rotationsInWindow: number;
  keysNeedingRotation: KmsKeyMetadata[];
  recentRotations:   KmsAuditEvent[];
}

/**
 * buildRotationReport — summarize rotation activity and pending rotations.
 */
export function buildRotationReport(
  orgSlug:       string,
  keys:          KmsKeyMetadata[],
  events:        KmsAuditEvent[],
  windowDays:    number = 30,
  rotationMaxAgeDays: number = 90,
): KmsRotationReport {
  const now        = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rotationCutoff = new Date(now.getTime() - rotationMaxAgeDays * 24 * 60 * 60 * 1000);

  const tenantKeys  = keys.filter(k => k.orgSlug === orgSlug);
  const recentRotations = events.filter(e =>
    e.orgSlug === orgSlug &&
    e.eventType === "KEY_ROTATED" &&
    new Date(e.occurredAt) >= windowStart,
  );

  const keysNeedingRotation = tenantKeys.filter(k => {
    const rotatedDate = k.rotatedAt ? new Date(k.rotatedAt) : new Date(k.createdAt);
    return k.status === "ACTIVE" && rotatedDate < rotationCutoff;
  });

  return {
    orgSlug,
    generatedAt:         now.toISOString(),
    windowDays,
    rotationsInWindow:   recentRotations.length,
    keysNeedingRotation,
    recentRotations,
  };
}

// ── Compliance Report ─────────────────────────────────────────────────────────

export interface KmsComplianceReport {
  orgSlug:              string;
  generatedAt:          string;
  complianceScore:      number;   // 0–100
  findings: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    finding:  string;
    count:    number;
  }>;
  passedChecks:         string[];
}

/**
 * buildComplianceReport — evaluate compliance posture for a tenant's KMS.
 */
export function buildComplianceReport(
  orgSlug:       string,
  keys:          KmsKeyMetadata[],
  events:        KmsAuditEvent[],
): KmsComplianceReport {
  const now        = new Date();
  const tenantKeys = keys.filter(k => k.orgSlug === orgSlug);
  const findings: KmsComplianceReport["findings"] = [];
  const passed: string[] = [];

  // Check: no expired active keys
  const expiredActive = tenantKeys.filter(k =>
    k.status === "ACTIVE" && k.expiresAt != null && new Date(k.expiresAt) < now,
  );
  if (expiredActive.length > 0) {
    findings.push({ severity: "HIGH", finding: "expired_active_keys", count: expiredActive.length });
  } else {
    passed.push("no_expired_active_keys");
  }

  // Check: no REVOKED keys still referenced
  const revokedKeys = tenantKeys.filter(k => k.status === "REVOKED");
  if (revokedKeys.length > 0) {
    findings.push({ severity: "MEDIUM", finding: "revoked_keys_present", count: revokedKeys.length });
  } else {
    passed.push("no_revoked_keys");
  }

  // Check: recent access denials
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentDenials = events.filter(e =>
    e.orgSlug === orgSlug && !e.success && new Date(e.occurredAt) >= windowStart,
  );
  if (recentDenials.length > 5) {
    findings.push({ severity: "HIGH", finding: "excessive_access_denials_24h", count: recentDenials.length });
  } else {
    passed.push("access_denial_rate_acceptable");
  }

  // Check: all active keys have an algorithm set
  const noAlgorithm = tenantKeys.filter(k => k.status === "ACTIVE" && !k.algorithm);
  if (noAlgorithm.length > 0) {
    findings.push({ severity: "MEDIUM", finding: "active_keys_missing_algorithm", count: noAlgorithm.length });
  } else {
    passed.push("all_active_keys_have_algorithm");
  }

  const totalChecks = findings.length + passed.length;
  const score = totalChecks === 0
    ? 100
    : Math.round((passed.length / totalChecks) * 100);

  return {
    orgSlug,
    generatedAt:     now.toISOString(),
    complianceScore: score,
    findings,
    passedChecks:    passed,
  };
}
