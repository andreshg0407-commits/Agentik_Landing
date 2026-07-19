/**
 * lib/security/secret-rotation/rotation-report-builder.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Report Builder — Structured Reports for Audit, Compliance, and Ops
 *
 * No server-only. No Prisma. Pure domain report assembly.
 *
 * Functions:
 *   buildRotationReport()    — status report for a set of rotations
 *   buildExpirationReport()  — expiring secrets by urgency band
 *   buildComplianceReport()  — policy compliance across registered secrets
 */

import type { RotationRecord }        from "./rotation-repository";
import type { SecretVersion }         from "./secret-version";
import type { RotationRegistryEntry } from "./rotation-registry";
import type { RotationRiskLevel }     from "./rotation-types";
import { ROTATION_REGISTRY }          from "./rotation-registry";
import { isVersionExpired, versionAgeInDays } from "./secret-version";

// ── Shared ────────────────────────────────────────────────────────────────────

export interface ReportMeta {
  generatedAt:  string;
  generatedBy:  string;
  orgSlug:      string;
}

// ── Rotation Report ───────────────────────────────────────────────────────────

export interface RotationSummaryItem {
  secretId:    string;
  strategy:    string;
  status:      string;
  requestedBy: string;
  createdAt:   string;
  activatedAt: string | null;
  revokedAt:   string | null;
  completedAt: string | null;
  durationMs:  number | null;
}

export interface RotationStatusBreakdown {
  PENDING:    number;
  VALIDATING: number;
  READY:      number;
  ACTIVE:     number;
  REVOKED:    number;
  FAILED:     number;
  CANCELLED:  number;
}

export interface RotationReport {
  meta:         ReportMeta;
  totalCount:   number;
  breakdown:    RotationStatusBreakdown;
  failureRate:  number; // 0–1
  successRate:  number; // 0–1
  rotations:    RotationSummaryItem[];
  insights:     string[];
}

export function buildRotationReport(params: {
  rotations: RotationRecord[];
  orgSlug:   string;
  requestedBy?: string;
}): RotationReport {
  const { rotations, orgSlug, requestedBy = "system" } = params;

  const breakdown: RotationStatusBreakdown = {
    PENDING: 0, VALIDATING: 0, READY: 0, ACTIVE: 0,
    REVOKED: 0, FAILED: 0, CANCELLED: 0,
  };

  const items: RotationSummaryItem[] = rotations.map(r => {
    const st = r.status as keyof RotationStatusBreakdown;
    if (st in breakdown) breakdown[st]++;

    const activatedMs  = r.activatedAt  ? new Date(r.activatedAt).getTime()  : null;
    const completedMs  = r.completedAt  ? new Date(r.completedAt).getTime()  : null;
    const createdMs    = new Date(r.createdAt).getTime();
    const durationMs   = completedMs != null ? completedMs - createdMs : null;

    return {
      secretId:    r.secretId,
      strategy:    r.strategy,
      status:      r.status,
      requestedBy: r.requestedBy,
      createdAt:   r.createdAt,
      activatedAt: r.activatedAt  ?? null,
      revokedAt:   r.revokedAt    ?? null,
      completedAt: r.completedAt  ?? null,
      durationMs,
    };
  });

  const terminal  = breakdown.ACTIVE + breakdown.REVOKED + breakdown.FAILED + breakdown.CANCELLED;
  const succeeded = breakdown.REVOKED; // REVOKED = fully completed rotation
  const failed    = breakdown.FAILED;
  const failureRate = terminal > 0 ? failed / terminal : 0;
  const successRate = terminal > 0 ? succeeded / terminal : 0;

  const insights: string[] = [];
  if (breakdown.FAILED > 0)
    insights.push(`${breakdown.FAILED} rotation(s) failed — review failure reason in metadata.`);
  if (breakdown.PENDING > 2)
    insights.push(`${breakdown.PENDING} rotations stuck in PENDING — consider re-triggering validation.`);
  if (successRate < 0.8 && terminal >= 5)
    insights.push(`Success rate below 80% (${Math.round(successRate * 100)}%) — investigate failure patterns.`);
  if (insights.length === 0)
    insights.push("Rotation health nominal.");

  return {
    meta: { generatedAt: new Date().toISOString(), generatedBy: requestedBy, orgSlug },
    totalCount: rotations.length,
    breakdown,
    failureRate: Math.round(failureRate * 10000) / 10000,
    successRate: Math.round(successRate * 10000) / 10000,
    rotations: items,
    insights,
  };
}

// ── Expiration Report ─────────────────────────────────────────────────────────

export type ExpirationUrgency = "CRITICAL" | "WARNING" | "NOTICE" | "OK";

export interface ExpirationItem {
  secretId:        string;
  version:         number;
  status:          string;
  orgSlug:         string;
  expiresAt:       string | null;
  ageInDays:       number;
  daysUntilExpiry: number | null;
  urgency:         ExpirationUrgency;
  registryEntry:   RotationRegistryEntry | null;
}

