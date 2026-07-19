/**
 * lib/security/compliance/compliance-report-builder.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Report Builder
 *
 * Generates structured compliance reports for SOC2, ISO27001,
 * tenant compliance, platform security, and executive summaries.
 *
 * Server-only. No DB. Reads from in-memory structures.
 */

import "server-only";

import type {
  ComplianceFinding,
  ComplianceFramework,
  ComplianceStatus,
  ComplianceSeverity,
} from "./compliance-types";
import { COMPLIANCE_SEVERITY_RANK } from "./compliance-types";
import {
  getComplianceScore,
  getCriticalFindings,
  getBlockingFindings,
  getViolations,
} from "./finding-engine";
import { listControls } from "./compliance-registry";

// ── Report Types ──────────────────────────────────────────────────────────────

export interface ComplianceFrameworkReport {
  framework:       ComplianceFramework;
  orgSlug:         string;
  generatedAt:     string;
  overallStatus:   ComplianceStatus;
  score:           number;    // 0–100
  totalControls:   number;
  compliantCount:  number;
  partialCount:    number;
  nonCompliantCount: number;
  unknownCount:    number;
  criticalFindings: ComplianceFinding[];
  blockingFindings: ComplianceFinding[];
  findings:        ComplianceFinding[];
  recommendations: string[];
  readinessLevel:  "READY" | "PARTIAL" | "NOT_READY";
}

export interface TenantComplianceReport {
  orgSlug:         string;
  generatedAt:     string;
  overallStatus:   ComplianceStatus;
  score:           number;
  findings:        ComplianceFinding[];
  criticalCount:   number;
  highCount:       number;
  frameworkScores: Record<ComplianceFramework, number>;
  topRisks:        string[];
  remediations:    string[];
}

export interface SecurityComplianceReport {
  generatedAt:     string;
  overallStatus:   ComplianceStatus;
  score:           number;
  findings:        ComplianceFinding[];
  controlsCovered: number;
  criticalGaps:    string[];
  recommendations: string[];
}

export interface ExecutiveComplianceSummary {
  orgSlug:         string;
  generatedAt:     string;
  overallScore:    number;
  overallStatus:   ComplianceStatus;
  frameworkReadiness: Record<ComplianceFramework, { score: number; status: ComplianceStatus }>;
  topRisks:        Array<{ title: string; severity: ComplianceSeverity; controlId: string }>;
  blockingCount:   number;
  criticalCount:   number;
  headline:        string;
}

// ── buildSoc2ReadinessReport ──────────────────────────────────────────────────

export function buildSoc2ReadinessReport(
  orgSlug:  string,
  findings: ComplianceFinding[],
): ComplianceFrameworkReport {
  return _buildFrameworkReport(orgSlug, "SOC2", findings);
}

// ── buildIso27001ReadinessReport ──────────────────────────────────────────────

export function buildIso27001ReadinessReport(
  orgSlug:  string,
  findings: ComplianceFinding[],
): ComplianceFrameworkReport {
  return _buildFrameworkReport(orgSlug, "ISO27001", findings);
}

// ── buildTenantComplianceReport ───────────────────────────────────────────────

export function buildTenantComplianceReport(
  orgSlug:  string,
  findings: ComplianceFinding[],
): TenantComplianceReport {
  const now         = new Date().toISOString();
  const orgFindings = findings.filter(f => f.orgSlug === orgSlug);
  const score       = getComplianceScore(orgFindings);
  const status      = _overallStatus(orgFindings);

  const criticalCount = orgFindings.filter(f => f.violations.some(v => v.severity === "CRITICAL")).length;
  const highCount     = orgFindings.filter(f => f.violations.some(v => v.severity === "HIGH")).length;

  const frameworkScores = _computeFrameworkScores(orgFindings);

  const topRisks = getCriticalFindings(orgFindings)
    .slice(0, 5)
    .map(f => f.title);

  const remediations = orgFindings
    .flatMap(f => f.remediations)
    .filter((r, i, arr) => arr.indexOf(r) === i)
    .slice(0, 10);

  return {
    orgSlug,
    generatedAt:    now,
    overallStatus:  status,
    score,
    findings:       orgFindings,
    criticalCount,
    highCount,
    frameworkScores,
    topRisks,
    remediations,
  };
}

// ── buildSecurityComplianceReport ─────────────────────────────────────────────

export function buildSecurityComplianceReport(
  findings: ComplianceFinding[],
): SecurityComplianceReport {
  const now    = new Date().toISOString();
  const score  = getComplianceScore(findings);
  const status = _overallStatus(findings);

  const criticalGaps = getBlockingFindings(findings).map(f => f.title);

  const recommendations = findings
    .flatMap(f => f.remediations)
    .filter((r, i, arr) => arr.indexOf(r) === i)
    .slice(0, 10);

  return {
    generatedAt:     now,
    overallStatus:   status,
    score,
    findings,
    controlsCovered: new Set(findings.map(f => f.controlId)).size,
    criticalGaps,
    recommendations,
  };
}

// ── buildExecutiveComplianceSummary ───────────────────────────────────────────

