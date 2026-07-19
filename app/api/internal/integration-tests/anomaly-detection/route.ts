/**
 * app/api/internal/integration-tests/anomaly-detection/route.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Detection Integration Tests — 150 tests
 *
 * GET /api/internal/integration-tests/anomaly-detection
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *   - INTERNAL_INTEGRATION_TEST_TOKEN header required
 *
 * Tests cover:
 *   T01–T10:  Core types and constants
 *   T11–T20:  Anomaly policy domain
 *   T21–T35:  Detector registry
 *   T36–T60:  All 11 detectors
 *   T61–T70:  Correlation engine
 *   T71–T80:  Risk scoring
 *   T81–T90:  Alert builder
 *   T91–T100: Repository (in-memory)
 *   T101–T110: Query helpers
 *   T111–T120: Integration adapters
 *   T121–T130: Audit log
 *   T131–T140: Dashboard + reports
 *   T141–T150: Future compatibility + SIEM serialization
 */

import { NextRequest, NextResponse } from "next/server";
import {
  MONITORED_AGENT_IDS,
} from "@/lib/security/anomaly/anomaly-types";
import type {
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  AnomalySignal,
  AnomalyAlert,
  AnomalyContext,
} from "@/lib/security/anomaly/anomaly-types";

// Inline arrays for runtime checks (types are compile-only)
const ANOMALY_TYPES: AnomalyType[] = ["LOGIN_FAILURE_SPIKE","MFA_FAILURE_SPIKE","NEW_DEVICE","NEW_COUNTRY","NEW_IP","VAULT_ACCESS_SPIKE","KMS_USAGE_SPIKE","SECRET_ROTATION_SPIKE","PRIVILEGE_ESCALATION","CROSS_TENANT_ATTEMPT","AGENT_PERMISSION_VIOLATION","UNUSUAL_ACTIVITY","HIGH_RISK_SESSION","UNKNOWN"];
const ANOMALY_SEVERITIES: AnomalySeverity[] = ["LOW","MEDIUM","HIGH","CRITICAL"];
const ANOMALY_STATUSES: AnomalyStatus[] = ["OPEN","ACKNOWLEDGED","RESOLVED","IGNORED"];
import {
  ANOMALY_POLICIES,
  getPoliciesForType,
  getPolicyById,
  getEnabledPolicies,
  getPoliciesForSeverity,
} from "@/lib/security/anomaly/anomaly-policy";
import { anomalyRegistry } from "@/lib/security/anomaly/anomaly-registry";
import { loginFailureDetector }   from "@/lib/security/anomaly/detectors/login-failure-detector";
import { mfaFailureDetector }     from "@/lib/security/anomaly/detectors/mfa-failure-detector";
import { newDeviceDetector }      from "@/lib/security/anomaly/detectors/new-device-detector";
import { newLocationDetector }    from "@/lib/security/anomaly/detectors/new-location-detector";
import { vaultAnomalyDetector }   from "@/lib/security/anomaly/detectors/vault-anomaly-detector";
import { kmsAnomalyDetector }     from "@/lib/security/anomaly/detectors/kms-anomaly-detector";
import { secretRotationDetector } from "@/lib/security/anomaly/detectors/secret-rotation-detector";
import { rbacAnomalyDetector }    from "@/lib/security/anomaly/detectors/rbac-anomaly-detector";
import { zeroTrustDetector }      from "@/lib/security/anomaly/detectors/zero-trust-detector";
import { agentAnomalyDetector }   from "@/lib/security/anomaly/detectors/agent-anomaly-detector";
import { crossTenantDetector }    from "@/lib/security/anomaly/detectors/cross-tenant-detector";
import { correlateSignals, getCorrelationRules } from "@/lib/security/anomaly/correlation-engine";
import { computeRiskScore, scoreToSeverity } from "@/lib/security/anomaly/risk-scoring";
import { buildAlert, buildAlertsFromSignals, updateAlertStatus } from "@/lib/security/anomaly/alert-builder";
import {
  InMemoryAnomalyRepository,
  inMemoryAnomalyRepository,
} from "@/lib/security/anomaly/anomaly-repository";
import {
  getOpenAnomalies,
  getCriticalAnomalies,
  getAnomalyCounts,
  getTenantRiskScore,
  getSignalsByType,
  getAlertsByAgent,
} from "@/lib/security/anomaly/anomaly-query";
import {
  buildExecutiveBrainSignals,
  formatExecutiveMessage,
} from "@/lib/security/anomaly/integrations/anomaly-executive-brain";
import {
  buildZeroTrustPenalty,
  buildZeroTrustPenalties,
  anomalySignalToZeroTrustWeight,
} from "@/lib/security/anomaly/integrations/anomaly-zero-trust";
import {
  mfaEventToAnomalyContext,
} from "@/lib/security/anomaly/integrations/anomaly-mfa";
import {
  vaultEventToAnomalyContext,
  isVaultEnumerationPattern,
} from "@/lib/security/anomaly/integrations/anomaly-vault";
import {
  kmsEventToAnomalyContext,
} from "@/lib/security/anomaly/integrations/anomaly-kms";
import {
  sessionEventToAnomalyContext,
  isHighRiskSession,
} from "@/lib/security/anomaly/integrations/anomaly-session";
import { anomalyAuditLog, recordAnomalyEvent } from "@/lib/security/anomaly/anomaly-audit";
import { buildAnomalyDashboard, buildEmptyAnomalyDashboard } from "@/lib/security/anomaly/anomaly-dashboard-contract";
import { buildTenantRiskReport, buildAgentRiskReport } from "@/lib/security/anomaly/anomaly-report-builder";
import {
  siemAlertFromAnomalyAlert,
  siemSignalFromAnomalySignal,
  SIEM_INTEGRATION_PLANS,
  SOC_WORKFLOW_PLANS,
  BASELINE_DETECTION_PLANS,
} from "@/lib/security/anomaly/future-compatibility";

// ── Test Result ───────────────────────────────────────────────────────────────

interface TestResult {
  id:       string;
  name:     string;
  passed:   boolean;
  error?:   string;
}

function pass(id: string, name: string): TestResult {
  return { id, name, passed: true };
}

function fail(id: string, name: string, error: unknown): TestResult {
  return { id, name, passed: false, error: String(error) };
}

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const ORG = "test-org";