export interface ExpirationReport {
  meta:      ReportMeta;
  total:     number;
  critical:  ExpirationItem[];
  warning:   ExpirationItem[];
  notice:    ExpirationItem[];
  ok:        ExpirationItem[];
  insights:  string[];
}

function getDaysUntilExpiry(version: SecretVersion): number | null {
  if (!version.expiresAt) return null;
  const msLeft = new Date(version.expiresAt).getTime() - Date.now();
  return Math.ceil(msLeft / 86_400_000);
}

function classifyUrgency(version: SecretVersion, entry: RotationRegistryEntry | null): ExpirationUrgency {
  if (isVersionExpired(version)) return "CRITICAL";
  const days = getDaysUntilExpiry(version);
  if (days !== null && days <= 7)  return "CRITICAL";
  if (days !== null && days <= 30) return "WARNING";

  const ageDays = versionAgeInDays(version);
  const maxDays = entry?.recommendedRotationDays ?? 180;
  if (ageDays >= maxDays)       return "CRITICAL";
  if (ageDays >= maxDays * 0.8) return "WARNING";
  if (ageDays >= maxDays * 0.6) return "NOTICE";
  return "OK";
}

export function buildExpirationReport(params: {
  versions:    SecretVersion[];
  orgSlug:     string;
  requestedBy?: string;
}): ExpirationReport {
  const { versions, orgSlug, requestedBy = "system" } = params;

  const items: ExpirationItem[] = versions.map(v => {
    const entry = ROTATION_REGISTRY.find(r => r.id === v.secretId) ?? null;
    return {
      secretId:        v.secretId,
      version:         v.version,
      status:          v.status,
      orgSlug:         v.orgSlug,
      expiresAt:       v.expiresAt ?? null,
      ageInDays:       Math.round(versionAgeInDays(v)),
      daysUntilExpiry: getDaysUntilExpiry(v),
      urgency:         classifyUrgency(v, entry),
      registryEntry:   entry,
    };
  });

  const critical = items.filter(i => i.urgency === "CRITICAL");
  const warning  = items.filter(i => i.urgency === "WARNING");
  const notice   = items.filter(i => i.urgency === "NOTICE");
  const ok       = items.filter(i => i.urgency === "OK");

  const insights: string[] = [];
  if (critical.length > 0)
    insights.push(`${critical.length} secret version(s) require IMMEDIATE rotation (expired or <7 days).`);
  if (warning.length > 0)
    insights.push(`${warning.length} secret version(s) require rotation within 30 days.`);
  if (notice.length > 0)
    insights.push(`${notice.length} secret version(s) are approaching recommended rotation age.`);
  if (critical.length === 0 && warning.length === 0)
    insights.push("All tracked secret versions are within rotation policy thresholds.");

  return {
    meta: { generatedAt: new Date().toISOString(), generatedBy: requestedBy, orgSlug },
    total: items.length,
    critical,
    warning,
    notice,
    ok,
    insights,
  };
}

// ── Compliance Report ─────────────────────────────────────────────────────────

export type ComplianceStatus = "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN";

export interface ComplianceItem {
  secretId:           string;
  name:               string;
  riskLevel:          RotationRiskLevel;
  rotationSupported:  boolean;
  requiresApproval:   boolean;
  requiresDoubleApproval: boolean;
  hasActiveVersion:   boolean;
  hasRecentRotation:  boolean;
  lastRotatedAt:      string | null;
  complianceStatus:   ComplianceStatus;
  violations:         string[];
}

export interface ComplianceSummary {
  total:          number;
  compliant:      number;
  nonCompliant:   number;
  unknown:        number;
  complianceRate: number; // 0–1
}

export interface ComplianceReport {
  meta:      ReportMeta;
  summary:   ComplianceSummary;
  items:     ComplianceItem[];
  insights:  string[];
}