export function buildExecutiveComplianceSummary(
  orgSlug:  string,
  findings: ComplianceFinding[],
): ExecutiveComplianceSummary {
  const now         = new Date().toISOString();
  const orgFindings = findings.filter(f => f.orgSlug === orgSlug);
  const score       = getComplianceScore(orgFindings);
  const status      = _overallStatus(orgFindings);

  const frameworkReadiness = _computeFrameworkReadiness(orgFindings);
  const topRisks = getViolations(getCriticalFindings(orgFindings))
    .sort((a, b) => COMPLIANCE_SEVERITY_RANK[b.severity] - COMPLIANCE_SEVERITY_RANK[a.severity])
    .slice(0, 5)
    .map(v => ({ title: v.title, severity: v.severity, controlId: v.controlId }));

  const blockingCount = getBlockingFindings(orgFindings).length;
  const criticalCount = getCriticalFindings(orgFindings).length;

  const headline = _buildHeadline(status, score, blockingCount, criticalCount);

  return {
    orgSlug,
    generatedAt:       now,
    overallScore:      score,
    overallStatus:     status,
    frameworkReadiness,
    topRisks,
    blockingCount,
    criticalCount,
    headline,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildFrameworkReport(
  orgSlug:   string,
  framework: ComplianceFramework,
  findings:  ComplianceFinding[],
): ComplianceFrameworkReport {
  const now             = new Date().toISOString();
  const applicable      = listControls({ framework, enabled: true });
  const frameworkFindings = findings.filter(f =>
    f.orgSlug === orgSlug &&
    applicable.some(c => c.id === f.controlId),
  );

  const score            = getComplianceScore(frameworkFindings);
  const status           = _overallStatus(frameworkFindings);
  const criticalFindings = getCriticalFindings(frameworkFindings);
  const blockingFindings = getBlockingFindings(frameworkFindings);

  const compliantCount    = frameworkFindings.filter(f => f.status === "COMPLIANT").length;
  const partialCount      = frameworkFindings.filter(f => f.status === "PARTIAL").length;
  const nonCompliantCount = frameworkFindings.filter(f => f.status === "NON_COMPLIANT").length;
  const unknownCount      = frameworkFindings.filter(f => f.status === "UNKNOWN").length;

  const recommendations = frameworkFindings
    .flatMap(f => f.remediations)
    .filter((r, i, arr) => arr.indexOf(r) === i)
    .slice(0, 10);

  const readinessLevel: ComplianceFrameworkReport["readinessLevel"] =
    blockingFindings.length > 0 ? "NOT_READY" :
    nonCompliantCount > 0 || partialCount > 0 ? "PARTIAL" : "READY";

  return {
    framework,
    orgSlug,
    generatedAt:      now,
    overallStatus:    status,
    score,
    totalControls:    applicable.length,
    compliantCount,
    partialCount,
    nonCompliantCount,
    unknownCount,
    criticalFindings,
    blockingFindings,
    findings:         frameworkFindings,
    recommendations,
    readinessLevel,
  };
}

function _overallStatus(findings: ComplianceFinding[]): ComplianceStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some(f => f.status === "NON_COMPLIANT")) return "NON_COMPLIANT";
  if (findings.some(f => f.status === "PARTIAL" || f.status === "UNKNOWN")) return "PARTIAL";
  return "COMPLIANT";
}

function _computeFrameworkScores(
  findings: ComplianceFinding[],
): Record<ComplianceFramework, number> {
  const scores: Record<ComplianceFramework, number> = {
    SOC2: 0, ISO27001: 0, GDPR: 0, HIPAA: 0, CUSTOM: 0,
  };
  for (const fw of Object.keys(scores) as ComplianceFramework[]) {
    const applicable = listControls({ framework: fw, enabled: true });
    const fwFindings = findings.filter(f => applicable.some(c => c.id === f.controlId));
    scores[fw] = getComplianceScore(fwFindings);
  }
  return scores;
}

function _computeFrameworkReadiness(
  findings: ComplianceFinding[],
): Record<ComplianceFramework, { score: number; status: ComplianceStatus }> {
  const result = {} as Record<ComplianceFramework, { score: number; status: ComplianceStatus }>;
  for (const fw of ["SOC2", "ISO27001", "GDPR", "HIPAA", "CUSTOM"] as ComplianceFramework[]) {
    const applicable = listControls({ framework: fw, enabled: true });
    const fwFindings = findings.filter(f => applicable.some(c => c.id === f.controlId));
    result[fw] = {
      score:  getComplianceScore(fwFindings),
      status: _overallStatus(fwFindings),
    };
  }
  return result;
}

function _buildHeadline(
  status:         ComplianceStatus,
  score:          number,
  blockingCount:  number,
  criticalCount:  number,
): string {
  if (status === "COMPLIANT") return `Platform is compliant. Score: ${score}/100. No violations detected.`;
  if (blockingCount > 0) return `${blockingCount} blocking violation(s) prevent certification. Score: ${score}/100. Immediate action required.`;
  if (criticalCount > 0) return `${criticalCount} critical gap(s) detected. Score: ${score}/100. Certification at risk.`;
  return `Platform is partially compliant. Score: ${score}/100. ${status} status — review recommended.`;
}