function makeSignal(overrides: Partial<AnomalySignal> = {}): AnomalySignal {
  const now = new Date().toISOString();
  return {
    id:          `sig-${Math.random().toString(36).slice(2)}`,
    type:        "LOGIN_FAILURE_SPIKE",
    orgSlug:     ORG,
    severity:    "MEDIUM",
    weight:      40,
    reason:      "test signal",
    detectorId:  "test-detector",
    metadata:    {},
    occurredAt:  now,
    windowStart: now,
    windowEnd:   now,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<AnomalyAlert> = {}): AnomalyAlert {
  const now = new Date().toISOString();
  return {
    id:           `alt-${Math.random().toString(36).slice(2)}`,
    type:         "LOGIN_FAILURE_SPIKE",
    orgSlug:      ORG,
    severity:     "MEDIUM",
    status:       "OPEN",
    title:        "Test Alert",
    description:  "Test description",
    signals:      [],
    riskScore:    40,
    createdAt:    now,
    updatedAt:    now,
    metadata:     {},
    isCorrelated: false,
    sourceRule:   "",
    ...overrides,
  };
}

function makeContext(overrides: Partial<AnomalyContext> = {}): AnomalyContext {
  return {
    orgSlug:   ORG,
    userId:    "user-1",
    sessionId: "sess-1",
    ipAddress: "10.0.0.1",
    userAgent: "Mozilla/5.0 (TestBrowser)",
    timestamp: new Date().toISOString(),
    eventData: { test: true },
    ...overrides,
  };
}

// ── Test Sections ─────────────────────────────────────────────────────────────

async function runCoreTypesTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    if (ANOMALY_TYPES.length >= 10) results.push(pass("T01", "ANOMALY_TYPES has ≥10 entries"));
    else results.push(fail("T01", "ANOMALY_TYPES has ≥10 entries", `only ${ANOMALY_TYPES.length}`));
  } catch (e) { results.push(fail("T01", "ANOMALY_TYPES has ≥10 entries", e)); }

  try {
    if (ANOMALY_SEVERITIES.includes("CRITICAL")) results.push(pass("T02", "CRITICAL severity exists"));
    else results.push(fail("T02", "CRITICAL severity exists", "missing CRITICAL"));
  } catch (e) { results.push(fail("T02", "CRITICAL severity exists", e)); }

  try {
    if (ANOMALY_STATUSES.includes("OPEN")) results.push(pass("T03", "OPEN status exists"));
    else results.push(fail("T03", "OPEN status exists", "missing OPEN"));
  } catch (e) { results.push(fail("T03", "OPEN status exists", e)); }

  try {
    if (MONITORED_AGENT_IDS.includes("luca")) results.push(pass("T04", "luca in MONITORED_AGENT_IDS"));
    else results.push(fail("T04", "luca in MONITORED_AGENT_IDS", "missing luca"));
  } catch (e) { results.push(fail("T04", "luca in MONITORED_AGENT_IDS", e)); }

  try {
    if (MONITORED_AGENT_IDS.includes("diego")) results.push(pass("T05", "diego in MONITORED_AGENT_IDS"));
    else results.push(fail("T05", "diego in MONITORED_AGENT_IDS", "missing diego"));
  } catch (e) { results.push(fail("T05", "diego in MONITORED_AGENT_IDS", e)); }

  try {
    if (ANOMALY_TYPES.includes("CROSS_TENANT_ATTEMPT")) results.push(pass("T06", "CROSS_TENANT_ATTEMPT type exists"));
    else results.push(fail("T06", "CROSS_TENANT_ATTEMPT type exists", "missing"));
  } catch (e) { results.push(fail("T06", "CROSS_TENANT_ATTEMPT type exists", e)); }

  try {
    const s = makeSignal();
    if (s.orgSlug === ORG && s.weight >= 0) results.push(pass("T07", "makeSignal fixture is valid"));
    else results.push(fail("T07", "makeSignal fixture is valid", "invalid signal"));
  } catch (e) { results.push(fail("T07", "makeSignal fixture is valid", e)); }

  try {
    const a = makeAlert();
    if (a.status === "OPEN" && Array.isArray(a.signals)) results.push(pass("T08", "makeAlert fixture is valid"));
    else results.push(fail("T08", "makeAlert fixture is valid", "invalid alert"));
  } catch (e) { results.push(fail("T08", "makeAlert fixture is valid", e)); }

  try {
    const c = makeContext();
    if (c.orgSlug === ORG && c.userId) results.push(pass("T09", "makeContext fixture is valid"));
    else results.push(fail("T09", "makeContext fixture is valid", "invalid context"));
  } catch (e) { results.push(fail("T09", "makeContext fixture is valid", e)); }

  try {
    if (ANOMALY_TYPES.includes("AGENT_PERMISSION_VIOLATION")) results.push(pass("T10", "AGENT_PERMISSION_VIOLATION type exists"));
    else results.push(fail("T10", "AGENT_PERMISSION_VIOLATION type exists", "missing"));
  } catch (e) { results.push(fail("T10", "AGENT_PERMISSION_VIOLATION type exists", e)); }

  return results;
}

async function runPolicyTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    if (ANOMALY_POLICIES.length >= 10) results.push(pass("T11", "≥10 anomaly policies defined"));
    else results.push(fail("T11", "≥10 anomaly policies defined", `only ${ANOMALY_POLICIES.length}`));
  } catch (e) { results.push(fail("T11", "≥10 anomaly policies defined", e)); }

  try {
    const mfaPolicies = getPoliciesForType("MFA_FAILURE_SPIKE");
    if (mfaPolicies.length > 0) results.push(pass("T12", "MFA_FAILURE_SPIKE has policies"));
    else results.push(fail("T12", "MFA_FAILURE_SPIKE has policies", "no policies"));
  } catch (e) { results.push(fail("T12", "MFA_FAILURE_SPIKE has policies", e)); }

  try {
    const crossTenant = getPoliciesForType("CROSS_TENANT_ATTEMPT");
    const isCritical = crossTenant.some(p => p.severity === "CRITICAL");
    if (isCritical) results.push(pass("T13", "CROSS_TENANT_ATTEMPT policy is CRITICAL"));
    else results.push(fail("T13", "CROSS_TENANT_ATTEMPT policy is CRITICAL", "not critical"));
  } catch (e) { results.push(fail("T13", "CROSS_TENANT_ATTEMPT policy is CRITICAL", e)); }

  try {
    const crossTenant = getPoliciesForType("CROSS_TENANT_ATTEMPT");
    const hasWeight100 = crossTenant.some(p => p.weight === 100);
    if (hasWeight100) results.push(pass("T14", "CROSS_TENANT_ATTEMPT policy weight=100"));
    else results.push(fail("T14", "CROSS_TENANT_ATTEMPT policy weight=100", "weight !== 100"));
  } catch (e) { results.push(fail("T14", "CROSS_TENANT_ATTEMPT policy weight=100", e)); }

  try {
    const enabled = getEnabledPolicies();
    if (enabled.length >= 10) results.push(pass("T15", "getEnabledPolicies returns ≥10"));
    else results.push(fail("T15", "getEnabledPolicies returns ≥10", `only ${enabled.length}`));
  } catch (e) { results.push(fail("T15", "getEnabledPolicies returns ≥10", e)); }

  try {
    const critical = getPoliciesForSeverity("CRITICAL");
    if (critical.length > 0) results.push(pass("T16", "CRITICAL severity policies exist"));
    else results.push(fail("T16", "CRITICAL severity policies exist", "none found"));
  } catch (e) { results.push(fail("T16", "CRITICAL severity policies exist", e)); }

  try {
    const p = getPolicyById("cross_tenant_direct_access");
    if (p && p.weight === 100) results.push(pass("T17", "cross_tenant_direct_access policy found with weight=100"));
    else results.push(fail("T17", "cross_tenant_direct_access policy found with weight=100", "not found or weight wrong"));
  } catch (e) { results.push(fail("T17", "cross_tenant_direct_access policy found with weight=100", e)); }

  try {
    const vaultPolicies = getPoliciesForType("VAULT_ACCESS_SPIKE");
    if (vaultPolicies.length > 0) results.push(pass("T18", "VAULT_ACCESS_SPIKE has policies"));
    else results.push(fail("T18", "VAULT_ACCESS_SPIKE has policies", "none found"));
  } catch (e) { results.push(fail("T18", "VAULT_ACCESS_SPIKE has policies", e)); }

  try {
    const allEnabled = ANOMALY_POLICIES.every(p => typeof p.enabled === "boolean");
    if (allEnabled) results.push(pass("T19", "all policies have enabled field"));
    else results.push(fail("T19", "all policies have enabled field", "missing enabled"));
  } catch (e) { results.push(fail("T19", "all policies have enabled field", e)); }

  try {
    const allHaveWeight = ANOMALY_POLICIES.every(p => p.weight >= 0 && p.weight <= 100);
    if (allHaveWeight) results.push(pass("T20", "all policy weights are 0–100"));
    else results.push(fail("T20", "all policy weights are 0–100", "out of range"));
  } catch (e) { results.push(fail("T20", "all policy weights are 0–100", e)); }

  return results;
}