export function buildComplianceReport(params: {
  versions:    SecretVersion[];
  rotations:   RotationRecord[];
  orgSlug:     string;
  requestedBy?: string;
}): ComplianceReport {
  const { versions, rotations, orgSlug, requestedBy = "system" } = params;

  const activeVersionsBySecret = new Map<string, SecretVersion>();
  for (const v of versions) {
    if (v.status === "ACTIVE") activeVersionsBySecret.set(v.secretId, v);
  }

  const lastRotationBySecret = new Map<string, RotationRecord>();
  for (const r of rotations) {
    const existing = lastRotationBySecret.get(r.secretId);
    if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
      lastRotationBySecret.set(r.secretId, r);
    }
  }

  const RECENT_THRESHOLD_MS = 90 * 86_400_000; // 90 days

  const items: ComplianceItem[] = ROTATION_REGISTRY.map(entry => {
    const activeVersion    = activeVersionsBySecret.get(entry.id);
    const lastRotation     = lastRotationBySecret.get(entry.id);   // keyed by secretId = entry.id
    const hasActiveVersion = !!activeVersion;
    const lastRotatedAt    = lastRotation?.activatedAt ?? null;
    const hasRecentRotation = lastRotatedAt != null &&
      (Date.now() - new Date(lastRotatedAt).getTime()) <= RECENT_THRESHOLD_MS;

    const violations: string[] = [];
    if (!entry.rotationSupported) {
      // Can't comply if rotation isn't supported — mark UNKNOWN
    } else {
      if (!hasActiveVersion) violations.push("No active secret version tracked.");
      if (!hasRecentRotation) violations.push(`No rotation in last 90 days (recommended: every ${entry.recommendedRotationDays}d).`);
      if (entry.riskLevel === "CRITICAL" && !hasRecentRotation)
        violations.push("CRITICAL risk secret must be rotated regularly.");
    }

    const complianceStatus: ComplianceStatus =
      !entry.rotationSupported           ? "UNKNOWN"       :
      violations.length === 0            ? "COMPLIANT"     :
      "NON_COMPLIANT";

    return {
      secretId:            entry.id,
      name:                entry.name,
      riskLevel:           entry.riskLevel,
      rotationSupported:   entry.rotationSupported,
      requiresApproval:    entry.requiresApproval,
      requiresDoubleApproval: entry.requiresDoubleApproval,
      hasActiveVersion,
      hasRecentRotation,
      lastRotatedAt,
      complianceStatus,
      violations,
    };
  });

  const compliant    = items.filter(i => i.complianceStatus === "COMPLIANT").length;
  const nonCompliant = items.filter(i => i.complianceStatus === "NON_COMPLIANT").length;
  const unknown      = items.filter(i => i.complianceStatus === "UNKNOWN").length;
  const total        = items.length;
  const complianceRate = total > 0 ? compliant / total : 0;

  const insights: string[] = [];
  if (nonCompliant > 0)
    insights.push(`${nonCompliant} secret(s) are NON-COMPLIANT with rotation policy.`);
  if (unknown > 0)
    insights.push(`${unknown} secret(s) have UNKNOWN compliance (rotation not supported or not tracked).`);
  if (complianceRate === 1)
    insights.push("All registered secrets are compliant with rotation policy.");
  else
    insights.push(`Compliance rate: ${Math.round(complianceRate * 100)}%.`);

  return {
    meta: { generatedAt: new Date().toISOString(), generatedBy: requestedBy, orgSlug },
    summary: { total, compliant, nonCompliant, unknown, complianceRate: Math.round(complianceRate * 10000) / 10000 },
    items,
    insights,
  };
}

// ── Format Helpers ─────────────────────────────────────────────────────────────

export function formatRotationReport(report: RotationReport): string {
  const lines: string[] = [
    `=== ROTATION REPORT — ${report.meta.orgSlug} ===`,
    `Generated: ${report.meta.generatedAt}`,
    `Total rotations: ${report.totalCount}`,
    `Success rate: ${Math.round(report.successRate * 100)}%`,
    `Failure rate: ${Math.round(report.failureRate * 100)}%`,
    `Breakdown: ACTIVE=${report.breakdown.ACTIVE} REVOKED=${report.breakdown.REVOKED} FAILED=${report.breakdown.FAILED} PENDING=${report.breakdown.PENDING}`,
    "Insights:",
    ...report.insights.map(i => `  • ${i}`),
  ];
  return lines.join("\n");
}

export function formatExpirationReport(report: ExpirationReport): string {
  const lines: string[] = [
    `=== EXPIRATION REPORT — ${report.meta.orgSlug} ===`,
    `Generated: ${report.meta.generatedAt}`,
    `Total tracked: ${report.total}`,
    `CRITICAL: ${report.critical.length}  WARNING: ${report.warning.length}  NOTICE: ${report.notice.length}  OK: ${report.ok.length}`,
    "Insights:",
    ...report.insights.map(i => `  • ${i}`),
  ];
  if (report.critical.length > 0) {
    lines.push("Critical secrets:");
    report.critical.forEach(c => lines.push(`  ! ${c.secretId} v${c.version} — age ${c.ageInDays}d, expires ${c.expiresAt ?? "N/A"}`));
  }
  return lines.join("\n");
}

export function formatComplianceReport(report: ComplianceReport): string {
  const { summary } = report;
  const lines: string[] = [
    `=== COMPLIANCE REPORT — ${report.meta.orgSlug} ===`,
    `Generated: ${report.meta.generatedAt}`,
    `Compliance rate: ${Math.round(summary.complianceRate * 100)}% (${summary.compliant}/${summary.total})`,
    `NON-COMPLIANT: ${summary.nonCompliant}  UNKNOWN: ${summary.unknown}`,
    "Insights:",
    ...report.insights.map(i => `  • ${i}`),
  ];
  const bad = report.items.filter(i => i.complianceStatus === "NON_COMPLIANT");
  if (bad.length > 0) {
    lines.push("Non-compliant secrets:");
    bad.forEach(b => {
      lines.push(`  ✗ ${b.secretId} [${b.riskLevel}]`);
      b.violations.forEach(v => lines.push(`      - ${v}`));
    });
  }
  return lines.join("\n");
}
