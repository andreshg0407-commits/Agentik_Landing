/**
 * app/api/internal/integration-tests/compliance/route.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Integration Test Harness — Compliance & Governance Layer
 *
 * 150 tests (T01–T150) across 12 sections.
 *
 * NEVER run in production. Protected by:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS !== "true"
 *   - INTERNAL_INTEGRATION_TEST_TOKEN header
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";

// Core imports
import {
  COMPLIANCE_CONTROLS,
  CTRL_ACCESS_CONTROL, CTRL_AUDIT_LOGGING, CTRL_MFA, CTRL_ENCRYPTION, CTRL_TENANT_ISOLATION,
  CTRL_KEY_MANAGEMENT, CTRL_ZERO_TRUST, CTRL_SECRET_ROTATION, CTRL_ANOMALY_DETECTION,
  CTRL_DATA_RETENTION, CTRL_INCIDENT_TRACKING,
} from "@/lib/security/compliance/control-catalog";
import { COMPLIANCE_FRAMEWORKS, COMPLIANCE_STATUSES, COMPLIANCE_SEVERITIES } from "@/lib/security/compliance/compliance-types";
import { complianceRegistry, listControls, getControl } from "@/lib/security/compliance/compliance-registry";
import {
  buildEvidence, buildAuditEvidence, buildRbacEvidence, buildMfaEvidence,
  buildVaultEvidence, buildKmsEvidence, buildZeroTrustEvidence, buildAnomalyEvidence,
  isEvidenceExpired, filterActiveEvidence, getSupportingEvidence, getGapEvidence,
} from "@/lib/security/compliance/evidence-engine";
import {
  evaluateControl, evaluateFramework, evaluateTenant, evaluatePlatform,
  complianceScoreToStatus, aggregateComplianceScores, rankFindings,
} from "@/lib/security/compliance/compliance-evaluator";
import {
  buildViolation, buildFinding, buildFindingsFromEvidence, buildWarning, buildRecommendation,
  getCriticalFindings, getBlockingFindings, getViolations, rankViolations, getComplianceScore,
} from "@/lib/security/compliance/finding-engine";
import {
  InMemoryComplianceRepository, inMemoryComplianceRepository,
} from "@/lib/security/compliance/compliance-repository";
import {
  auditToComplianceEvidence, hasAuditCoverage,
} from "@/lib/security/compliance/integrations/compliance-audit";
import {
  rbacToComplianceEvidence, hasRbacCoverage,
} from "@/lib/security/compliance/integrations/compliance-rbac";
import {
  mfaToComplianceEvidence, getMfaCoveragePercent, isMfaCompliant,
} from "@/lib/security/compliance/integrations/compliance-mfa";
import {
  vaultToComplianceEvidence, isVaultCompliant,
} from "@/lib/security/compliance/integrations/compliance-vault";
import {
  kmsToComplianceEvidence, isKmsCompliant,
} from "@/lib/security/compliance/integrations/compliance-kms";
import {
  zeroTrustToComplianceEvidence, isZeroTrustCompliant,
} from "@/lib/security/compliance/integrations/compliance-zero-trust";
import {
  anomalyToComplianceEvidence, isAnomalyCompliant,
} from "@/lib/security/compliance/integrations/compliance-anomaly";
import {
  buildComplianceBrainSignals, formatComplianceMessage, getBlockingSignals,
} from "@/lib/security/compliance/integrations/compliance-executive-brain";
import {
  DATA_CLASSIFICATION_LEVELS, DATA_CLASSIFICATION_POLICIES,
  getClassificationPolicy, requiresEncryption, isGdprPersonalData,
} from "@/lib/security/compliance/data-classification";
import {
  RETENTION_POLICIES, getRetentionPolicy, isRetentionCompliant, isGdprErasurePermitted,
} from "@/lib/security/compliance/retention-policy";
import {
  buildSoc2ReadinessReport, buildIso27001ReadinessReport,
  buildTenantComplianceReport, buildSecurityComplianceReport,
  buildExecutiveComplianceSummary,
} from "@/lib/security/compliance/compliance-report-builder";
import { evaluateComplianceHealth } from "@/lib/security/compliance/compliance-health";
import { scanComplianceReadiness } from "@/lib/security/compliance/compliance-readiness";
import {
  buildComplianceDashboard, buildEmptyComplianceDashboard,
} from "@/lib/security/compliance/compliance-dashboard-contract";
import {

  EXTERNAL_AUDITOR_INTEGRATIONS,
  COMPLIANCE_AUTOMATION_PLANS,
  complianceFindingToAuditorRecord,
  SOC2_TSC_CONTROL_MAP,
} from "@/lib/security/compliance/future-compatibility";
import type { ComplianceEvidence, ComplianceFinding, ComplianceViolation } from "@/lib/security/compliance/compliance-types";

// ── Guard ─────────────────────────────────────────────────────────────────────

const ORG = "test-castillitos";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const token = req.headers.get("x-internal-test-token");
  if (!token || token !== process.env.INTERNAL_INTEGRATION_TEST_TOKEN) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const results: TestResult[] = [];

  results.push(...await runCatalogTests());
  results.push(...await runRegistryTests());
  results.push(...await runEvidenceEngineTests());
  results.push(...await runEvaluatorTests());
  results.push(...await runFindingEngineTests());
  results.push(...await runRepositoryTests());
  results.push(...await runIntegrationAdapterTests());
  results.push(...await runDataClassificationTests());
  results.push(...await runRetentionPolicyTests());
  results.push(...await runReportBuilderTests());
  results.push(...await runHealthReadinessTests());
  results.push(...await runFutureCompatibilityTests());

  const passed  = results.filter(r => r.pass).length;
  const failed  = results.filter(r => !r.pass).length;
  const summary = { total: results.length, passed, failed, pass: failed === 0 };

  return NextResponse.json({ summary, results }, { status: failed === 0 ? 200 : 207 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestResult { id: string; pass: boolean; label: string; error?: string; }
const pass = (id: string, label: string): TestResult => ({ id, pass: true, label });
const fail = (id: string, label: string, e?: unknown): TestResult => ({ id, pass: false, label, error: String(e) });

function makeEvidence(overrides: Partial<ComplianceEvidence> = {}): ComplianceEvidence {
  const now = new Date().toISOString();
  return {
    id:           `cev_test_${Math.random().toString(36).slice(2, 9)}`,
    orgSlug:      ORG,
    controlId:    CTRL_MFA,
    source:       "SYSTEM",
    isSupporting: true,
    summary:      "test evidence",
    data:         {},
    collectedAt:  now,
    expiresAt:    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
  const now = new Date().toISOString();
  return {
    id:           `cfnd_test_${Math.random().toString(36).slice(2, 9)}`,
    orgSlug:      ORG,
    controlId:    CTRL_MFA,
    type:         "COMPLIANT",
    status:       "COMPLIANT",
    severity:     "LOW",
    title:        "Test finding",
    summary:      "test",
    evidenceIds:  [],
    violations:   [],
    score:        100,
    evaluatedAt:  now,
    remediations: [],
    ...overrides,
  };
}

function makeViolation(overrides: Partial<ComplianceViolation> = {}): ComplianceViolation {
  return {
    id:          `cviol_test_${Math.random().toString(36).slice(2, 9)}`,
    orgSlug:     ORG,
    controlId:   CTRL_MFA,
    type:        "CONFIGURATION_GAP",
    severity:    "MEDIUM",
    title:       "Test violation",
    description: "test",
    remediation: "Fix the gap",
    detectedAt:  new Date().toISOString(),
    evidenceIds: [],
    isBlocking:  false,
    ...overrides,
  };
}

// ── T01–T15: Control Catalog ───────────────────────────────────────────────────

async function runCatalogTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { if (COMPLIANCE_CONTROLS.length >= 11) r.push(pass("T01", "11+ controls in catalog")); else r.push(fail("T01", "11+ controls in catalog", `only ${COMPLIANCE_CONTROLS.length}`)); } catch (e) { r.push(fail("T01", "control catalog", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_MFA); if (c?.isSoc2Required) r.push(pass("T02", "MFA control is SOC2 required")); else r.push(fail("T02", "MFA SOC2 required", "not found or not required")); } catch (e) { r.push(fail("T02", "MFA control", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_AUDIT_LOGGING); if (c?.isGdprRequired) r.push(pass("T03", "AUDIT_LOGGING is GDPR required")); else r.push(fail("T03", "AUDIT_LOGGING GDPR", "not found")); } catch (e) { r.push(fail("T03", "audit logging control", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_TENANT_ISOLATION); if (c?.violationSeverity === "CRITICAL") r.push(pass("T04", "TENANT_ISOLATION violationSeverity=CRITICAL")); else r.push(fail("T04", "tenant isolation severity", "not CRITICAL")); } catch (e) { r.push(fail("T04", "tenant isolation", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_ENCRYPTION); if (c?.frameworks.includes("SOC2")) r.push(pass("T05", "ENCRYPTION applies to SOC2")); else r.push(fail("T05", "encryption SOC2", "missing")); } catch (e) { r.push(fail("T05", "encryption control", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_KEY_MANAGEMENT); if (c?.frameworks.includes("ISO27001")) r.push(pass("T06", "KEY_MANAGEMENT applies to ISO27001")); else r.push(fail("T06", "kms ISO27001", "missing")); } catch (e) { r.push(fail("T06", "key management", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_ZERO_TRUST); if (!c?.isGdprRequired) r.push(pass("T07", "ZERO_TRUST not GDPR required (correct)")); else r.push(fail("T07", "zero trust GDPR flag", "should be false")); } catch (e) { r.push(fail("T07", "zero trust control", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_SECRET_ROTATION); if (c?.isIso27001Required) r.push(pass("T08", "SECRET_ROTATION is ISO27001 required")); else r.push(fail("T08", "secret rotation ISO27001", "not found")); } catch (e) { r.push(fail("T08", "secret rotation", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_DATA_RETENTION); if (c?.isGdprRequired) r.push(pass("T09", "DATA_RETENTION is GDPR required")); else r.push(fail("T09", "data retention GDPR", "not found")); } catch (e) { r.push(fail("T09", "data retention", e)); }
  try { const c = COMPLIANCE_CONTROLS.find(x => x.id === CTRL_INCIDENT_TRACKING); if (c?.isSoc2Required) r.push(pass("T10", "INCIDENT_TRACKING is SOC2 required")); else r.push(fail("T10", "incident tracking SOC2", "not found")); } catch (e) { r.push(fail("T10", "incident tracking", e)); }
  try { if (COMPLIANCE_CONTROLS.every(c => c.enabled)) r.push(pass("T11", "all controls enabled")); else r.push(fail("T11", "all enabled", "some disabled")); } catch (e) { r.push(fail("T11", "enabled check", e)); }
  try { if (COMPLIANCE_CONTROLS.every(c => c.evidenceSources.length > 0)) r.push(pass("T12", "all controls have evidence sources")); else r.push(fail("T12", "evidence sources", "some empty")); } catch (e) { r.push(fail("T12", "evidence sources", e)); }
  try { if (COMPLIANCE_CONTROLS.every(c => c.objective.length > 0)) r.push(pass("T13", "all controls have objective")); else r.push(fail("T13", "objectives", "some empty")); } catch (e) { r.push(fail("T13", "objectives", e)); }
  try { const soc2 = COMPLIANCE_CONTROLS.filter(c => c.isSoc2Required); if (soc2.length >= 6) r.push(pass("T14", `${soc2.length} SOC2-required controls`)); else r.push(fail("T14", "SOC2 required count", `only ${soc2.length}`)); } catch (e) { r.push(fail("T14", "SOC2 required", e)); }
  try { if (COMPLIANCE_FRAMEWORKS.length === 5) r.push(pass("T15", "5 compliance frameworks defined")); else r.push(fail("T15", "framework count", `${COMPLIANCE_FRAMEWORKS.length}`)); } catch (e) { r.push(fail("T15", "frameworks", e)); }

  return r;
}

// ── T16–T25: Registry ─────────────────────────────────────────────────────────

async function runRegistryTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { if (complianceRegistry.size() >= 11) r.push(pass("T16", "registry has ≥11 controls after catalog import")); else r.push(fail("T16", "registry size", complianceRegistry.size())); } catch (e) { r.push(fail("T16", "registry size", e)); }
  try { const c = getControl(CTRL_MFA); if (c?.id === CTRL_MFA) r.push(pass("T17", "getControl(CTRL_MFA) resolves")); else r.push(fail("T17", "getControl MFA", "not found")); } catch (e) { r.push(fail("T17", "getControl", e)); }
  try { const c = getControl("NONEXISTENT"); if (c === undefined) r.push(pass("T18", "getControl unknown returns undefined")); else r.push(fail("T18", "getControl unknown", "should be undefined")); } catch (e) { r.push(fail("T18", "getControl unknown", e)); }
  try { const soc2 = listControls({ framework: "SOC2" }); if (soc2.length >= 5) r.push(pass("T19", `listControls SOC2 returns ${soc2.length} controls`)); else r.push(fail("T19", "listControls SOC2", `only ${soc2.length}`)); } catch (e) { r.push(fail("T19", "listControls SOC2", e)); }
  try { const gdpr = listControls({ framework: "GDPR" }); if (gdpr.length >= 3) r.push(pass("T20", `listControls GDPR returns ${gdpr.length} controls`)); else r.push(fail("T20", "listControls GDPR", `only ${gdpr.length}`)); } catch (e) { r.push(fail("T20", "listControls GDPR", e)); }
  try { const enabled = listControls({ enabled: true }); if (enabled.length >= 11) r.push(pass("T21", `listControls enabled returns ${enabled.length}`)); else r.push(fail("T21", "listControls enabled", `only ${enabled.length}`)); } catch (e) { r.push(fail("T21", "listControls enabled", e)); }
  try { const soc2req = complianceRegistry.getRequiredForFramework("SOC2"); if (soc2req.length >= 5) r.push(pass("T22", `getRequiredForFramework SOC2 returns ${soc2req.length}`)); else r.push(fail("T22", "required SOC2", `only ${soc2req.length}`)); } catch (e) { r.push(fail("T22", "required SOC2", e)); }
  try { const critical = complianceRegistry.getBySeverity("CRITICAL"); if (critical.length >= 1) r.push(pass("T23", `${critical.length} CRITICAL controls`)); else r.push(fail("T23", "critical controls", "none found")); } catch (e) { r.push(fail("T23", "critical controls", e)); }
  try { const ids = complianceRegistry.ids(); if (ids.includes(CTRL_AUDIT_LOGGING)) r.push(pass("T24", "registry.ids() includes CTRL_AUDIT_LOGGING")); else r.push(fail("T24", "registry ids", "missing")); } catch (e) { r.push(fail("T24", "registry ids", e)); }
  try { let threw = false; try { complianceRegistry.resolveControl("NONEXISTENT"); } catch { threw = true; } if (threw) r.push(pass("T25", "resolveControl throws for unknown id")); else r.push(fail("T25", "resolveControl throws", "did not throw")); } catch (e) { r.push(fail("T25", "resolveControl", e)); }

  return r;
}

// ── T26–T40: Evidence Engine ──────────────────────────────────────────────────

async function runEvidenceEngineTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const e = buildEvidence({ orgSlug: ORG, controlId: CTRL_MFA, source: "SYSTEM", isSupporting: true, summary: "test", data: {} }); if (e.orgSlug === ORG && e.isSupporting) r.push(pass("T26", "buildEvidence creates supporting evidence")); else r.push(fail("T26", "buildEvidence", "wrong fields")); } catch (e) { r.push(fail("T26", "buildEvidence", e)); }
  try { const e = buildEvidence({ orgSlug: ORG, controlId: CTRL_MFA, source: "SYSTEM", isSupporting: false, summary: "gap", data: {} }); if (!e.isSupporting) r.push(pass("T27", "buildEvidence creates gap evidence")); else r.push(fail("T27", "buildEvidence gap", "isSupporting should be false")); } catch (e) { r.push(fail("T27", "buildEvidence gap", e)); }
  try { const e = buildEvidence({ orgSlug: ORG, controlId: CTRL_MFA, source: "AUDIT_LOG", isSupporting: true, summary: "audit", data: {} }); if (e.expiresAt) r.push(pass("T28", "buildEvidence sets expiresAt for AUDIT_LOG")); else r.push(fail("T28", "expiresAt", "missing")); } catch (e) { r.push(fail("T28", "expiresAt", e)); }
  try { const e = buildAuditEvidence({ orgSlug: ORG, controlId: CTRL_AUDIT_LOGGING, eventCount: 100, since: "2026-01-01T00:00:00Z", eventTypes: ["ACCESS_GRANTED"] }); if (e.isSupporting && e.controlId === CTRL_AUDIT_LOGGING) r.push(pass("T29", "buildAuditEvidence supporting for eventCount>0")); else r.push(fail("T29", "buildAuditEvidence", "wrong fields")); } catch (e) { r.push(fail("T29", "buildAuditEvidence", e)); }
  try { const e = buildAuditEvidence({ orgSlug: ORG, controlId: CTRL_AUDIT_LOGGING, eventCount: 0, since: "2026-01-01T00:00:00Z", eventTypes: [] }); if (!e.isSupporting) r.push(pass("T30", "buildAuditEvidence gap for eventCount=0")); else r.push(fail("T30", "buildAuditEvidence gap", "should be gap")); } catch (e) { r.push(fail("T30", "buildAuditEvidence gap", e)); }
  try { const e = buildRbacEvidence({ orgSlug: ORG, controlId: CTRL_ACCESS_CONTROL, roleCount: 5, assignmentCount: 10, hasLeastPrivilege: true }); if (e.isSupporting) r.push(pass("T31", "buildRbacEvidence supporting")); else r.push(fail("T31", "buildRbacEvidence", "not supporting")); } catch (e) { r.push(fail("T31", "buildRbacEvidence", e)); }
  try { const e = buildMfaEvidence({ orgSlug: ORG, controlId: CTRL_MFA, enrolledCount: 90, totalUsers: 100, enforcedForAdmins: true }); if (e.isSupporting) r.push(pass("T32", "buildMfaEvidence supporting for 90% coverage")); else r.push(fail("T32", "buildMfaEvidence", "not supporting")); } catch (e) { r.push(fail("T32", "buildMfaEvidence", e)); }
  try { const e = buildMfaEvidence({ orgSlug: ORG, controlId: CTRL_MFA, enrolledCount: 30, totalUsers: 100, enforcedForAdmins: false }); if (!e.isSupporting) r.push(pass("T33", "buildMfaEvidence gap for 30% coverage")); else r.push(fail("T33", "buildMfaEvidence gap", "should be gap")); } catch (e) { r.push(fail("T33", "buildMfaEvidence gap", e)); }
  try { const e = buildVaultEvidence({ orgSlug: ORG, controlId: CTRL_ENCRYPTION, secretCount: 10, encryptedCount: 10, hasAccessPolicy: true }); if (e.isSupporting) r.push(pass("T34", "buildVaultEvidence supporting")); else r.push(fail("T34", "buildVaultEvidence", "not supporting")); } catch (e) { r.push(fail("T34", "buildVaultEvidence", e)); }
  try { const e = buildKmsEvidence({ orgSlug: ORG, controlId: CTRL_KEY_MANAGEMENT, keyCount: 3, rotatedCount: 3, hasRotationPolicy: true }); if (e.isSupporting) r.push(pass("T35", "buildKmsEvidence supporting")); else r.push(fail("T35", "buildKmsEvidence", "not supporting")); } catch (e) { r.push(fail("T35", "buildKmsEvidence", e)); }
  try { const e = buildZeroTrustEvidence({ orgSlug: ORG, controlId: CTRL_ZERO_TRUST, policiesActive: 3, lastDenied: 5, hasStepUp: true }); if (e.isSupporting) r.push(pass("T36", "buildZeroTrustEvidence supporting")); else r.push(fail("T36", "buildZeroTrustEvidence", "not supporting")); } catch (e) { r.push(fail("T36", "buildZeroTrustEvidence", e)); }
  try { const e = buildAnomalyEvidence({ orgSlug: ORG, controlId: CTRL_ANOMALY_DETECTION, detectorCount: 11, openAlerts: 2, criticalAlerts: 0, isMonitoringActive: true }); if (e.isSupporting) r.push(pass("T37", "buildAnomalyEvidence supporting")); else r.push(fail("T37", "buildAnomalyEvidence", "not supporting")); } catch (e) { r.push(fail("T37", "buildAnomalyEvidence", e)); }
  try { const expired = makeEvidence({ expiresAt: new Date(Date.now() - 1000).toISOString() }); if (isEvidenceExpired(expired)) r.push(pass("T38", "isEvidenceExpired returns true for past expiresAt")); else r.push(fail("T38", "isEvidenceExpired", "should be expired")); } catch (e) { r.push(fail("T38", "isEvidenceExpired", e)); }
  try { const active = makeEvidence(); if (!isEvidenceExpired(active)) r.push(pass("T39", "isEvidenceExpired returns false for future expiresAt")); else r.push(fail("T39", "isEvidenceExpired active", "should not be expired")); } catch (e) { r.push(fail("T39", "isEvidenceExpired active", e)); }
  try { const items = [makeEvidence({ isSupporting: true }), makeEvidence({ isSupporting: false })]; const supporting = getSupportingEvidence(items); if (supporting.length === 1 && supporting[0].isSupporting) r.push(pass("T40", "getSupportingEvidence filters correctly")); else r.push(fail("T40", "getSupportingEvidence", "wrong count")); } catch (e) { r.push(fail("T40", "getSupportingEvidence", e)); }

  return r;
}

// ── T41–T60: Compliance Evaluator ────────────────────────────────────────────

async function runEvaluatorTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const f = evaluateControl(ORG, CTRL_MFA, []); if (f.status === "UNKNOWN" && f.orgSlug === ORG) r.push(pass("T41", "evaluateControl returns UNKNOWN for no evidence")); else r.push(fail("T41", "evaluateControl empty", `status=${f.status}`)); } catch (e) { r.push(fail("T41", "evaluateControl empty", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: true })]; const f = evaluateControl(ORG, CTRL_MFA, ev); if (f.status === "COMPLIANT") r.push(pass("T42", "evaluateControl returns COMPLIANT for supporting evidence")); else r.push(fail("T42", "evaluateControl COMPLIANT", `status=${f.status}`)); } catch (e) { r.push(fail("T42", "evaluateControl COMPLIANT", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: false })]; const f = evaluateControl(ORG, CTRL_MFA, ev); if (f.status !== "COMPLIANT") r.push(pass("T43", "evaluateControl returns non-COMPLIANT for gap evidence")); else r.push(fail("T43", "evaluateControl gap", "should not be COMPLIANT")); } catch (e) { r.push(fail("T43", "evaluateControl gap", e)); }
  try { const f = evaluateControl(ORG, "NONEXISTENT", []); if (f.status === "UNKNOWN") r.push(pass("T44", "evaluateControl unknown control returns UNKNOWN")); else r.push(fail("T44", "evaluateControl unknown", `status=${f.status}`)); } catch (e) { r.push(fail("T44", "evaluateControl unknown", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: true })]; const f = evaluateControl(ORG, CTRL_MFA, ev); if (f.score === 100) r.push(pass("T45", "evaluateControl COMPLIANT score=100")); else r.push(fail("T45", "evaluateControl score", `score=${f.score}`)); } catch (e) { r.push(fail("T45", "evaluateControl score", e)); }
  try { const findings = evaluateFramework(ORG, "SOC2", []); if (Array.isArray(findings) && findings.length >= 5) r.push(pass("T46", `evaluateFramework SOC2 returns ${findings.length} findings`)); else r.push(fail("T46", "evaluateFramework SOC2", `count=${findings.length}`)); } catch (e) { r.push(fail("T46", "evaluateFramework SOC2", e)); }
  try { const findings = evaluateFramework(ORG, "GDPR", []); if (Array.isArray(findings) && findings.length >= 3) r.push(pass("T47", `evaluateFramework GDPR returns ${findings.length} findings`)); else r.push(fail("T47", "evaluateFramework GDPR", `count=${findings.length}`)); } catch (e) { r.push(fail("T47", "evaluateFramework GDPR", e)); }
  try { const eval_ = evaluateTenant(ORG, []); if (eval_.orgSlug === ORG && typeof eval_.score === "number") r.push(pass("T48", "evaluateTenant returns tenant evaluation")); else r.push(fail("T48", "evaluateTenant", "wrong shape")); } catch (e) { r.push(fail("T48", "evaluateTenant", e)); }
  try { const eval_ = evaluateTenant(ORG, []); if (eval_.findings.length >= 11) r.push(pass("T49", `evaluateTenant returns ${eval_.findings.length} findings (all controls)`)); else r.push(fail("T49", "evaluateTenant findings count", `${eval_.findings.length}`)); } catch (e) { r.push(fail("T49", "evaluateTenant findings", e)); }
  try { const platform = evaluatePlatform([ORG, "other-org"], new Map([[ORG, []], ["other-org", []]])); if (platform.tenants.length === 2) r.push(pass("T50", "evaluatePlatform returns 2 tenants")); else r.push(fail("T50", "evaluatePlatform", `count=${platform.tenants.length}`)); } catch (e) { r.push(fail("T50", "evaluatePlatform", e)); }
  try { const s = complianceScoreToStatus(100); if (s === "COMPLIANT") r.push(pass("T51", "complianceScoreToStatus(100) = COMPLIANT")); else r.push(fail("T51", "scoreToStatus 100", s)); } catch (e) { r.push(fail("T51", "scoreToStatus", e)); }
  try { const s = complianceScoreToStatus(50); if (s === "PARTIAL") r.push(pass("T52", "complianceScoreToStatus(50) = PARTIAL")); else r.push(fail("T52", "scoreToStatus 50", s)); } catch (e) { r.push(fail("T52", "scoreToStatus", e)); }
  try { const s = complianceScoreToStatus(0); if (s === "NON_COMPLIANT") r.push(pass("T53", "complianceScoreToStatus(0) = NON_COMPLIANT")); else r.push(fail("T53", "scoreToStatus 0", s)); } catch (e) { r.push(fail("T53", "scoreToStatus", e)); }
  try { const avg = aggregateComplianceScores([100, 50, 0]); if (avg === 50) r.push(pass("T54", "aggregateComplianceScores([100,50,0]) = 50")); else r.push(fail("T54", "aggregateScores", `${avg}`)); } catch (e) { r.push(fail("T54", "aggregateScores", e)); }
  try { const findings = [makeFinding({ severity: "LOW" }), makeFinding({ severity: "CRITICAL" }), makeFinding({ severity: "HIGH" })]; const ranked = rankFindings(findings); if (ranked[0].severity === "CRITICAL") r.push(pass("T55", "rankFindings puts CRITICAL first")); else r.push(fail("T55", "rankFindings", `first=${ranked[0].severity}`)); } catch (e) { r.push(fail("T55", "rankFindings", e)); }

  // Additional evaluator tests
  try { const eval_ = evaluateTenant(ORG, []); if (eval_.overallStatus !== "COMPLIANT") r.push(pass("T56", "evaluateTenant with no evidence is not COMPLIANT")); else r.push(fail("T56", "evaluateTenant no-evidence status", "should not be COMPLIANT")); } catch (e) { r.push(fail("T56", "evaluateTenant no-evidence", e)); }
  try { const platform = evaluatePlatform([], new Map()); if (platform.tenants.length === 0 && platform.globalScore === 0) r.push(pass("T57", "evaluatePlatform empty orgs returns zero state")); else r.push(fail("T57", "evaluatePlatform empty", "wrong state")); } catch (e) { r.push(fail("T57", "evaluatePlatform empty", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: true }), makeEvidence({ controlId: CTRL_MFA, isSupporting: false })]; const f = evaluateControl(ORG, CTRL_MFA, ev); if (f.status === "PARTIAL") r.push(pass("T58", "evaluateControl PARTIAL for mixed evidence")); else r.push(fail("T58", "evaluateControl PARTIAL", `status=${f.status}`)); } catch (e) { r.push(fail("T58", "evaluateControl PARTIAL", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: true })]; const f = evaluateControl(ORG, CTRL_MFA, ev, "SOC2"); if (f.framework === "SOC2") r.push(pass("T59", "evaluateControl preserves framework")); else r.push(fail("T59", "evaluateControl framework", f.framework)); } catch (e) { r.push(fail("T59", "evaluateControl framework", e)); }
  try { const f = evaluateControl(ORG, CTRL_MFA, []); if (typeof f.validUntil === "string") r.push(pass("T60", "evaluateControl sets validUntil")); else r.push(fail("T60", "evaluateControl validUntil", "missing")); } catch (e) { r.push(fail("T60", "validUntil", e)); }

  return r;
}

// ── T61–T75: Finding Engine ────────────────────────────────────────────────────

async function runFindingEngineTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const v = buildViolation({ orgSlug: ORG, controlId: CTRL_MFA, type: "CONFIGURATION_GAP", severity: "HIGH", title: "test", description: "d", remediation: "r", evidenceIds: [], isBlocking: false }); if (v.orgSlug === ORG && v.type === "CONFIGURATION_GAP") r.push(pass("T61", "buildViolation creates violation")); else r.push(fail("T61", "buildViolation", "wrong fields")); } catch (e) { r.push(fail("T61", "buildViolation", e)); }
  try { const v = buildViolation({ orgSlug: ORG, controlId: CTRL_MFA, type: "POLICY_VIOLATION", severity: "CRITICAL", title: "critical", description: "d", remediation: "r", evidenceIds: [], isBlocking: true }); if (v.isBlocking) r.push(pass("T62", "buildViolation isBlocking=true preserved")); else r.push(fail("T62", "buildViolation isBlocking", "not blocking")); } catch (e) { r.push(fail("T62", "buildViolation blocking", e)); }
  try { const f = buildFinding({ orgSlug: ORG, controlId: CTRL_MFA, status: "COMPLIANT", severity: "LOW", summary: "ok", evidenceIds: [], violations: [], score: 100 }); if (f.status === "COMPLIANT" && f.score === 100) r.push(pass("T63", "buildFinding COMPLIANT")); else r.push(fail("T63", "buildFinding COMPLIANT", "wrong fields")); } catch (e) { r.push(fail("T63", "buildFinding", e)); }
  try { const f = buildFinding({ orgSlug: ORG, controlId: CTRL_MFA, status: "NON_COMPLIANT", severity: "CRITICAL", summary: "bad", evidenceIds: [], violations: [makeViolation()], score: 0 }); if (f.type === "VIOLATION") r.push(pass("T64", "buildFinding NON_COMPLIANT → type=VIOLATION")); else r.push(fail("T64", "buildFinding type", f.type)); } catch (e) { r.push(fail("T64", "buildFinding VIOLATION", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: true })]; const findings = buildFindingsFromEvidence(ev, [CTRL_MFA], ORG); if (findings.length === 1 && findings[0].status === "COMPLIANT") r.push(pass("T65", "buildFindingsFromEvidence COMPLIANT")); else r.push(fail("T65", "buildFindingsFromEvidence", `status=${findings[0]?.status}`)); } catch (e) { r.push(fail("T65", "buildFindingsFromEvidence", e)); }
  try { const w = buildWarning({ orgSlug: ORG, controlId: CTRL_MFA, summary: "warning", details: "details" }); if (w.status === "PARTIAL") r.push(pass("T66", "buildWarning creates PARTIAL finding")); else r.push(fail("T66", "buildWarning", `status=${w.status}`)); } catch (e) { r.push(fail("T66", "buildWarning", e)); }
  try { const rec = buildRecommendation({ orgSlug: ORG, controlId: CTRL_MFA, priority: "HIGH", title: "Enable MFA", description: "d", action: "a" }); if (rec.priority === "HIGH") r.push(pass("T67", "buildRecommendation HIGH priority")); else r.push(fail("T67", "buildRecommendation", "wrong priority")); } catch (e) { r.push(fail("T67", "buildRecommendation", e)); }
  try { const findings = [makeFinding({ violations: [makeViolation({ severity: "CRITICAL" })] })]; const critical = getCriticalFindings(findings); if (critical.length === 1) r.push(pass("T68", "getCriticalFindings returns CRITICAL findings")); else r.push(fail("T68", "getCriticalFindings", `count=${critical.length}`)); } catch (e) { r.push(fail("T68", "getCriticalFindings", e)); }
  try { const findings = [makeFinding({ violations: [makeViolation({ isBlocking: true })] })]; const blocking = getBlockingFindings(findings); if (blocking.length === 1) r.push(pass("T69", "getBlockingFindings returns blocking findings")); else r.push(fail("T69", "getBlockingFindings", `count=${blocking.length}`)); } catch (e) { r.push(fail("T69", "getBlockingFindings", e)); }
  try { const findings = [makeFinding({ violations: [makeViolation(), makeViolation()] })]; const violations = getViolations(findings); if (violations.length === 2) r.push(pass("T70", "getViolations extracts all violations")); else r.push(fail("T70", "getViolations", `count=${violations.length}`)); } catch (e) { r.push(fail("T70", "getViolations", e)); }
  try { const violations = [makeViolation({ severity: "LOW" }), makeViolation({ severity: "CRITICAL" })]; const ranked = rankViolations(violations); if (ranked[0].severity === "CRITICAL") r.push(pass("T71", "rankViolations puts CRITICAL first")); else r.push(fail("T71", "rankViolations", `first=${ranked[0].severity}`)); } catch (e) { r.push(fail("T71", "rankViolations", e)); }
  try { const findings = [makeFinding({ score: 100 }), makeFinding({ score: 50 })]; const score = getComplianceScore(findings); if (score === 75) r.push(pass("T72", "getComplianceScore returns average")); else r.push(fail("T72", "getComplianceScore", `${score}`)); } catch (e) { r.push(fail("T72", "getComplianceScore", e)); }
  try { const score = getComplianceScore([]); if (score === 0) r.push(pass("T73", "getComplianceScore([]) returns 0")); else r.push(fail("T73", "getComplianceScore empty", `${score}`)); } catch (e) { r.push(fail("T73", "getComplianceScore empty", e)); }
  try { const ev = [makeEvidence({ controlId: CTRL_MFA, isSupporting: false })]; const findings = buildFindingsFromEvidence(ev, [CTRL_MFA], ORG); if (findings[0]?.violations.length >= 1) r.push(pass("T74", "buildFindingsFromEvidence creates violations for gaps")); else r.push(fail("T74", "buildFindingsFromEvidence violations", "no violations")); } catch (e) { r.push(fail("T74", "buildFindingsFromEvidence violations", e)); }
  try { const f = buildFinding({ orgSlug: ORG, controlId: CTRL_MFA, status: "COMPLIANT", severity: "LOW", summary: "ok", evidenceIds: ["ev1"], violations: [], score: 150 }); if (f.score === 100) r.push(pass("T75", "buildFinding clamps score to 100")); else r.push(fail("T75", "buildFinding score clamp", `${f.score}`)); } catch (e) { r.push(fail("T75", "score clamp", e)); }

  return r;
}

// ── T76–T85: Repository ────────────────────────────────────────────────────────

async function runRepositoryTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];
  const repo = new InMemoryComplianceRepository();

  try { const ev = makeEvidence(); const result = await repo.saveEvidence(ev); if (result.ok) r.push(pass("T76", "saveEvidence succeeds")); else r.push(fail("T76", "saveEvidence", result.ok === false ? result.error : "")); } catch (e) { r.push(fail("T76", "saveEvidence", e)); }
  try { const ev = makeEvidence(); await repo.saveEvidence(ev); const found = await repo.getEvidence(ORG, ev.id); if (found?.id === ev.id) r.push(pass("T77", "getEvidence retrieves saved evidence")); else r.push(fail("T77", "getEvidence", "not found")); } catch (e) { r.push(fail("T77", "getEvidence", e)); }
  try { const found = await repo.getEvidence(ORG, "nonexistent"); if (found === null) r.push(pass("T78", "getEvidence returns null for unknown")); else r.push(fail("T78", "getEvidence null", "not null")); } catch (e) { r.push(fail("T78", "getEvidence null", e)); }
  try { const f = makeFinding(); const result = await repo.saveFinding(f); if (result.ok) r.push(pass("T79", "saveFinding succeeds")); else r.push(fail("T79", "saveFinding", result.ok === false ? result.error : "")); } catch (e) { r.push(fail("T79", "saveFinding", e)); }
  try { const f = makeFinding(); await repo.saveFinding(f); const found = await repo.getFinding(ORG, f.id); if (found?.id === f.id) r.push(pass("T80", "getFinding retrieves saved finding")); else r.push(fail("T80", "getFinding", "not found")); } catch (e) { r.push(fail("T80", "getFinding", e)); }
  try { const f = makeFinding(); await repo.saveFinding(f); const result = await repo.updateFindingStatus(ORG, f.id, "PARTIAL"); if (result.ok && result.value.status === "PARTIAL") r.push(pass("T81", "updateFindingStatus changes status")); else r.push(fail("T81", "updateFindingStatus", "failed")); } catch (e) { r.push(fail("T81", "updateFindingStatus", e)); }
  try { const result = await repo.updateFindingStatus(ORG, "nonexistent", "PARTIAL"); if (!result.ok) r.push(pass("T82", "updateFindingStatus fails for unknown")); else r.push(fail("T82", "updateFindingStatus unknown", "should fail")); } catch (e) { r.push(fail("T82", "updateFindingStatus unknown", e)); }
  try { const ev = makeEvidence({ controlId: CTRL_MFA }); await repo.saveEvidence(ev); const list = await repo.listEvidence(ORG, { controlId: CTRL_MFA }); if (list.length >= 1) r.push(pass("T83", "listEvidence filters by controlId")); else r.push(fail("T83", "listEvidence filter", `count=${list.length}`)); } catch (e) { r.push(fail("T83", "listEvidence", e)); }
  try { const f = makeFinding({ status: "COMPLIANT" }); await repo.saveFinding(f); const counts = await repo.countFindingsByStatus(ORG); if (typeof counts.COMPLIANT === "number") r.push(pass("T84", "countFindingsByStatus returns record")); else r.push(fail("T84", "countFindingsByStatus", "wrong type")); } catch (e) { r.push(fail("T84", "countFindingsByStatus", e)); }
  try { const result = await repo.saveEvidence({ ...makeEvidence(), orgSlug: "" }); if (!result.ok) r.push(pass("T85", "saveEvidence rejects empty orgSlug")); else r.push(fail("T85", "saveEvidence orgSlug guard", "should fail")); } catch (e) { r.push(fail("T85", "saveEvidence guard", e)); }

  return r;
}

// ── T86–T100: Integration Adapters ────────────────────────────────────────────

async function runIntegrationAdapterTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const ev = auditToComplianceEvidence({ orgSlug: ORG, eventCount: 500, since: "2026-01-01T00:00:00Z", eventTypes: ["ACCESS_GRANTED"], isPersistent: true, oldestEventAt: new Date(Date.now() - 400 * 86_400_000).toISOString() }); if (ev.length === 2) r.push(pass("T86", "auditToComplianceEvidence returns 2 records")); else r.push(fail("T86", "auditToComplianceEvidence count", `${ev.length}`)); } catch (e) { r.push(fail("T86", "auditToComplianceEvidence", e)); }
  try { const has = hasAuditCoverage({ orgSlug: ORG, eventCount: 100, since: "2026-01-01T00:00:00Z", eventTypes: [], isPersistent: true }); if (has) r.push(pass("T87", "hasAuditCoverage returns true")); else r.push(fail("T87", "hasAuditCoverage", "false")); } catch (e) { r.push(fail("T87", "hasAuditCoverage", e)); }
  try { const ev = rbacToComplianceEvidence({ orgSlug: ORG, roleCount: 5, assignmentCount: 20, hasLeastPrivilege: true, hasExplicitAdminGrants: true }); if (ev.length === 1 && ev[0].isSupporting) r.push(pass("T88", "rbacToComplianceEvidence supporting")); else r.push(fail("T88", "rbacToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T88", "rbacToComplianceEvidence", e)); }
  try { const has = hasRbacCoverage({ orgSlug: ORG, roleCount: 5, assignmentCount: 20, hasLeastPrivilege: true, hasExplicitAdminGrants: true }); if (has) r.push(pass("T89", "hasRbacCoverage true")); else r.push(fail("T89", "hasRbacCoverage", "false")); } catch (e) { r.push(fail("T89", "hasRbacCoverage", e)); }
  try { const ev = mfaToComplianceEvidence({ orgSlug: ORG, enrolledCount: 90, totalUsers: 100, enforcedForAdmins: true }); if (ev.length === 1) r.push(pass("T90", "mfaToComplianceEvidence returns 1 record")); else r.push(fail("T90", "mfaToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T90", "mfaToComplianceEvidence", e)); }
  try { const pct = getMfaCoveragePercent({ orgSlug: ORG, enrolledCount: 80, totalUsers: 100, enforcedForAdmins: true }); if (pct === 80) r.push(pass("T91", "getMfaCoveragePercent returns 80")); else r.push(fail("T91", "getMfaCoveragePercent", `${pct}`)); } catch (e) { r.push(fail("T91", "getMfaCoveragePercent", e)); }
  try { const ok = isMfaCompliant({ orgSlug: ORG, enrolledCount: 90, totalUsers: 100, enforcedForAdmins: true }); if (ok) r.push(pass("T92", "isMfaCompliant true for 90%+admin")); else r.push(fail("T92", "isMfaCompliant", "false")); } catch (e) { r.push(fail("T92", "isMfaCompliant", e)); }
  try { const ev = vaultToComplianceEvidence({ orgSlug: ORG, secretCount: 10, encryptedCount: 10, hasAccessPolicy: true, staleCount: 0, hasRotationSchedule: true }); if (ev.length === 2) r.push(pass("T93", "vaultToComplianceEvidence returns 2 records")); else r.push(fail("T93", "vaultToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T93", "vaultToComplianceEvidence", e)); }
  try { const ok = isVaultCompliant({ orgSlug: ORG, secretCount: 10, encryptedCount: 10, hasAccessPolicy: true, staleCount: 0 }); if (ok) r.push(pass("T94", "isVaultCompliant true")); else r.push(fail("T94", "isVaultCompliant", "false")); } catch (e) { r.push(fail("T94", "isVaultCompliant", e)); }
  try { const ev = kmsToComplianceEvidence({ orgSlug: ORG, keyCount: 3, rotatedCount: 3, hasRotationPolicy: true }); if (ev.length === 2) r.push(pass("T95", "kmsToComplianceEvidence returns 2 records")); else r.push(fail("T95", "kmsToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T95", "kmsToComplianceEvidence", e)); }
  try { const ok = isKmsCompliant({ orgSlug: ORG, keyCount: 3, rotatedCount: 3, hasRotationPolicy: true, overdueCount: 0 }); if (ok) r.push(pass("T96", "isKmsCompliant true")); else r.push(fail("T96", "isKmsCompliant", "false")); } catch (e) { r.push(fail("T96", "isKmsCompliant", e)); }
  try { const ev = zeroTrustToComplianceEvidence({ orgSlug: ORG, policiesActive: 3, recentDenials: 5, hasStepUp: true }); if (ev.length === 2) r.push(pass("T97", "zeroTrustToComplianceEvidence returns 2 records")); else r.push(fail("T97", "zeroTrustToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T97", "zeroTrustToComplianceEvidence", e)); }
  try { const ev = anomalyToComplianceEvidence({ orgSlug: ORG, detectorCount: 11, openAlerts: 2, criticalAlerts: 0, isMonitoringActive: true }); if (ev.length === 2) r.push(pass("T98", "anomalyToComplianceEvidence returns 2 records")); else r.push(fail("T98", "anomalyToComplianceEvidence", `count=${ev.length}`)); } catch (e) { r.push(fail("T98", "anomalyToComplianceEvidence", e)); }
  try { const ok = isAnomalyCompliant({ orgSlug: ORG, detectorCount: 11, openAlerts: 0, criticalAlerts: 0, isMonitoringActive: true, hasStaleCritical: false }); if (ok) r.push(pass("T99", "isAnomalyCompliant true")); else r.push(fail("T99", "isAnomalyCompliant", "false")); } catch (e) { r.push(fail("T99", "isAnomalyCompliant", e)); }
  try {
    const findings = [makeFinding({ severity: "CRITICAL", status: "NON_COMPLIANT", violations: [makeViolation({ severity: "CRITICAL" })] })];
    const signals = buildComplianceBrainSignals(findings, ORG);
    if (signals.length >= 1 && signals[0].severity === "CRITICAL") r.push(pass("T100", "buildComplianceBrainSignals returns CRITICAL signals"));
    else r.push(fail("T100", "buildComplianceBrainSignals", `count=${signals.length}`));
  } catch (e) { r.push(fail("T100", "buildComplianceBrainSignals", e)); }

  return r;
}

// ── T101–T110: Data Classification + Retention ───────────────────────────────

async function runDataClassificationTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { if (DATA_CLASSIFICATION_LEVELS.length === 5) r.push(pass("T101", "5 data classification levels")); else r.push(fail("T101", "classification levels", `${DATA_CLASSIFICATION_LEVELS.length}`)); } catch (e) { r.push(fail("T101", "classification levels", e)); }
  try { const p = getClassificationPolicy("CONFIDENTIAL"); if (p?.requiresEncryption) r.push(pass("T102", "CONFIDENTIAL requiresEncryption=true")); else r.push(fail("T102", "CONFIDENTIAL encryption", "false")); } catch (e) { r.push(fail("T102", "classification policy", e)); }
  try { const enc = requiresEncryption("SECRET"); if (enc) r.push(pass("T103", "requiresEncryption(SECRET) = true")); else r.push(fail("T103", "requiresEncryption SECRET", "false")); } catch (e) { r.push(fail("T103", "requiresEncryption", e)); }
  try { const enc = requiresEncryption("PUBLIC"); if (!enc) r.push(pass("T104", "requiresEncryption(PUBLIC) = false")); else r.push(fail("T104", "requiresEncryption PUBLIC", "true")); } catch (e) { r.push(fail("T104", "requiresEncryption PUBLIC", e)); }
  try { const gdpr = isGdprPersonalData("CONFIDENTIAL"); if (gdpr) r.push(pass("T105", "isGdprPersonalData(CONFIDENTIAL) = true")); else r.push(fail("T105", "GDPR CONFIDENTIAL", "false")); } catch (e) { r.push(fail("T105", "isGdprPersonalData", e)); }
  try { const gdpr = isGdprPersonalData("SECRET"); if (!gdpr) r.push(pass("T106", "isGdprPersonalData(SECRET) = false (keys not PII)")); else r.push(fail("T106", "GDPR SECRET", "true")); } catch (e) { r.push(fail("T106", "isGdprPersonalData SECRET", e)); }
  try { if (DATA_CLASSIFICATION_POLICIES.every(p => p.requiresTls)) r.push(pass("T107", "all classification levels require TLS")); else r.push(fail("T107", "TLS required", "some missing")); } catch (e) { r.push(fail("T107", "TLS required", e)); }
  try { const p = getClassificationPolicy("SECRET"); if (p?.requiresMfa) r.push(pass("T108", "SECRET requiresMfa=true")); else r.push(fail("T108", "SECRET MFA", "false")); } catch (e) { r.push(fail("T108", "SECRET MFA", e)); }
  try { const p = getClassificationPolicy("PUBLIC"); if (!p?.requiresMfa) r.push(pass("T109", "PUBLIC requiresMfa=false")); else r.push(fail("T109", "PUBLIC MFA", "true")); } catch (e) { r.push(fail("T109", "PUBLIC MFA", e)); }
  try { const p = getClassificationPolicy("NONEXISTENT" as any); if (p === undefined) r.push(pass("T110", "getClassificationPolicy unknown returns undefined")); else r.push(fail("T110", "unknown policy", "not undefined")); } catch (e) { r.push(fail("T110", "unknown policy", e)); }

  return r;
}

async function runRetentionPolicyTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { if (RETENTION_POLICIES.length >= 14) r.push(pass("T111", `${RETENTION_POLICIES.length} retention policies defined`)); else r.push(fail("T111", "retention policy count", `${RETENTION_POLICIES.length}`)); } catch (e) { r.push(fail("T111", "retention policies", e)); }
  try { const p = getRetentionPolicy("SECURITY_AUDIT_LOG"); if ((p?.minRetentionDays ?? 0) >= 365) r.push(pass("T112", "SECURITY_AUDIT_LOG min retention ≥365 days")); else r.push(fail("T112", "audit log retention", `${p?.minRetentionDays}`)); } catch (e) { r.push(fail("T112", "audit retention", e)); }
  try { const ok = isRetentionCompliant("SECURITY_AUDIT_LOG", 400); if (ok) r.push(pass("T113", "isRetentionCompliant(400 days for audit) = true")); else r.push(fail("T113", "retention compliance", "false")); } catch (e) { r.push(fail("T113", "retentionCompliant", e)); }
  try { const ok = isRetentionCompliant("SECURITY_AUDIT_LOG", 100); if (!ok) r.push(pass("T114", "isRetentionCompliant(100 days for audit) = false")); else r.push(fail("T114", "retention 100 days", "should fail")); } catch (e) { r.push(fail("T114", "retentionCompliant 100d", e)); }
  try { const ok = isGdprErasurePermitted("CUSTOMER_DATA"); if (ok) r.push(pass("T115", "isGdprErasurePermitted(CUSTOMER_DATA) = true")); else r.push(fail("T115", "GDPR erasure", "false")); } catch (e) { r.push(fail("T115", "GDPR erasure", e)); }
  try { const ok = isGdprErasurePermitted("SECURITY_AUDIT_LOG"); if (!ok) r.push(pass("T116", "isGdprErasurePermitted(SECURITY_AUDIT_LOG) = false")); else r.push(fail("T116", "audit erasure", "should be false")); } catch (e) { r.push(fail("T116", "audit erasure false", e)); }
  try { const ok = isGdprErasurePermitted("USER_CONSENT"); if (!ok) r.push(pass("T117", "isGdprErasurePermitted(USER_CONSENT) = false (proof of consent)")); else r.push(fail("T117", "consent erasure", "should be false")); } catch (e) { r.push(fail("T117", "consent erasure", e)); }

  return r;
}

// ── T118–T135: Report Builder ─────────────────────────────────────────────────

async function runReportBuilderTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const rpt = buildSoc2ReadinessReport(ORG, []); if (rpt.framework === "SOC2" && rpt.orgSlug === ORG) r.push(pass("T118", "buildSoc2ReadinessReport returns SOC2 report")); else r.push(fail("T118", "soc2 report", "wrong fields")); } catch (e) { r.push(fail("T118", "soc2 report", e)); }
  try { const rpt = buildSoc2ReadinessReport(ORG, []); if (typeof rpt.score === "number" && rpt.score >= 0) r.push(pass("T119", "SOC2 report has numeric score")); else r.push(fail("T119", "soc2 score", "invalid")); } catch (e) { r.push(fail("T119", "soc2 score", e)); }
  try { const rpt = buildIso27001ReadinessReport(ORG, []); if (rpt.framework === "ISO27001" && rpt.orgSlug === ORG) r.push(pass("T120", "buildIso27001ReadinessReport returns ISO27001 report")); else r.push(fail("T120", "iso report", "wrong fields")); } catch (e) { r.push(fail("T120", "iso report", e)); }
  try { const rpt = buildSoc2ReadinessReport(ORG, []); if (rpt.readinessLevel === "READY" || rpt.readinessLevel === "PARTIAL" || rpt.readinessLevel === "NOT_READY") r.push(pass("T121", "SOC2 report has valid readinessLevel")); else r.push(fail("T121", "soc2 readiness level", rpt.readinessLevel)); } catch (e) { r.push(fail("T121", "soc2 readiness", e)); }
  try { const rpt = buildTenantComplianceReport(ORG, []); if (rpt.orgSlug === ORG && typeof rpt.score === "number") r.push(pass("T122", "buildTenantComplianceReport returns report")); else r.push(fail("T122", "tenant report", "wrong fields")); } catch (e) { r.push(fail("T122", "tenant report", e)); }
  try { const rpt = buildTenantComplianceReport(ORG, []); if (typeof rpt.frameworkScores.SOC2 === "number") r.push(pass("T123", "tenant report has frameworkScores.SOC2")); else r.push(fail("T123", "framework scores", "missing SOC2")); } catch (e) { r.push(fail("T123", "framework scores", e)); }
  try { const rpt = buildSecurityComplianceReport([]); if (typeof rpt.score === "number" && Array.isArray(rpt.recommendations)) r.push(pass("T124", "buildSecurityComplianceReport returns report")); else r.push(fail("T124", "security report", "wrong fields")); } catch (e) { r.push(fail("T124", "security report", e)); }
  try { const summary = buildExecutiveComplianceSummary(ORG, []); if (summary.orgSlug === ORG && typeof summary.overallScore === "number") r.push(pass("T125", "buildExecutiveComplianceSummary returns summary")); else r.push(fail("T125", "executive summary", "wrong fields")); } catch (e) { r.push(fail("T125", "executive summary", e)); }
  try { const summary = buildExecutiveComplianceSummary(ORG, []); if (typeof summary.headline === "string" && summary.headline.length > 0) r.push(pass("T126", "executive summary has headline")); else r.push(fail("T126", "headline", "missing")); } catch (e) { r.push(fail("T126", "headline", e)); }
  try { const findings = [makeFinding({ status: "NON_COMPLIANT", violations: [makeViolation({ isBlocking: true, severity: "CRITICAL" })] })]; const rpt = buildSoc2ReadinessReport(ORG, findings); if (rpt.readinessLevel === "NOT_READY") r.push(pass("T127", "SOC2 NOT_READY when blocking violations")); else r.push(fail("T127", "soc2 not ready", rpt.readinessLevel)); } catch (e) { r.push(fail("T127", "soc2 not ready", e)); }
  try { const exec = buildExecutiveComplianceSummary(ORG, []); if ("SOC2" in exec.frameworkReadiness) r.push(pass("T128", "executive summary has SOC2 frameworkReadiness")); else r.push(fail("T128", "frameworkReadiness SOC2", "missing")); } catch (e) { r.push(fail("T128", "frameworkReadiness", e)); }
  try { const rpt = buildTenantComplianceReport(ORG, []); if (Array.isArray(rpt.remediations)) r.push(pass("T129", "tenant report has remediations array")); else r.push(fail("T129", "remediations", "not array")); } catch (e) { r.push(fail("T129", "remediations", e)); }

  return r;
}

// ── T130–T141: Health + Readiness + Dashboard ─────────────────────────────────

async function runHealthReadinessTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { const h = await evaluateComplianceHealth(); if (h.overall === "HEALTHY" || h.overall === "DEGRADED") r.push(pass("T130", "evaluateComplianceHealth returns health report")); else r.push(fail("T130", "health report", h.overall)); } catch (e) { r.push(fail("T130", "health", e)); }
  try { const h = await evaluateComplianceHealth(); if (h.subsystems.length >= 5) r.push(pass("T131", `${h.subsystems.length} health subsystems`)); else r.push(fail("T131", "subsystem count", `${h.subsystems.length}`)); } catch (e) { r.push(fail("T131", "subsystems", e)); }
  try { const h = await evaluateComplianceHealth(); if (h.controlCount >= 11) r.push(pass("T132", `health reports ${h.controlCount} controls`)); else r.push(fail("T132", "control count in health", `${h.controlCount}`)); } catch (e) { r.push(fail("T132", "control count", e)); }
  try { const readiness = scanComplianceReadiness(); if (readiness.score >= 0 && readiness.score <= 100) r.push(pass("T133", `readiness score ${readiness.score}/100`)); else r.push(fail("T133", "readiness score", `${readiness.score}`)); } catch (e) { r.push(fail("T133", "readiness", e)); }
  try { const readiness = scanComplianceReadiness(); if (readiness.checks.length >= 10) r.push(pass("T134", `${readiness.checks.length} readiness checks`)); else r.push(fail("T134", "readiness checks", `${readiness.checks.length}`)); } catch (e) { r.push(fail("T134", "readiness checks", e)); }
  try { const d = buildEmptyComplianceDashboard(ORG); if (d.orgSlug === ORG && d.overallScore === 0) r.push(pass("T135", "buildEmptyComplianceDashboard returns zero-state")); else r.push(fail("T135", "empty dashboard", "wrong fields")); } catch (e) { r.push(fail("T135", "empty dashboard", e)); }
  try { const findings = [makeFinding({ status: "COMPLIANT", score: 100 })]; const d = buildComplianceDashboard(ORG, findings); if (d.compliantCount >= 1) r.push(pass("T136", "buildComplianceDashboard counts compliant findings")); else r.push(fail("T136", "dashboard compliant count", `${d.compliantCount}`)); } catch (e) { r.push(fail("T136", "dashboard", e)); }
  try { const findings = [makeFinding({ status: "NON_COMPLIANT", violations: [makeViolation({ severity: "CRITICAL" })] })]; const d = buildComplianceDashboard(ORG, findings); if (d.riskLevel === "CRITICAL") r.push(pass("T137", "dashboard riskLevel=CRITICAL for CRITICAL violations")); else r.push(fail("T137", "dashboard risk level", d.riskLevel)); } catch (e) { r.push(fail("T137", "dashboard risk", e)); }
  try { const d = buildComplianceDashboard(ORG, []); if (typeof d.headline === "string" && d.headline.length > 0) r.push(pass("T138", "dashboard has headline")); else r.push(fail("T138", "dashboard headline", "missing")); } catch (e) { r.push(fail("T138", "headline", e)); }
  try { const d = buildEmptyComplianceDashboard(ORG); if (d.frameworkScores.SOC2 === 0 && d.frameworkScores.ISO27001 === 0) r.push(pass("T139", "empty dashboard has zero framework scores")); else r.push(fail("T139", "empty framework scores", "not zero")); } catch (e) { r.push(fail("T139", "framework scores zero", e)); }

  return r;
}

// ── T140–T150: Future Compatibility ───────────────────────────────────────────

async function runFutureCompatibilityTests(): Promise<TestResult[]> {
  const r: TestResult[] = [];

  try { if (EXTERNAL_AUDITOR_INTEGRATIONS.length >= 4) r.push(pass("T140", `${EXTERNAL_AUDITOR_INTEGRATIONS.length} external auditor integrations defined`)); else r.push(fail("T140", "auditor integrations", `${EXTERNAL_AUDITOR_INTEGRATIONS.length}`)); } catch (e) { r.push(fail("T140", "auditor integrations", e)); }
  try { if (COMPLIANCE_AUTOMATION_PLANS.length >= 4) r.push(pass("T141", `${COMPLIANCE_AUTOMATION_PLANS.length} automation plans defined`)); else r.push(fail("T141", "automation plans", `${COMPLIANCE_AUTOMATION_PLANS.length}`)); } catch (e) { r.push(fail("T141", "automation plans", e)); }
  try { const allPlanned = EXTERNAL_AUDITOR_INTEGRATIONS.every(i => i.readinessStatus === "PLANNED"); if (allPlanned) r.push(pass("T142", "all auditor integrations are PLANNED status")); else r.push(fail("T142", "integrations planned", "some not planned")); } catch (e) { r.push(fail("T142", "planned status", e)); }
  try { const vanta = EXTERNAL_AUDITOR_INTEGRATIONS.find(i => i.provider === "VANTA"); if (vanta) r.push(pass("T143", "VANTA integration defined")); else r.push(fail("T143", "VANTA", "not found")); } catch (e) { r.push(fail("T143", "VANTA", e)); }
  try { const f = makeFinding(); const record = complianceFindingToAuditorRecord(f); if (record.findingId === f.id && typeof record.epochSeconds === "number") r.push(pass("T144", "complianceFindingToAuditorRecord maps correctly")); else r.push(fail("T144", "auditor record", "wrong fields")); } catch (e) { r.push(fail("T144", "auditor record", e)); }
  try { const f = makeFinding({ violations: [makeViolation({ isBlocking: true })] }); const record = complianceFindingToAuditorRecord(f); if (record.isBlocking) r.push(pass("T145", "auditor record isBlocking=true preserved")); else r.push(fail("T145", "isBlocking", "false")); } catch (e) { r.push(fail("T145", "isBlocking", e)); }
  try { if (Object.keys(SOC2_TSC_CONTROL_MAP).length >= 9) r.push(pass("T146", "SOC2 TSC map has 9 criteria")); else r.push(fail("T146", "SOC2 TSC", `${Object.keys(SOC2_TSC_CONTROL_MAP).length}`)); } catch (e) { r.push(fail("T146", "SOC2 TSC", e)); }
  try { const autoCollect = COMPLIANCE_AUTOMATION_PLANS.find(p => p.id === "AUTO_EVIDENCE_COLLECT"); if (autoCollect) r.push(pass("T147", "AUTO_EVIDENCE_COLLECT plan defined")); else r.push(fail("T147", "auto evidence", "not found")); } catch (e) { r.push(fail("T147", "auto evidence plan", e)); }
  try { const gdprPlan = COMPLIANCE_AUTOMATION_PLANS.find(p => p.id === "GDPR_ERASURE_WORKFLOW"); if (gdprPlan) r.push(pass("T148", "GDPR_ERASURE_WORKFLOW plan defined")); else r.push(fail("T148", "gdpr erasure plan", "not found")); } catch (e) { r.push(fail("T148", "gdpr plan", e)); }
  try {
    const signals = buildComplianceBrainSignals([makeFinding({ severity: "CRITICAL", status: "NON_COMPLIANT", violations: [makeViolation({ severity: "CRITICAL", isBlocking: true })] })], ORG);
    if (signals.length >= 1) {
      const msg = formatComplianceMessage(signals[0]);
      if (msg.includes("[COMPLIANCE CRITICAL]")) r.push(pass("T149", "formatComplianceMessage includes severity prefix"));
      else r.push(fail("T149", "formatComplianceMessage", msg.slice(0, 50)));
    } else {
      r.push(fail("T149", "formatComplianceMessage", "no signals"));
    }
  } catch (e) { r.push(fail("T149", "formatComplianceMessage", e)); }
  try {
    const signals = buildComplianceBrainSignals([makeFinding({ severity: "CRITICAL", status: "NON_COMPLIANT", violations: [makeViolation({ isBlocking: true })] })], ORG);
    const blocking = getBlockingSignals(signals);
    if (blocking.length >= 1) r.push(pass("T150", "getBlockingSignals filters blocking signals"));
    else r.push(fail("T150", "getBlockingSignals", `count=${blocking.length}`));
  } catch (e) { r.push(fail("T150", "getBlockingSignals", e)); }

  return r;
}