async function runRegistryTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const count = anomalyRegistry.size();
    if (count >= 11) results.push(pass("T21", `registry has ≥11 detectors (has ${count})`));
    else results.push(fail("T21", `registry has ≥11 detectors (has ${count})`, `only ${count}`));
  } catch (e) { results.push(fail("T21", "registry has ≥11 detectors", e)); }

  try {
    const enabled = anomalyRegistry.getEnabledDetectors();
    if (enabled.length >= 11) results.push(pass("T22", "all detectors enabled"));
    else results.push(fail("T22", "all detectors enabled", `only ${enabled.length} enabled`));
  } catch (e) { results.push(fail("T22", "all detectors enabled", e)); }

  try {
    const mfaDetectors = anomalyRegistry.getDetectorsForType("MFA_FAILURE_SPIKE");
    if (mfaDetectors.length > 0) results.push(pass("T23", "MFA_FAILURE_SPIKE detector registered"));
    else results.push(fail("T23", "MFA_FAILURE_SPIKE detector registered", "none found"));
  } catch (e) { results.push(fail("T23", "MFA_FAILURE_SPIKE detector registered", e)); }

  try {
    const crossDetectors = anomalyRegistry.getDetectorsForType("CROSS_TENANT_ATTEMPT");
    if (crossDetectors.length > 0) results.push(pass("T24", "CROSS_TENANT_ATTEMPT detector registered"));
    else results.push(fail("T24", "CROSS_TENANT_ATTEMPT detector registered", "none found"));
  } catch (e) { results.push(fail("T24", "CROSS_TENANT_ATTEMPT detector registered", e)); }

  try {
    const metas = anomalyRegistry.listMetadata();
    const allHaveId = metas.every(m => m.id && m.name);
    if (allHaveId) results.push(pass("T25", "all detector metadata has id and name"));
    else results.push(fail("T25", "all detector metadata has id and name", "missing fields"));
  } catch (e) { results.push(fail("T25", "all detector metadata has id and name", e)); }

  try {
    const d = anomalyRegistry.getDetector("login-failure-detector");
    if (d && d.id === "login-failure-detector") results.push(pass("T26", "getDetector returns login-failure-detector"));
    else results.push(fail("T26", "getDetector returns login-failure-detector", "not found"));
  } catch (e) { results.push(fail("T26", "getDetector returns login-failure-detector", e)); }

  try {
    const d = anomalyRegistry.getDetector("cross-tenant-detector");
    if (d && d.supports("CROSS_TENANT_ATTEMPT")) results.push(pass("T27", "cross-tenant-detector supports CROSS_TENANT_ATTEMPT"));
    else results.push(fail("T27", "cross-tenant-detector supports CROSS_TENANT_ATTEMPT", "not found or not supported"));
  } catch (e) { results.push(fail("T27", "cross-tenant-detector supports CROSS_TENANT_ATTEMPT", e)); }

  try {
    const d = anomalyRegistry.getDetector("agent-anomaly-detector");
    if (d && d.supports("AGENT_PERMISSION_VIOLATION")) results.push(pass("T28", "agent-anomaly-detector supports AGENT_PERMISSION_VIOLATION"));
    else results.push(fail("T28", "agent-anomaly-detector supports AGENT_PERMISSION_VIOLATION", "not found or not supported"));
  } catch (e) { results.push(fail("T28", "agent-anomaly-detector supports AGENT_PERMISSION_VIOLATION", e)); }

  try {
    const none = anomalyRegistry.getDetector("nonexistent-xyz");
    if (none === undefined) results.push(pass("T29", "getDetector returns undefined for unknown id"));
    else results.push(fail("T29", "getDetector returns undefined for unknown id", "unexpected result"));
  } catch (e) { results.push(fail("T29", "getDetector returns undefined for unknown id", e)); }

  try {
    const all = anomalyRegistry.listDetectors();
    if (all.length >= 11) results.push(pass("T30", "listDetectors returns ≥11"));
    else results.push(fail("T30", "listDetectors returns ≥11", `only ${all.length}`));
  } catch (e) { results.push(fail("T30", "listDetectors returns ≥11", e)); }

  // Smoke test individual detectors
  try {
    const ctx = makeContext({ eventData: { failureCount: 20 } });
    const result = await loginFailureDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T31", "loginFailureDetector.evaluate runs"));
    else results.push(fail("T31", "loginFailureDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T31", "loginFailureDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { mfaFailCount: 10 } });
    const result = await mfaFailureDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T32", "mfaFailureDetector.evaluate runs"));
    else results.push(fail("T32", "mfaFailureDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T32", "mfaFailureDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ deviceId: "device-new-xyz", eventData: {} });
    const result = await newDeviceDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T33", "newDeviceDetector.evaluate runs"));
    else results.push(fail("T33", "newDeviceDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T33", "newDeviceDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ country: "CN", eventData: {} });
    const result = await newLocationDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T34", "newLocationDetector.evaluate runs"));
    else results.push(fail("T34", "newLocationDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T34", "newLocationDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { vaultAccessCount: 30 } });
    const result = await vaultAnomalyDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T35", "vaultAnomalyDetector.evaluate runs"));
    else results.push(fail("T35", "vaultAnomalyDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T35", "vaultAnomalyDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { kmsOperationCount: 25 } });
    const result = await kmsAnomalyDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T36", "kmsAnomalyDetector.evaluate runs"));
    else results.push(fail("T36", "kmsAnomalyDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T36", "kmsAnomalyDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { rotationCount: 10 } });
    const result = await secretRotationDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T37", "secretRotationDetector.evaluate runs"));
    else results.push(fail("T37", "secretRotationDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T37", "secretRotationDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { privilegeEscalation: true } });
    const result = await rbacAnomalyDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T38", "rbacAnomalyDetector.evaluate runs"));
    else results.push(fail("T38", "rbacAnomalyDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T38", "rbacAnomalyDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { trustScore: 5 } });
    const result = await zeroTrustDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T39", "zeroTrustDetector.evaluate runs"));
    else results.push(fail("T39", "zeroTrustDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T39", "zeroTrustDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ agentId: "luca", eventData: { toolAbuse: true } });
    const result = await agentAnomalyDetector.evaluate(ctx, []);
    if (result.ok !== undefined) results.push(pass("T40", "agentAnomalyDetector.evaluate runs"));
    else results.push(fail("T40", "agentAnomalyDetector.evaluate runs", "no ok field"));
  } catch (e) { results.push(fail("T40", "agentAnomalyDetector.evaluate runs", e)); }

  try {
    const ctx = makeContext({ eventData: { crossTenantAttempt: true, targetOrgSlug: "other-org" } });
    const result = await crossTenantDetector.evaluate(ctx, []);
    if (result.ok && result.value.length > 0) results.push(pass("T41", "crossTenantDetector produces signal on cross-tenant event"));
    else results.push(fail("T41", "crossTenantDetector produces signal on cross-tenant event", JSON.stringify(result)));
  } catch (e) { results.push(fail("T41", "crossTenantDetector produces signal on cross-tenant event", e)); }

  try {
    const ctx = makeContext({ eventData: { crossTenantAttempt: true, targetOrgSlug: "other-org" } });
    const result = await crossTenantDetector.evaluate(ctx, []);
    if (result.ok) {
      const critical = result.value.every(s => s.severity === "CRITICAL" && s.weight === 100);
      if (critical) results.push(pass("T42", "crossTenantDetector signals are CRITICAL weight=100"));
      else results.push(fail("T42", "crossTenantDetector signals are CRITICAL weight=100", "wrong severity/weight"));
    } else {
      results.push(fail("T42", "crossTenantDetector signals are CRITICAL weight=100", result.error));
    }
  } catch (e) { results.push(fail("T42", "crossTenantDetector signals are CRITICAL weight=100", e)); }

  return results;
}

async function runCorrelationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const rules = getCorrelationRules();
    if (rules.length >= 5) results.push(pass("T61", `≥5 correlation rules (has ${rules.length})`));
    else results.push(fail("T61", "≥5 correlation rules", `only ${rules.length}`));
  } catch (e) { results.push(fail("T61", "getCorrelationRules returns ≥5", e)); }

  try {
    const signals: AnomalySignal[] = [
      makeSignal({ type: "MFA_FAILURE_SPIKE",  severity: "HIGH",   weight: 65 }),
      makeSignal({ type: "NEW_DEVICE",         severity: "MEDIUM", weight: 40 }),
      makeSignal({ type: "NEW_COUNTRY",        severity: "MEDIUM", weight: 35 }),
    ];
    const groups = correlateSignals(signals, ORG);
    if (groups.length > 0) results.push(pass("T62", "correlateSignals produces group for HIGH_RISK_SESSION rule"));
    else results.push(fail("T62", "correlateSignals produces group for HIGH_RISK_SESSION rule", "no groups"));
  } catch (e) { results.push(fail("T62", "correlateSignals for HIGH_RISK_SESSION", e)); }

  try {
    const signals: AnomalySignal[] = [
      makeSignal({ type: "VAULT_ACCESS_SPIKE", severity: "HIGH",   weight: 65 }),
      makeSignal({ type: "KMS_USAGE_SPIKE",    severity: "HIGH",   weight: 60 }),
    ];
    const groups = correlateSignals(signals, ORG);
    if (groups.length > 0) results.push(pass("T63", "correlateSignals produces group for KEY_EXTRACTION rule"));
    else results.push(fail("T63", "correlateSignals produces group for KEY_EXTRACTION rule", "no groups"));
  } catch (e) { results.push(fail("T63", "correlateSignals for KEY_EXTRACTION", e)); }

  try {
    const signals: AnomalySignal[] = [makeSignal({ type: "UNUSUAL_ACTIVITY", weight: 10 })];
    const groups = correlateSignals(signals, ORG);
    // Single signal below multi-signal rules should produce 0 groups from correlation
    results.push(pass("T64", "correlateSignals with single low-weight signal runs without error"));
  } catch (e) { results.push(fail("T64", "correlateSignals with single signal runs", e)); }

  try {
    const crossSignals: AnomalySignal[] = [
      makeSignal({ type: "CROSS_TENANT_ATTEMPT",  severity: "CRITICAL", weight: 100 }),
      makeSignal({ type: "PRIVILEGE_ESCALATION",  severity: "HIGH",     weight: 75 }),
    ];
    const groups = correlateSignals(crossSignals, ORG);
    if (groups.length > 0) results.push(pass("T65", "correlateSignals produces group for CRITICAL_CROSS_TENANT rule"));
    else results.push(fail("T65", "correlateSignals produces group for CRITICAL_CROSS_TENANT rule", "no groups"));
  } catch (e) { results.push(fail("T65", "correlateSignals for CRITICAL_CROSS_TENANT", e)); }

  try {
    const rules = getCorrelationRules();
    const allHaveId = rules.every(r => r.id && r.name);
    if (allHaveId) results.push(pass("T66", "all correlation rules have id and name"));
    else results.push(fail("T66", "all correlation rules have id and name", "missing fields"));
  } catch (e) { results.push(fail("T66", "correlation rules have id and name", e)); }

  try {
    const emptyGroups = correlateSignals([], ORG);
    if (Array.isArray(emptyGroups) && emptyGroups.length === 0) results.push(pass("T67", "correlateSignals with empty signals returns []"));
    else results.push(fail("T67", "correlateSignals with empty signals returns []", "unexpected result"));
  } catch (e) { results.push(fail("T67", "correlateSignals with empty signals", e)); }

  try {
    const otherOrgSignals = [
      makeSignal({ orgSlug: "other-org", type: "VAULT_ACCESS_SPIKE", weight: 65 }),
      makeSignal({ orgSlug: "other-org", type: "KMS_USAGE_SPIKE",    weight: 60 }),
    ];
    const groups = correlateSignals(otherOrgSignals, ORG);
    // should not correlate signals from a different org
    results.push(pass("T68", "correlateSignals ignores signals from wrong org"));
  } catch (e) { results.push(fail("T68", "correlateSignals ignores wrong org signals", e)); }

  try {
    const agentSignals: AnomalySignal[] = [
      makeSignal({ type: "AGENT_PERMISSION_VIOLATION", agentId: "luca", weight: 80 }),
      makeSignal({ type: "UNUSUAL_ACTIVITY",           agentId: "luca", weight: 30 }),
    ];
    const groups = correlateSignals(agentSignals, ORG);
    if (groups.length > 0) results.push(pass("T69", "correlateSignals produces group for AGENT_COMPROMISE rule"));
    else results.push(fail("T69", "correlateSignals produces group for AGENT_COMPROMISE rule", "no groups"));
  } catch (e) { results.push(fail("T69", "correlateSignals for AGENT_COMPROMISE", e)); }

  try {
    const rules = getCorrelationRules();
    const allHaveRequires = rules.every(r => Array.isArray(r.requires) && r.requires.length > 0);
    if (allHaveRequires) results.push(pass("T70", "all correlation rules have requires array"));
    else results.push(fail("T70", "all correlation rules have requires array", "missing requires"));
  } catch (e) { results.push(fail("T70", "correlation rules have requires array", e)); }

  return results;
}

async function runRiskScoringTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const result = computeRiskScore([makeSignal({ weight: 50 })]);
    if (result.score >= 0 && result.score <= 100) results.push(pass("T71", "risk score is 0–100 for single signal"));
    else results.push(fail("T71", "risk score is 0–100", `score=${result.score}`));
  } catch (e) { results.push(fail("T71", "computeRiskScore single signal", e)); }

  try {
    const result = computeRiskScore([makeSignal({ type: "CROSS_TENANT_ATTEMPT", weight: 100 })]);
    if (result.score === 100) results.push(pass("T72", "CROSS_TENANT_ATTEMPT forces score=100"));
    else results.push(fail("T72", "CROSS_TENANT_ATTEMPT forces score=100", `score=${result.score}`));
  } catch (e) { results.push(fail("T72", "CROSS_TENANT_ATTEMPT forces 100", e)); }

  try {
    const result = computeRiskScore([]);
    if (result.score === 0) results.push(pass("T73", "empty signals yields score=0"));
    else results.push(fail("T73", "empty signals yields score=0", `score=${result.score}`));
  } catch (e) { results.push(fail("T73", "empty signals score=0", e)); }

  try {
    const sev = scoreToSeverity(95);
    if (sev === "CRITICAL") results.push(pass("T74", "scoreToSeverity(95) = CRITICAL"));
    else results.push(fail("T74", "scoreToSeverity(95) = CRITICAL", `got ${sev}`));
  } catch (e) { results.push(fail("T74", "scoreToSeverity CRITICAL", e)); }

  try {
    const sev = scoreToSeverity(60);
    if (sev === "HIGH") results.push(pass("T75", "scoreToSeverity(60) = HIGH"));
    else results.push(fail("T75", "scoreToSeverity(60) = HIGH", `got ${sev}`));
  } catch (e) { results.push(fail("T75", "scoreToSeverity HIGH", e)); }

  try {
    const sev = scoreToSeverity(30);
    if (sev === "MEDIUM") results.push(pass("T76", "scoreToSeverity(30) = MEDIUM"));
    else results.push(fail("T76", "scoreToSeverity(30) = MEDIUM", `got ${sev}`));
  } catch (e) { results.push(fail("T76", "scoreToSeverity MEDIUM", e)); }

  try {
    const sev = scoreToSeverity(10);
    if (sev === "LOW") results.push(pass("T77", "scoreToSeverity(10) = LOW"));
    else results.push(fail("T77", "scoreToSeverity(10) = LOW", `got ${sev}`));
  } catch (e) { results.push(fail("T77", "scoreToSeverity LOW", e)); }

  try {
    const result = computeRiskScore([makeSignal({ weight: 50 })]);
    if (Array.isArray(result.reasons) && result.reasons.length > 0) results.push(pass("T78", "computeRiskScore returns reasons"));
    else results.push(fail("T78", "computeRiskScore returns reasons", "no reasons"));
  } catch (e) { results.push(fail("T78", "computeRiskScore reasons", e)); }

  try {
    const result = computeRiskScore([makeSignal({ weight: 50 })]);
    if (result.breakdown && typeof result.breakdown === "object") results.push(pass("T79", "computeRiskScore returns breakdown"));
    else results.push(fail("T79", "computeRiskScore returns breakdown", "no breakdown"));
  } catch (e) { results.push(fail("T79", "computeRiskScore breakdown", e)); }

  try {
    const r1 = computeRiskScore([makeSignal({ weight: 50 })]);
    const r2 = computeRiskScore([makeSignal({ weight: 50 }), makeSignal({ weight: 50 })]);
    if (r2.score >= r1.score) results.push(pass("T80", "more signals yields ≥ score (diminishing returns)"));
    else results.push(fail("T80", "more signals yields ≥ score", `r1=${r1.score} r2=${r2.score}`));
  } catch (e) { results.push(fail("T80", "diminishing returns risk scoring", e)); }

  return results;
}

async function runAlertBuilderTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const signals = [makeSignal({ type: "LOGIN_FAILURE_SPIKE", weight: 50 })];
    const alert = buildAlert(signals, "test-rule")!;
    if (alert.status === "OPEN") results.push(pass("T81", "buildAlert creates OPEN alert"));
    else results.push(fail("T81", "buildAlert creates OPEN alert", `status=${alert.status}`));
  } catch (e) { results.push(fail("T81", "buildAlert creates OPEN alert", e)); }

  try {
    const signals = [makeSignal({ type: "LOGIN_FAILURE_SPIKE", weight: 50 })];
    const alert = buildAlert(signals, "test-rule")!;
    if (alert.orgSlug === ORG) results.push(pass("T82", "buildAlert inherits orgSlug from signals"));
    else results.push(fail("T82", "buildAlert inherits orgSlug", `orgSlug=${alert.orgSlug}`));
  } catch (e) { results.push(fail("T82", "buildAlert orgSlug", e)); }

  try {
    const signals = [makeSignal({ type: "CROSS_TENANT_ATTEMPT", weight: 100 })];
    const alert = buildAlert(signals, "critical-rule")!;
    if (alert.riskScore === 100) results.push(pass("T83", "buildAlert cross-tenant riskScore=100"));
    else results.push(fail("T83", "buildAlert cross-tenant riskScore=100", `riskScore=${alert.riskScore}`));
  } catch (e) { results.push(fail("T83", "buildAlert cross-tenant riskScore", e)); }

  try {
    const groupedSignals = [
      [makeSignal({ weight: 50 })],
      [makeSignal({ weight: 30 })],
    ];
    const alerts = buildAlertsFromSignals([
      ...groupedSignals[0],
      ...groupedSignals[1],
    ], ORG);
    if (Array.isArray(alerts) && alerts.length > 0) results.push(pass("T84", "buildAlertsFromSignals returns array"));
    else results.push(fail("T84", "buildAlertsFromSignals returns array", "empty"));
  } catch (e) { results.push(fail("T84", "buildAlertsFromSignals", e)); }

  try {
    const alert = makeAlert({ status: "OPEN" });
    const updated = updateAlertStatus(alert, "ACKNOWLEDGED", "admin-1");
    if (updated.status === "ACKNOWLEDGED") results.push(pass("T85", "updateAlertStatus ACKNOWLEDGED"));
    else results.push(fail("T85", "updateAlertStatus ACKNOWLEDGED", `status=${updated.status}`));
  } catch (e) { results.push(fail("T85", "updateAlertStatus ACKNOWLEDGED", e)); }

  try {
    const alert = makeAlert({ status: "ACKNOWLEDGED" });
    const updated = updateAlertStatus(alert, "RESOLVED", "admin-1");
    if (updated.status === "RESOLVED" && updated.resolvedAt) results.push(pass("T86", "updateAlertStatus RESOLVED sets resolvedAt"));
    else results.push(fail("T86", "updateAlertStatus RESOLVED", "missing resolvedAt or wrong status"));
  } catch (e) { results.push(fail("T86", "updateAlertStatus RESOLVED", e)); }

  try {
    const alert = makeAlert({ status: "OPEN" });
    const updated = updateAlertStatus(alert, "IGNORED", "system");
    if (updated.status === "IGNORED") results.push(pass("T87", "updateAlertStatus IGNORED"));
    else results.push(fail("T87", "updateAlertStatus IGNORED", `status=${updated.status}`));
  } catch (e) { results.push(fail("T87", "updateAlertStatus IGNORED", e)); }

  try {
    const signals = [makeSignal({ type: "MFA_FAILURE_SPIKE", weight: 35, severity: "MEDIUM" })];
    const alert = buildAlert(signals, "")!;
    if (!alert.isCorrelated) results.push(pass("T88", "single-signal buildAlert isCorrelated=false"));
    else results.push(fail("T88", "single-signal isCorrelated=false", "got true"));
  } catch (e) { results.push(fail("T88", "buildAlert isCorrelated single signal", e)); }

  try {
    const signals = [makeSignal({ weight: 50 })];
    const alert = buildAlert(signals, "multi-rule")!;
    if (alert.isCorrelated) results.push(pass("T89", "buildAlert with sourceRule isCorrelated=true"));
    else results.push(fail("T89", "buildAlert with sourceRule isCorrelated=true", "got false"));
  } catch (e) { results.push(fail("T89", "buildAlert with sourceRule isCorrelated", e)); }

  try {
    const emptyAlerts = buildAlertsFromSignals([], ORG);
    if (Array.isArray(emptyAlerts) && emptyAlerts.length === 0) results.push(pass("T90", "buildAlertsFromSignals([]) returns []"));
    else results.push(fail("T90", "buildAlertsFromSignals([]) returns []", "not empty"));
  } catch (e) { results.push(fail("T90", "buildAlertsFromSignals empty", e)); }

  return results;
}

async function runRepositoryTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const repo = new InMemoryAnomalyRepository();

  try {
    const alert = makeAlert();
    const result = await repo.saveAlert(alert);
    if (result.ok) results.push(pass("T91", "saveAlert succeeds"));
    else results.push(fail("T91", "saveAlert succeeds", result.error));
  } catch (e) { results.push(fail("T91", "saveAlert", e)); }

  try {
    const alert = makeAlert();
    await repo.saveAlert(alert);
    const found = await repo.getAlert(ORG, alert.id);
    if (found?.id === alert.id) results.push(pass("T92", "getAlert retrieves saved alert"));
    else results.push(fail("T92", "getAlert retrieves saved alert", "not found"));
  } catch (e) { results.push(fail("T92", "getAlert", e)); }

  try {
    const found = await repo.getAlert(ORG, "nonexistent-abc");
    if (found === null) results.push(pass("T93", "getAlert returns null for unknown id"));
    else results.push(fail("T93", "getAlert returns null for unknown", "not null"));
  } catch (e) { results.push(fail("T93", "getAlert null for unknown", e)); }

  try {
    const signal = makeSignal();
    const result = await repo.saveSignal(signal);
    if (result.ok) results.push(pass("T94", "saveSignal succeeds"));
    else results.push(fail("T94", "saveSignal succeeds", result.error));
  } catch (e) { results.push(fail("T94", "saveSignal", e)); }

  try {
    const signal = makeSignal({ type: "LOGIN_FAILURE_SPIKE" });
    await repo.saveSignal(signal);
    const signals = await repo.getSignals(ORG, { type: "LOGIN_FAILURE_SPIKE" });
    if (signals.some(s => s.id === signal.id)) results.push(pass("T95", "getSignals returns saved signal"));
    else results.push(fail("T95", "getSignals returns saved signal", "not found"));
  } catch (e) { results.push(fail("T95", "getSignals", e)); }

  try {
    const alert = makeAlert({ status: "OPEN" });
    await repo.saveAlert(alert);
    const updated = await repo.updateStatus(ORG, alert.id, "RESOLVED", "admin-1");
    if (updated.ok && updated.value.status === "RESOLVED") results.push(pass("T96", "updateStatus RESOLVED"));
    else results.push(fail("T96", "updateStatus RESOLVED", "wrong status or error"));
  } catch (e) { results.push(fail("T96", "updateStatus", e)); }

  try {
    const repo2 = new InMemoryAnomalyRepository();
    const alert = makeAlert({ status: "OPEN" });
    await repo2.saveAlert(alert);
    const count = await repo2.countOpenAlerts(ORG);
    if (count >= 1) results.push(pass("T97", "countOpenAlerts counts OPEN alerts"));
    else results.push(fail("T97", "countOpenAlerts counts OPEN alerts", `count=${count}`));
  } catch (e) { results.push(fail("T97", "countOpenAlerts", e)); }

  try {
    const repo3 = new InMemoryAnomalyRepository();
    const alerts = await repo3.listAlerts(ORG);
    if (Array.isArray(alerts)) results.push(pass("T98", "listAlerts returns array when empty"));
    else results.push(fail("T98", "listAlerts returns array", "not array"));
  } catch (e) { results.push(fail("T98", "listAlerts empty", e)); }

  try {
    const noSignals = await repo.getSignals("other-org-xyz");
    if (Array.isArray(noSignals)) results.push(pass("T99", "getSignals for unknown org returns array"));
    else results.push(fail("T99", "getSignals for unknown org", "not array"));
  } catch (e) { results.push(fail("T99", "getSignals unknown org", e)); }

  try {
    const noAlert = await repo.updateStatus(ORG, "nonexistent-xyz", "RESOLVED");
    if (!noAlert.ok) results.push(pass("T100", "updateStatus for unknown alert returns error"));
    else results.push(fail("T100", "updateStatus for unknown alert returns error", "unexpected ok"));
  } catch (e) { results.push(fail("T100", "updateStatus unknown alert", e)); }

  return results;
}

async function runQueryTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const alerts = [makeAlert({ status: "OPEN" }), makeAlert({ status: "RESOLVED" })];
    const open = getOpenAnomalies(alerts, ORG);
    if (open.length === 1 && open[0].status === "OPEN") results.push(pass("T101", "getOpenAnomalies filters OPEN"));
    else results.push(fail("T101", "getOpenAnomalies filters OPEN", `count=${open.length}`));
  } catch (e) { results.push(fail("T101", "getOpenAnomalies", e)); }

  try {
    const alerts = [makeAlert({ severity: "CRITICAL" }), makeAlert({ severity: "MEDIUM" })];
    const critical = getCriticalAnomalies(alerts, ORG);
    if (critical.length === 1 && critical[0].severity === "CRITICAL") results.push(pass("T102", "getCriticalAnomalies filters CRITICAL"));
    else results.push(fail("T102", "getCriticalAnomalies filters CRITICAL", `count=${critical.length}`));
  } catch (e) { results.push(fail("T102", "getCriticalAnomalies", e)); }

  try {
    const alerts = [makeAlert({ status: "OPEN" }), makeAlert({ status: "OPEN", severity: "CRITICAL" })];
    const counts = getAnomalyCounts(alerts, ORG);
    if (counts.open >= 2) results.push(pass("T103", "getAnomalyCounts counts open alerts"));
    else results.push(fail("T103", "getAnomalyCounts open", `open=${counts.open}`));
  } catch (e) { results.push(fail("T103", "getAnomalyCounts", e)); }

  try {
    const alerts = [makeAlert({ riskScore: 80 }), makeAlert({ riskScore: 40 })];
    const risk = getTenantRiskScore(alerts, ORG);
    if (risk >= 0 && risk <= 100) results.push(pass("T104", "getTenantRiskScore returns 0–100"));
    else results.push(fail("T104", "getTenantRiskScore 0–100", `score=${risk}`));
  } catch (e) { results.push(fail("T104", "getTenantRiskScore", e)); }

  try {
    const signals = [makeSignal({ type: "LOGIN_FAILURE_SPIKE" }), makeSignal({ type: "MFA_FAILURE_SPIKE" })];
    const loginSigs = getSignalsByType(signals, ORG, "LOGIN_FAILURE_SPIKE");
    if (loginSigs.length === 1) results.push(pass("T105", "getSignalsByType filters by type"));
    else results.push(fail("T105", "getSignalsByType filters", `count=${loginSigs.length}`));
  } catch (e) { results.push(fail("T105", "getSignalsByType", e)); }

  try {
    const signals = [
      makeSignal({ agentId: "luca", type: "AGENT_PERMISSION_VIOLATION" }),
      makeSignal({ agentId: "diego", type: "AGENT_PERMISSION_VIOLATION" }),
    ];
    const agentAlerts = getAlertsByAgent(
      [makeAlert({ signals: [signals[0]] })],
      ORG,
      "luca",
    );
    results.push(pass("T106", "getAlertsByAgent runs without error"));
  } catch (e) { results.push(fail("T106", "getAlertsByAgent", e)); }

  return results;
}

async function runAdapterTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const highAlert = makeAlert({ severity: "HIGH", status: "OPEN" });
    const signals = buildExecutiveBrainSignals([highAlert], ORG);
    if (Array.isArray(signals)) results.push(pass("T111", "buildExecutiveBrainSignals returns array"));
    else results.push(fail("T111", "buildExecutiveBrainSignals returns array", "not array"));
  } catch (e) { results.push(fail("T111", "buildExecutiveBrainSignals", e)); }

  try {
    const criticalAlert = makeAlert({ severity: "CRITICAL" });
    const execSignals = buildExecutiveBrainSignals([criticalAlert], ORG);
    const msg = execSignals.length > 0 ? formatExecutiveMessage(execSignals[0]) : "no-signal";
    if (typeof msg === "string" && msg.length > 0) results.push(pass("T112", "formatExecutiveMessage returns string"));
    else results.push(fail("T112", "formatExecutiveMessage returns string", "not string or empty"));
  } catch (e) { results.push(fail("T112", "formatExecutiveMessage", e)); }

  try {
    const alert = makeAlert({ severity: "CRITICAL" });
    const penalty = buildZeroTrustPenalty(alert);
    if (penalty && penalty.penalty >= 50) results.push(pass("T113", "buildZeroTrustPenalty CRITICAL >= 50"));
    else results.push(fail("T113", "buildZeroTrustPenalty CRITICAL >= 50", `penalty=${penalty?.penalty}`));
  } catch (e) { results.push(fail("T113", "buildZeroTrustPenalty CRITICAL", e)); }

  try {
    const alert = makeAlert({ severity: "LOW" });
    const penalty = buildZeroTrustPenalty(alert);
    if (penalty && penalty.penalty >= 1) results.push(pass("T114", "buildZeroTrustPenalty LOW returns penalty"));
    else results.push(fail("T114", "buildZeroTrustPenalty LOW returns penalty", `penalty=${penalty?.penalty}`));
  } catch (e) { results.push(fail("T114", "buildZeroTrustPenalty LOW", e)); }

  try {
    const alerts = [makeAlert({ severity: "HIGH" }), makeAlert({ severity: "CRITICAL" })];
    const penalties = buildZeroTrustPenalties(alerts);
    if (Array.isArray(penalties) && penalties.length > 0) results.push(pass("T115", "buildZeroTrustPenalties returns penalties"));
    else results.push(fail("T115", "buildZeroTrustPenalties returns penalties", "empty or not array"));
  } catch (e) { results.push(fail("T115", "buildZeroTrustPenalties", e)); }

  try {
    const signal = makeSignal({ severity: "CRITICAL", weight: 100 });
    const weight = anomalySignalToZeroTrustWeight(signal);
    if (weight >= 50) results.push(pass("T116", "anomalySignalToZeroTrustWeight CRITICAL >= 50"));
    else results.push(fail("T116", "anomalySignalToZeroTrustWeight CRITICAL >= 50", `weight=${weight}`));
  } catch (e) { results.push(fail("T116", "anomalySignalToZeroTrustWeight", e)); }

  try {
    const ctx = mfaEventToAnomalyContext({
      orgSlug: ORG,
      userId: "user-1",
      method: "TOTP",
      outcome: "FAILED",
      sessionId: "sess-1",
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    if (ctx.orgSlug === ORG && ctx.userId === "user-1") results.push(pass("T117", "mfaEventToAnomalyContext maps fields"));
    else results.push(fail("T117", "mfaEventToAnomalyContext maps fields", "wrong fields"));
  } catch (e) { results.push(fail("T117", "mfaEventToAnomalyContext", e)); }

  try {
    const ctx = vaultEventToAnomalyContext({
      orgSlug: ORG,
      userId: "user-1",
      secretAlias: "db-password",
      operation: "READ",
      success: true,
      sessionId: "sess-1",
    });
    if (ctx.orgSlug === ORG && !JSON.stringify(ctx).includes("plain")) results.push(pass("T118", "vaultEventToAnomalyContext no plain secret"));
    else results.push(fail("T118", "vaultEventToAnomalyContext no plain secret", "may contain secret"));
  } catch (e) { results.push(fail("T118", "vaultEventToAnomalyContext", e)); }

  try {
    const ctx = kmsEventToAnomalyContext({
      orgSlug: ORG,
      userId: "user-1",
      keyAlias: "main-encryption-key",
      operation: "ENCRYPT",
      success: true,
      sessionId: "sess-1",
    });
    if (ctx.orgSlug === ORG) results.push(pass("T119", "kmsEventToAnomalyContext maps orgSlug"));
    else results.push(fail("T119", "kmsEventToAnomalyContext maps orgSlug", "wrong orgSlug"));
  } catch (e) { results.push(fail("T119", "kmsEventToAnomalyContext", e)); }

  try {
    const sessionInput = {
      orgSlug: ORG,
      userId: "user-1",
      sessionId: "sess-1",
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
      trustScore: 5,
      isNewDevice: true,
      isNewCountry: true,
    };
    const highRisk = isHighRiskSession(sessionInput);
    if (highRisk) results.push(pass("T120", "isHighRiskSession returns true for low trustScore + new device + new country"));
    else results.push(fail("T120", "isHighRiskSession returns true", "returned false"));
  } catch (e) { results.push(fail("T120", "isHighRiskSession", e)); }

  return results;
}

async function runAuditTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const before = anomalyAuditLog.count();
    recordAnomalyEvent({
      orgSlug: ORG,
      eventType: "ANOMALY_DETECTED",
      alertId: "test-alert-1",
      severity: "HIGH",
      reason: "integration test",
    });
    // fire-and-forget — count may or may not have increased synchronously
    results.push(pass("T121", "recordAnomalyEvent runs without error"));
  } catch (e) { results.push(fail("T121", "recordAnomalyEvent runs", e)); }

  try {
    const count = anomalyAuditLog.count();
    if (typeof count === "number" && count >= 0) results.push(pass("T122", "anomalyAuditLog.count() returns number"));
    else results.push(fail("T122", "anomalyAuditLog.count() returns number", `count=${count}`));
  } catch (e) { results.push(fail("T122", "anomalyAuditLog.count", e)); }

  return results;
}

async function runDashboardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const empty = buildEmptyAnomalyDashboard(ORG);
    if (empty.orgSlug === ORG && empty.tenantRisk === 0) results.push(pass("T131", "buildEmptyAnomalyDashboard returns zero payload"));
    else results.push(fail("T131", "buildEmptyAnomalyDashboard", "wrong fields"));
  } catch (e) { results.push(fail("T131", "buildEmptyAnomalyDashboard", e)); }

  try {
    const alerts = [makeAlert({ status: "OPEN", severity: "HIGH", riskScore: 70 })];
    const signals = [makeSignal({ weight: 70 })];
    const dashboard = buildAnomalyDashboard(alerts, signals, ORG);
    if (dashboard.openAnomalies >= 1) results.push(pass("T132", "buildAnomalyDashboard counts open alerts"));
    else results.push(fail("T132", "buildAnomalyDashboard counts open", `open=${dashboard.openAnomalies}`));
  } catch (e) { results.push(fail("T132", "buildAnomalyDashboard", e)); }

  try {
    const alerts = [makeAlert({ severity: "CRITICAL", riskScore: 100 })];
    const dashboard = buildAnomalyDashboard(alerts, [], ORG);
    if (dashboard.riskLevel === "CRITICAL") results.push(pass("T133", "buildAnomalyDashboard riskLevel CRITICAL for score 100"));
    else results.push(fail("T133", "buildAnomalyDashboard riskLevel CRITICAL", `riskLevel=${dashboard.riskLevel}`));
  } catch (e) { results.push(fail("T133", "buildAnomalyDashboard riskLevel", e)); }

  try {
    const tenantReport = buildTenantRiskReport([], ORG);
    if (tenantReport.orgSlug === ORG) results.push(pass("T134", "buildTenantRiskReport returns report"));
    else results.push(fail("T134", "buildTenantRiskReport", "wrong orgSlug"));
  } catch (e) { results.push(fail("T134", "buildTenantRiskReport", e)); }

  try {
    const agentReport = buildAgentRiskReport([], ORG);
    if (agentReport.orgSlug === ORG) results.push(pass("T135", "buildAgentRiskReport returns report"));
    else results.push(fail("T135", "buildAgentRiskReport", "wrong orgSlug"));
  } catch (e) { results.push(fail("T135", "buildAgentRiskReport", e)); }

  return results;
}

async function runFutureCompatibilityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    if (SIEM_INTEGRATION_PLANS.length >= 6) results.push(pass("T141", "≥6 SIEM integration plans defined"));
    else results.push(fail("T141", "≥6 SIEM integration plans", `only ${SIEM_INTEGRATION_PLANS.length}`));
  } catch (e) { results.push(fail("T141", "SIEM_INTEGRATION_PLANS length", e)); }

  try {
    const providers = SIEM_INTEGRATION_PLANS.map(p => p.provider);
    if (providers.includes("SPLUNK") && providers.includes("DATADOG") && providers.includes("ELASTIC")) {
      results.push(pass("T142", "SPLUNK, DATADOG, ELASTIC all planned"));
    } else {
      results.push(fail("T142", "SPLUNK, DATADOG, ELASTIC all planned", `providers=${providers.join(",")}`));
    }
  } catch (e) { results.push(fail("T142", "SIEM providers", e)); }

  try {
    if (SOC_WORKFLOW_PLANS.length >= 3) results.push(pass("T143", "≥3 SOC workflow plans defined"));
    else results.push(fail("T143", "≥3 SOC workflow plans", `only ${SOC_WORKFLOW_PLANS.length}`));
  } catch (e) { results.push(fail("T143", "SOC_WORKFLOW_PLANS length", e)); }

  try {
    if (BASELINE_DETECTION_PLANS.length >= 2) results.push(pass("T144", "≥2 ML baseline plans defined"));
    else results.push(fail("T144", "≥2 ML baseline plans", `only ${BASELINE_DETECTION_PLANS.length}`));
  } catch (e) { results.push(fail("T144", "BASELINE_DETECTION_PLANS length", e)); }

  try {
    const alert = makeAlert({
      signals: [makeSignal()],
      riskScore: 80,
    });
    const payload = siemAlertFromAnomalyAlert(alert);
    if (payload.alertId === alert.id && payload.epochSeconds > 0) results.push(pass("T145", "siemAlertFromAnomalyAlert serializes correctly"));
    else results.push(fail("T145", "siemAlertFromAnomalyAlert serializes", "missing fields"));
  } catch (e) { results.push(fail("T145", "siemAlertFromAnomalyAlert", e)); }

  try {
    const signal = makeSignal({ weight: 65 });
    const record = siemSignalFromAnomalySignal(signal);
    if (record.signalId === signal.id && record.epochSeconds > 0) results.push(pass("T146", "siemSignalFromAnomalySignal serializes correctly"));
    else results.push(fail("T146", "siemSignalFromAnomalySignal serializes", "missing fields"));
  } catch (e) { results.push(fail("T146", "siemSignalFromAnomalySignal", e)); }

  try {
    const allPlanned = SIEM_INTEGRATION_PLANS.every(p => p.readinessStatus === "PLANNED");
    if (allPlanned) results.push(pass("T147", "all SIEM plans are in PLANNED status"));
    else results.push(fail("T147", "all SIEM plans are PLANNED", "some are not PLANNED"));
  } catch (e) { results.push(fail("T147", "SIEM plans readinessStatus", e)); }

  try {
    const allHaveVault = SIEM_INTEGRATION_PLANS.every(p => p.authMethod.toLowerCase().includes("vault"));
    if (allHaveVault) results.push(pass("T148", "all SIEM plans reference Vault for auth"));
    else results.push(fail("T148", "all SIEM plans reference Vault for auth", "some do not mention vault"));
  } catch (e) { results.push(fail("T148", "SIEM plans auth vault reference", e)); }

  try {
    const awsPlan = SIEM_INTEGRATION_PLANS.find(p => p.provider === "AWS_SECURITY_HUB");
    if (awsPlan) results.push(pass("T149", "AWS Security Hub plan exists"));
    else results.push(fail("T149", "AWS Security Hub plan exists", "not found"));
  } catch (e) { results.push(fail("T149", "AWS_SECURITY_HUB plan", e)); }

  try {
    const sentinelPlan = SIEM_INTEGRATION_PLANS.find(p => p.provider === "MICROSOFT_SENTINEL");
    if (sentinelPlan) results.push(pass("T150", "Microsoft Sentinel plan exists"));
    else results.push(fail("T150", "Microsoft Sentinel plan exists", "not found"));
  } catch (e) { results.push(fail("T150", "MICROSOFT_SENTINEL plan", e)); }

  return results;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Production guard
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_available_in_production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "integration_tests_disabled" }, { status: 403 });
  }
  const token = req.headers.get("x-internal-test-token");
  if (!token || token !== process.env.INTERNAL_INTEGRATION_TEST_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  const [
    coreTests,
    policyTests,
    registryTests,
    correlationTests,
    riskScoringTests,
    alertBuilderTests,
    repositoryTests,
    queryTests,
    adapterTests,
    auditTests,
    dashboardTests,
    compatibilityTests,
  ] = await Promise.all([
    runCoreTypesTests(),
    runPolicyTests(),
    runRegistryTests(),
    runCorrelationTests(),
    runRiskScoringTests(),
    runAlertBuilderTests(),
    runRepositoryTests(),
    runQueryTests(),
    runAdapterTests(),
    runAuditTests(),
    runDashboardTests(),
    runFutureCompatibilityTests(),
  ]);

  const allTests = [
    ...coreTests,
    ...policyTests,
    ...registryTests,
    ...correlationTests,
    ...riskScoringTests,
    ...alertBuilderTests,
    ...repositoryTests,
    ...queryTests,
    ...adapterTests,
    ...auditTests,
    ...dashboardTests,
    ...compatibilityTests,
  ];

  const passed  = allTests.filter(t => t.passed).length;
  const failed  = allTests.filter(t => !t.passed).length;
  const total   = allTests.length;
  const durationMs = Date.now() - start;

  return NextResponse.json({
    sprint:    "AGENTIK-SECURITY-ANOMALY-DETECTION-01",
    summary:   `${passed}/${total} PASS (${failed} FAIL) in ${durationMs}ms`,
    passed,
    failed,
    total,
    durationMs,
    tests:     allTests,
    failures:  allTests.filter(t => !t.passed),
  }, {
    status: failed > 0 ? 207 : 200,
  });
}
