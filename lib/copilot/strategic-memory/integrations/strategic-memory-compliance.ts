// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Compliance

import type { StrategicMemoryEntry } from "../strategic-memory-types";

// ── Compliance Report Types ───────────────────────────────────────────────────

export type StrategicComplianceStatus = "PASS" | "WARN" | "FAIL";

export interface StrategicComplianceReport {
  readonly orgSlug: string;
  readonly status: StrategicComplianceStatus;
  readonly totalEntries: number;
  readonly evidencedEntries: number;
  readonly rationaledEntries: number;
  readonly crossTenantViolations: number;
  readonly orphanedEntries: number;
  readonly findings: string[];
  readonly generatedAt: string;
}

export interface StrategicComplianceGate {
  readonly orgSlug: string;
  readonly canProceed: boolean;
  readonly status: StrategicComplianceStatus;
  readonly blockers: string[];
  readonly warnings: string[];
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function buildStrategicComplianceReport(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicComplianceReport {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug);
  const crossTenant = entries.filter((e) => e.orgSlug !== orgSlug).length;

  const evidenced = scoped.filter((e) => e.evidenceIds.length > 0).length;
  const rationaled = scoped.filter((e) => e.rationale.trim().length >= 5).length;
  const orphaned = scoped.filter(
    (e) => e.status === "ACTIVE" && e.strategicScore < 0.1
  ).length;

  const findings: string[] = [];

  if (crossTenant > 0) {
    findings.push(`VIOLATION: ${crossTenant} cross-tenant entries detected`);
  }
  if (evidenced < scoped.length * 0.5) {
    findings.push(`WARNING: ${scoped.length - evidenced} entries lack evidence — credibility reduced`);
  }
  if (orphaned > 0) {
    findings.push(`WARNING: ${orphaned} active entries have near-zero strategic score`);
  }

  const status: StrategicComplianceStatus =
    crossTenant > 0 ? "FAIL" :
    findings.some((f) => f.startsWith("VIOLATION")) ? "FAIL" :
    findings.length > 0 ? "WARN" :
    "PASS";

  return {
    orgSlug,
    status,
    totalEntries: scoped.length,
    evidencedEntries: evidenced,
    rationaledEntries: rationaled,
    crossTenantViolations: crossTenant,
    orphanedEntries: orphaned,
    findings,
    generatedAt: new Date().toISOString(),
  };
}

export function evaluateStrategicComplianceGate(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicComplianceGate {
  const report = buildStrategicComplianceReport(entries, orgSlug);

  const blockers = report.findings.filter((f) => f.startsWith("VIOLATION"));
  const warnings = report.findings.filter((f) => f.startsWith("WARNING"));

  return {
    orgSlug,
    canProceed: report.status !== "FAIL",
    status: report.status,
    blockers,
    warnings,
  };
}

export function filterCompliantStrategicEntries(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return entries.filter(
    (e) =>
      e.orgSlug === orgSlug &&
      e.rationale.trim().length >= 5 &&
      e.strategicScore >= 0.1
  );
}

export function getComplianceStrategicSummary(
  report: StrategicComplianceReport
): string {
  return `Strategic Memory Compliance [${report.status}]: ${report.totalEntries} entries, ` +
    `${report.evidencedEntries} evidenced, ${report.crossTenantViolations} violations. ` +
    (report.findings.length > 0 ? `Findings: ${report.findings.slice(0, 2).join("; ")}` : "All clear.");
}
