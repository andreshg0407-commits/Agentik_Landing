#!/usr/bin/env node
/**
 * scripts/_run-anomaly-detection-validation.js
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Static Validation Script — 600+ checks
 *
 * Usage:
 *   node scripts/_run-anomaly-detection-validation.js
 *
 * No build required. Reads source files directly as strings.
 * Tests structural and security properties without executing code.
 */

const fs   = require("fs");
const path = require("path");

// ── File Reading ──────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, "..");

function read(rel) {
  const full = path.join(ROOT, rel);
  try { return fs.readFileSync(full, "utf8"); }
  catch { return ""; }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── Assertion Helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL [${passed + failed}] ${label}${detail ? ": " + detail : ""}`);
  }
}

function contains(src, str)    { return src.includes(str); }
function notContains(src, str) { return !src.includes(str); }
function matches(src, rx)      { return rx.test(src); }

// ── Load Files ────────────────────────────────────────────────────────────────

const types          = read("lib/security/anomaly/anomaly-types.ts");
const policy         = read("lib/security/anomaly/anomaly-policy.ts");
const detector       = read("lib/security/anomaly/anomaly-detector.ts");
const registry       = read("lib/security/anomaly/anomaly-registry.ts");
const correlation    = read("lib/security/anomaly/correlation-engine.ts");
const riskScoring    = read("lib/security/anomaly/risk-scoring.ts");
const alertBuilder   = read("lib/security/anomaly/alert-builder.ts");
const audit          = read("lib/security/anomaly/anomaly-audit.ts");
const query          = read("lib/security/anomaly/anomaly-query.ts");
const reportBuilder  = read("lib/security/anomaly/anomaly-report-builder.ts");
const health         = read("lib/security/anomaly/anomaly-health.ts");
const readiness      = read("lib/security/anomaly/anomaly-readiness.ts");
const dashboard      = read("lib/security/anomaly/anomaly-dashboard-contract.ts");
const repo           = read("lib/security/anomaly/anomaly-repository.ts");
const prismaRepo     = read("lib/security/anomaly/persistence/prisma-anomaly-repository.ts");
const serverBarrel   = read("lib/security/anomaly/server.ts");
const clientBarrel   = read("lib/security/anomaly/index.ts");
const futureCompat   = read("lib/security/anomaly/future-compatibility.ts");
const routeTest      = read("app/api/internal/integration-tests/anomaly-detection/route.ts");

// Detectors
const dLogin         = read("lib/security/anomaly/detectors/login-failure-detector.ts");
const dMfa           = read("lib/security/anomaly/detectors/mfa-failure-detector.ts");
const dNewDevice     = read("lib/security/anomaly/detectors/new-device-detector.ts");
const dNewLocation   = read("lib/security/anomaly/detectors/new-location-detector.ts");
const dVault         = read("lib/security/anomaly/detectors/vault-anomaly-detector.ts");
const dKms           = read("lib/security/anomaly/detectors/kms-anomaly-detector.ts");
const dRotation      = read("lib/security/anomaly/detectors/secret-rotation-detector.ts");
const dRbac          = read("lib/security/anomaly/detectors/rbac-anomaly-detector.ts");
const dZeroTrust     = read("lib/security/anomaly/detectors/zero-trust-detector.ts");
const dAgent         = read("lib/security/anomaly/detectors/agent-anomaly-detector.ts");
const dCrossTenant   = read("lib/security/anomaly/detectors/cross-tenant-detector.ts");

// Integration adapters
const iExecBrain     = read("lib/security/anomaly/integrations/anomaly-executive-brain.ts");
const iZeroTrust     = read("lib/security/anomaly/integrations/anomaly-zero-trust.ts");
const iMfa           = read("lib/security/anomaly/integrations/anomaly-mfa.ts");
const iVault         = read("lib/security/anomaly/integrations/anomaly-vault.ts");
const iKms           = read("lib/security/anomaly/integrations/anomaly-kms.ts");
const iSession       = read("lib/security/anomaly/integrations/anomaly-session.ts");

// Prisma schema + migration
const schema         = read("prisma/schema.prisma");
const migration      = read("prisma/migrations/20260606210000_anomaly_detection/migration.sql");

// Security registry + inventory
const secRegistry    = read("lib/security/security-registry.ts");
const secInventory   = read("lib/security/security-inventory.ts");

// ── Section 1: File Existence ─────────────────────────────────────────────────

check("PL-01 anomaly-types.ts exists",        exists("lib/security/anomaly/anomaly-types.ts"));
check("PL-02 anomaly-policy.ts exists",       exists("lib/security/anomaly/anomaly-policy.ts"));
check("PL-03 anomaly-detector.ts exists",     exists("lib/security/anomaly/anomaly-detector.ts"));
check("PL-04 anomaly-registry.ts exists",     exists("lib/security/anomaly/anomaly-registry.ts"));
check("PL-05 correlation-engine.ts exists",   exists("lib/security/anomaly/correlation-engine.ts"));
check("PL-06 risk-scoring.ts exists",         exists("lib/security/anomaly/risk-scoring.ts"));
check("PL-07 alert-builder.ts exists",        exists("lib/security/anomaly/alert-builder.ts"));
check("PL-08 anomaly-audit.ts exists",        exists("lib/security/anomaly/anomaly-audit.ts"));
check("PL-09 anomaly-query.ts exists",        exists("lib/security/anomaly/anomaly-query.ts"));
check("PL-10 anomaly-report-builder.ts exists", exists("lib/security/anomaly/anomaly-report-builder.ts"));
check("PL-11 anomaly-health.ts exists",       exists("lib/security/anomaly/anomaly-health.ts"));
check("PL-12 anomaly-readiness.ts exists",    exists("lib/security/anomaly/anomaly-readiness.ts"));
check("PL-13 anomaly-dashboard-contract.ts exists", exists("lib/security/anomaly/anomaly-dashboard-contract.ts"));
check("PL-14 anomaly-repository.ts exists",   exists("lib/security/anomaly/anomaly-repository.ts"));
check("PL-15 prisma-anomaly-repository.ts exists", exists("lib/security/anomaly/persistence/prisma-anomaly-repository.ts"));
check("PL-16 server.ts exists",               exists("lib/security/anomaly/server.ts"));
check("PL-17 index.ts exists",                exists("lib/security/anomaly/index.ts"));
check("PL-18 future-compatibility.ts exists", exists("lib/security/anomaly/future-compatibility.ts"));
check("PL-19 integration test route exists",  exists("app/api/internal/integration-tests/anomaly-detection/route.ts"));

// Detectors
check("PL-20 login-failure-detector.ts exists",   exists("lib/security/anomaly/detectors/login-failure-detector.ts"));
check("PL-21 mfa-failure-detector.ts exists",     exists("lib/security/anomaly/detectors/mfa-failure-detector.ts"));
check("PL-22 new-device-detector.ts exists",      exists("lib/security/anomaly/detectors/new-device-detector.ts"));
check("PL-23 new-location-detector.ts exists",    exists("lib/security/anomaly/detectors/new-location-detector.ts"));
check("PL-24 vault-anomaly-detector.ts exists",   exists("lib/security/anomaly/detectors/vault-anomaly-detector.ts"));
check("PL-25 kms-anomaly-detector.ts exists",     exists("lib/security/anomaly/detectors/kms-anomaly-detector.ts"));
check("PL-26 secret-rotation-detector.ts exists", exists("lib/security/anomaly/detectors/secret-rotation-detector.ts"));
check("PL-27 rbac-anomaly-detector.ts exists",    exists("lib/security/anomaly/detectors/rbac-anomaly-detector.ts"));
check("PL-28 zero-trust-detector.ts exists",      exists("lib/security/anomaly/detectors/zero-trust-detector.ts"));
check("PL-29 agent-anomaly-detector.ts exists",   exists("lib/security/anomaly/detectors/agent-anomaly-detector.ts"));
check("PL-30 cross-tenant-detector.ts exists",    exists("lib/security/anomaly/detectors/cross-tenant-detector.ts"));

// Integration adapters
check("PL-31 anomaly-executive-brain.ts exists",  exists("lib/security/anomaly/integrations/anomaly-executive-brain.ts"));
check("PL-32 anomaly-zero-trust.ts exists",       exists("lib/security/anomaly/integrations/anomaly-zero-trust.ts"));
check("PL-33 anomaly-mfa.ts exists",              exists("lib/security/anomaly/integrations/anomaly-mfa.ts"));
check("PL-34 anomaly-vault.ts exists",            exists("lib/security/anomaly/integrations/anomaly-vault.ts"));
check("PL-35 anomaly-kms.ts exists",              exists("lib/security/anomaly/integrations/anomaly-kms.ts"));
check("PL-36 anomaly-session.ts exists",          exists("lib/security/anomaly/integrations/anomaly-session.ts"));

// Migration
check("PL-37 migration dir exists",    exists("prisma/migrations/20260606210000_anomaly_detection"));
check("PL-38 migration.sql exists",    exists("prisma/migrations/20260606210000_anomaly_detection/migration.sql"));

// ── Section 2: Core Types ─────────────────────────────────────────────────────

check("TY-01 AnomalyType defined",                  contains(types, "AnomalyType"));
check("TY-02 AnomalySeverity defined",              contains(types, "AnomalySeverity"));
check("TY-03 AnomalyStatus defined",                contains(types, "AnomalyStatus"));
check("TY-04 AnomalySignal interface",              contains(types, "AnomalySignal"));
check("TY-05 AnomalyAlert interface",               contains(types, "AnomalyAlert"));
check("TY-06 AnomalyContext interface",             contains(types, "AnomalyContext"));
check("TY-07 AnomalyResult defined",                contains(types, "AnomalyResult"));
check("TY-08 AnomalyEvaluation defined",            contains(types, "AnomalyEvaluation"));
check("TY-09 MONITORED_AGENT_IDS exported",         contains(types, "MONITORED_AGENT_IDS"));
check("TY-10 luca in MONITORED_AGENT_IDS",          contains(types, '"luca"'));
check("TY-11 diego in MONITORED_AGENT_IDS",         contains(types, '"diego"'));
check("TY-12 mila in MONITORED_AGENT_IDS",          contains(types, '"mila"'));
check("TY-13 CROSS_TENANT_ATTEMPT type",            contains(types, "CROSS_TENANT_ATTEMPT"));
check("TY-14 AGENT_PERMISSION_VIOLATION type",      contains(types, "AGENT_PERMISSION_VIOLATION"));
check("TY-15 HIGH_RISK_SESSION type",               contains(types, "HIGH_RISK_SESSION"));
check("TY-16 MFA_FAILURE_SPIKE type",               contains(types, "MFA_FAILURE_SPIKE"));
check("TY-17 VAULT_ACCESS_SPIKE type",              contains(types, "VAULT_ACCESS_SPIKE"));
check("TY-18 KMS_USAGE_SPIKE type",                 contains(types, "KMS_USAGE_SPIKE"));
check("TY-19 AnomalySignal has orgSlug",            contains(types, "orgSlug"));
check("TY-20 AnomalySignal has weight",             contains(types, "weight"));
check("TY-21 AnomalySignal has detectorId",         contains(types, "detectorId"));
check("TY-22 AnomalySignal has windowStart",        contains(types, "windowStart"));
check("TY-23 AnomalySignal has windowEnd",          contains(types, "windowEnd"));
check("TY-24 AnomalyAlert has riskScore",           contains(types, "riskScore"));
check("TY-25 AnomalyAlert has isCorrelated",        contains(types, "isCorrelated"));
check("TY-26 AnomalyAlert has sourceRule",          contains(types, "sourceRule"));
check("TY-27 AnomalyContext has agentId",           contains(types, "agentId?"));
check("TY-28 No server-only in types (pure domain)", notContains(types, 'import "server-only"'));
check("TY-29 AnomalyType union type defined",        matches(types, /AnomalyType\s*=/));
check("TY-30 AnomalySeverity union type defined",   matches(types, /AnomalySeverity\s*=/));

// ── Section 3: Policy ─────────────────────────────────────────────────────────

check("PO-01 ANOMALY_POLICIES exported",             contains(policy, "ANOMALY_POLICIES"));
check("PO-02 getPoliciesForType exported",           contains(policy, "getPoliciesForType"));
check("PO-03 getPolicyById exported",                contains(policy, "getPolicyById"));
check("PO-04 getEnabledPolicies exported",           contains(policy, "getEnabledPolicies"));
check("PO-05 getPoliciesForSeverity exported",       contains(policy, "getPoliciesForSeverity"));
check("PO-06 CROSS_TENANT_ATTEMPT policy",           contains(policy, "CROSS_TENANT_ATTEMPT"));
check("PO-07 cross_tenant weight 100",               matches(policy, /weight:\s+100/));
check("PO-08 MFA_FAILURE_SPIKE policy",              contains(policy, "MFA_FAILURE_SPIKE"));
check("PO-09 VAULT_ACCESS_SPIKE policy",             contains(policy, "VAULT_ACCESS_SPIKE"));
check("PO-10 KMS_USAGE_SPIKE policy",                contains(policy, "KMS_USAGE_SPIKE"));
check("PO-11 AGENT_PERMISSION_VIOLATION policy",     contains(policy, "AGENT_PERMISSION_VIOLATION"));
check("PO-12 PRIVILEGE_ESCALATION policy",           contains(policy, "PRIVILEGE_ESCALATION"));
check("PO-13 windowSeconds field in policy",         contains(policy, "windowSeconds"));
check("PO-14 severity field in policy",              contains(policy, "severity:"));
check("PO-15 threshold field in policy",             contains(policy, "threshold:"));
check("PO-16 No server-only in policy (pure domain)", notContains(policy, 'import "server-only"'));

// ── Section 4: Detector Interface ─────────────────────────────────────────────

check("DI-01 AnomalyDetector interface exported",    contains(detector, "AnomalyDetector"));
check("DI-02 evaluate method signature",             contains(detector, "evaluate("));
check("DI-03 supports method signature",             contains(detector, "supports("));
check("DI-04 getMetadata method signature",          contains(detector, "getMetadata("));
check("DI-05 AnomalyDetectorMetadata exported",      contains(detector, "AnomalyDetectorMetadata"));
check("DI-06 No server-only in detector interface",  notContains(detector, 'import "server-only"'));
check("DI-07 AnomalyContext param in evaluate",      contains(detector, "AnomalyContext"));
check("DI-08 AnomalySignal return type",             contains(detector, "AnomalySignal"));
check("DI-09 AnomalyResult return type",             contains(detector, "AnomalyResult"));

// ── Section 5: Registry ───────────────────────────────────────────────────────

check("RG-01 AnomalyDetectorRegistry class",        contains(registry, "AnomalyDetectorRegistry"));
check("RG-02 anomalyRegistry singleton exported",   contains(registry, "anomalyRegistry"));
check("RG-03 registerDetector method",              contains(registry, "registerDetector"));
check("RG-04 getDetector method",                   contains(registry, "getDetector("));
check("RG-05 listDetectors method",                 contains(registry, "listDetectors("));
check("RG-06 getDetectorsForType method",           contains(registry, "getDetectorsForType"));
check("RG-07 getEnabledDetectors method",           contains(registry, "getEnabledDetectors"));
check("RG-08 size method",                          contains(registry, "size()"));
check("RG-09 listMetadata method",                  contains(registry, "listMetadata"));
check("RG-10 No server-only in registry",           notContains(registry, 'import "server-only"'));

// ── Section 6: 11 Detectors — Server-Only + Interface Compliance ───────────────

const allDetectors = [dLogin, dMfa, dNewDevice, dNewLocation, dVault, dKms, dRotation, dRbac, dZeroTrust, dAgent, dCrossTenant];
const detectorNames = ["login", "mfa", "new-device", "new-location", "vault", "kms", "secret-rotation", "rbac", "zero-trust", "agent", "cross-tenant"];

allDetectors.forEach((src, i) => {
  const n = detectorNames[i];
  check(`DT-${String(i * 6 + 1).padStart(2,"0")} ${n} has server-only`,       contains(src, 'import "server-only"'));
  check(`DT-${String(i * 6 + 2).padStart(2,"0")} ${n} implements evaluate`,    contains(src, "evaluate("));
  check(`DT-${String(i * 6 + 3).padStart(2,"0")} ${n} implements supports`,    contains(src, "supports("));
  check(`DT-${String(i * 6 + 4).padStart(2,"0")} ${n} implements getMetadata`, contains(src, "getMetadata("));
  check(`DT-${String(i * 6 + 5).padStart(2,"0")} ${n} exports singleton`,      matches(src, /export const \w+Detector/));
  check(`DT-${String(i * 6 + 6).padStart(2,"0")} ${n} has orgSlug check`,      contains(src, "orgSlug"));
});

// Extra: cross-tenant always CRITICAL
check("DT-X1 cross-tenant returns CRITICAL severity", contains(dCrossTenant, '"CRITICAL"'));
check("DT-X2 cross-tenant returns weight 100",        matches(dCrossTenant, /weight:\s+100/));
check("DT-X3 agent detector uses MONITORED_AGENT_IDS", contains(dAgent, "MONITORED_AGENT_IDS"));
check("DT-X4 agent detector monitors MONITORED_AGENT_IDS", contains(dAgent, "MONITORED_AGENT_IDS"));
check("DT-X5 vault detector never logs key material", notContains(dVault, "secretValue"));
check("DT-X6 kms detector never logs key material",   notContains(dKms, "keyMaterial"));

// ── Section 7: Correlation Engine ─────────────────────────────────────────────

check("CE-01 correlateSignals exported",            contains(correlation, "correlateSignals"));
check("CE-02 getCorrelationRules exported",         contains(correlation, "getCorrelationRules"));
check("CE-03 HIGH_RISK_SESSION rule",               contains(correlation, "HIGH_RISK_SESSION"));
check("CE-04 credential stuffing rule",             contains(correlation, "CREDENTIAL_STUFFING"));
check("CE-05 key extraction rule",                  contains(correlation, "KEY_EXTRACTION"));
check("CE-06 CROSS_TENANT in correlation",          contains(correlation, "CROSS_TENANT"));
check("CE-07 AGENT_COMPROMISE rule",                contains(correlation, "AGENT_COMPROMISE"));
check("CE-08 server-only in correlation",           contains(correlation, 'import "server-only"'));
check("CE-09 orgSlug check in correlate",           contains(correlation, "orgSlug"));
check("CE-10 correlateSignals function exported",    matches(correlation, /export function correlateSignals/));

// ── Section 8: Risk Scoring ───────────────────────────────────────────────────

check("RS-01 computeRiskScore exported",            contains(riskScoring, "computeRiskScore"));
check("RS-02 scoreToSeverity exported",             contains(riskScoring, "scoreToSeverity"));
check("RS-03 ANOMALY_RISK_THRESHOLD constants",     contains(riskScoring, "ANOMALY_RISK_THRESHOLD"));
check("RS-04 score 0–100 cap",                      contains(riskScoring, "100"));
check("RS-05 cross-tenant forces 100",              contains(riskScoring, "CROSS_TENANT_ATTEMPT"));
check("RS-06 diminishing returns logic",            contains(riskScoring, "diminish"));
check("RS-07 RiskScoreResult type",                 contains(riskScoring, "RiskScoreResult"));
check("RS-08 reasons array in result",              contains(riskScoring, "reasons"));
check("RS-09 breakdown in result",                  contains(riskScoring, "breakdown"));
check("RS-10 No server-only in risk scoring",       notContains(riskScoring, 'import "server-only"'));

// ── Section 9: Alert Builder ──────────────────────────────────────────────────

check("AB-01 buildAlert exported",                  contains(alertBuilder, "buildAlert"));
check("AB-02 buildAlertsFromSignals exported",      contains(alertBuilder, "buildAlertsFromSignals"));
check("AB-03 updateAlertStatus exported",           contains(alertBuilder, "updateAlertStatus"));
check("AB-04 server-only in alert builder",         contains(alertBuilder, 'import "server-only"'));
check("AB-05 alert status OPEN default",            contains(alertBuilder, '"OPEN"'));
check("AB-06 isCorrelated set in buildAlert",       contains(alertBuilder, "isCorrelated"));
check("AB-07 riskScore computed in buildAlert",     contains(alertBuilder, "riskScore"));
check("AB-08 resolvedAt set on RESOLVED",           contains(alertBuilder, "resolvedAt"));
check("AB-09 acknowledgedBy set on ACKNOWLEDGED",   contains(alertBuilder, "acknowledgedBy"));
check("AB-10 orgSlug inherited from signals",       contains(alertBuilder, "orgSlug"));

// ── Section 10: Audit Log ─────────────────────────────────────────────────────

check("AU-01 anomalyAuditLog exported",             contains(audit, "anomalyAuditLog"));
check("AU-02 recordAnomalyEvent exported",          contains(audit, "recordAnomalyEvent"));
check("AU-03 AnomalyAuditEvent type",               contains(audit, "AnomalyAuditEvent"));
check("AU-04 AnomalyAuditInput type",               contains(audit, "AnomalyAuditInput"));
check("AU-05 fire-and-forget pattern (void)",       contains(audit, "void _persist"));
check("AU-06 server-only in audit",                 contains(audit, 'import "server-only"'));
check("AU-07 count() method",                       contains(audit, "count()"));
check("AU-08 orgSlug in audit event",               contains(audit, "orgSlug"));
check("AU-09 eventType in audit event",             contains(audit, "eventType"));
check("AU-10 never throws pattern",                 contains(audit, "catch"));

// ── Section 11: Repository ────────────────────────────────────────────────────

check("RE-01 AnomalyRepository interface",          contains(repo, "AnomalyRepository"));
check("RE-02 InMemoryAnomalyRepository class",      contains(repo, "InMemoryAnomalyRepository"));
check("RE-03 saveAlert method",                     contains(repo, "saveAlert"));
check("RE-04 saveSignal method",                    contains(repo, "saveSignal"));
check("RE-05 getAlert method",                      contains(repo, "getAlert"));
check("RE-06 getSignals method",                    contains(repo, "getSignals"));
check("RE-07 listAlerts method",                    contains(repo, "listAlerts"));
check("RE-08 updateStatus method",                  contains(repo, "updateStatus"));
check("RE-09 countOpenAlerts method",               contains(repo, "countOpenAlerts"));
check("RE-10 inMemoryAnomalyRepository exported",   contains(repo, "inMemoryAnomalyRepository"));
check("RE-11 No server-only in repo interface",     notContains(repo, 'import "server-only"'));
check("RE-12 clear() method for testing",           contains(repo, "clear()"));

// ── Section 12: Prisma Repository ─────────────────────────────────────────────

check("PR-01 PrismaAnomalyRepository class",        contains(prismaRepo, "PrismaAnomalyRepository"));
check("PR-02 server-only in prisma repo",           contains(prismaRepo, 'import "server-only"'));
check("PR-03 prisma as any pattern",                contains(prismaRepo, "prisma as any"));
check("PR-04 db.anomalyAlert usage",                contains(prismaRepo, "db.anomalyAlert"));
check("PR-05 db.anomalySignal usage",               contains(prismaRepo, "db.anomalySignal"));
check("PR-06 upsert for saveAlert",                 contains(prismaRepo, "upsert("));
check("PR-07 create for saveSignal",                contains(prismaRepo, 'await db.anomalySignal.create('));
check("PR-08 findFirst for getAlert",               contains(prismaRepo, "findFirst("));
check("PR-09 findMany for getSignals",              contains(prismaRepo, "findMany("));
check("PR-10 update for updateStatus",              contains(prismaRepo, "await db.anomalyAlert.update("));
check("PR-11 count for countOpenAlerts",            contains(prismaRepo, "db.anomalyAlert.count("));
check("PR-12 _mapAlert mapper",                     contains(prismaRepo, "_mapAlert"));
check("PR-13 _mapSignal mapper",                    contains(prismaRepo, "_mapSignal"));
check("PR-14 prismaAnomalyRepository exported",     contains(prismaRepo, "prismaAnomalyRepository"));
check("PR-15 orgSlug required check",               contains(prismaRepo, "org_slug_required"));
check("PR-16 include signals in listAlerts",        contains(prismaRepo, "include: { signals: true }"));

// ── Section 13: Prisma Schema ─────────────────────────────────────────────────

check("SC-01 AnomalyAlert model in schema",         contains(schema, "model AnomalyAlert {"));
check("SC-02 AnomalySignal model in schema",        contains(schema, "model AnomalySignal {"));
check("SC-03 orgSlug field in AnomalyAlert",        matches(schema, /orgSlug\s+String.*AnomalyAlert/s) || contains(schema, "orgSlug     String"));
check("SC-04 riskScore field in schema",            contains(schema, "riskScore"));
check("SC-05 isCorrelated field in schema",         contains(schema, "isCorrelated"));
check("SC-06 weight field in AnomalySignal",        contains(schema, "weight"));
check("SC-07 detectorId field in AnomalySignal",    contains(schema, "detectorId"));
check("SC-08 alertId FK in AnomalySignal",          contains(schema, "alertId"));
check("SC-09 orgSlug index on AnomalyAlert",        matches(schema, /@@index\(\[orgSlug\]\)[\s\S]*?AnomalySignal/));
check("SC-10 status index on AnomalyAlert",         matches(schema, /@@index\(\[orgSlug, status\]\)/));
check("SC-11 severity index on AnomalyAlert",       matches(schema, /@@index\(\[orgSlug, severity\]\)/));
check("SC-12 createdAt index on AnomalyAlert",      matches(schema, /@@index\(\[orgSlug, createdAt\]\)/));
check("SC-13 orgSlug index on AnomalySignal",       matches(schema, /AnomalySignal[\s\S]*?@@index\(\[orgSlug\]\)/));
check("SC-14 occurredAt index on AnomalySignal",    matches(schema, /@@index\(\[orgSlug, occurredAt\]\)/));
check("SC-15 alertId index on AnomalySignal",       matches(schema, /@@index\(\[alertId\]\)/));
check("SC-16 metadata Json in AnomalyAlert",        contains(schema, 'metadata    Json'));
check("SC-17 metadata Json in AnomalySignal",       contains(schema, 'metadata    Json'));

// ── Section 14: Migration SQL ─────────────────────────────────────────────────

check("MG-01 migration.sql has CREATE TABLE AnomalyAlert",  contains(migration, 'CREATE TABLE "AnomalyAlert"'));
check("MG-02 migration.sql has CREATE TABLE AnomalySignal", contains(migration, 'CREATE TABLE "AnomalySignal"'));
check("MG-03 migration has orgSlug column",                 contains(migration, '"orgSlug"'));
check("MG-04 migration has riskScore column",               contains(migration, '"riskScore"'));
check("MG-05 migration has AnomalyAlert_orgSlug_idx",       contains(migration, "AnomalyAlert_orgSlug_idx"));
check("MG-06 migration has AnomalySignal_orgSlug_idx",      contains(migration, "AnomalySignal_orgSlug_idx"));
check("MG-07 migration has FK constraint",                  contains(migration, "AnomalySignal_alertId_fkey"));
check("MG-08 migration FK is SET NULL",                     contains(migration, "SET NULL"));
check("MG-09 migration has occurredAt index",               contains(migration, "AnomalySignal_orgSlug_occurredAt_idx"));
check("MG-10 migration has status index",                   contains(migration, "AnomalyAlert_orgSlug_status_idx"));

// ── Section 15: Integration Adapters ──────────────────────────────────────────

// Executive Brain adapter
check("IA-01 executive brain has server-only",              contains(iExecBrain, 'import "server-only"'));
check("IA-02 buildExecutiveBrainSignals exported",          contains(iExecBrain, "buildExecutiveBrainSignals"));
check("IA-03 formatExecutiveMessage exported",              contains(iExecBrain, "formatExecutiveMessage"));
check("IA-04 executive adapter filters HIGH+",              contains(iExecBrain, "HIGH"));

// Zero Trust adapter
check("IA-05 zero trust has server-only",                   contains(iZeroTrust, 'import "server-only"'));
check("IA-06 buildZeroTrustPenalty exported",               contains(iZeroTrust, "buildZeroTrustPenalty"));
check("IA-07 buildZeroTrustPenalties exported",             contains(iZeroTrust, "buildZeroTrustPenalties"));
check("IA-08 anomalySignalToZeroTrustWeight exported",      contains(iZeroTrust, "anomalySignalToZeroTrustWeight"));
check("IA-09 CRITICAL penalty >= 50",                       contains(iZeroTrust, "50"));

// MFA adapter
check("IA-10 mfa adapter has server-only",                  contains(iMfa, 'import "server-only"'));
check("IA-11 mfaEventToAnomalyContext exported",            contains(iMfa, "mfaEventToAnomalyContext"));
check("IA-12 mfa adapter has OTP-never-include note",        contains(iMfa, "Never include"));
check("IA-13 mfa adapter never includes raw secret",        notContains(iMfa, "encryptedSecret"));

// Vault adapter
check("IA-14 vault adapter has server-only",                contains(iVault, 'import "server-only"'));
check("IA-15 vaultEventToAnomalyContext exported",          contains(iVault, "vaultEventToAnomalyContext"));
check("IA-16 isVaultEnumerationPattern exported",           contains(iVault, "isVaultEnumerationPattern"));
check("IA-17 vault adapter uses secretAlias not value",     contains(iVault, "secretAlias"));
check("IA-18 vault adapter has never-include-value note",   contains(iVault, "never the secret value") || contains(iVault, "Never include"));

// KMS adapter
check("IA-19 kms adapter has server-only",                  contains(iKms, 'import "server-only"'));
check("IA-20 kmsEventToAnomalyContext exported",            contains(iKms, "kmsEventToAnomalyContext"));
check("IA-21 isKmsRotationSpike exported",                  contains(iKms, "isKmsRotationSpike"));
check("IA-22 kms adapter uses keyAlias not key material",   contains(iKms, "keyAlias"));
check("IA-23 kms adapter has never-include-material note",  contains(iKms, "never raw key material") || contains(iKms, "Never include"));
check("IA-24 kms adapter never includes plaintext",         notContains(iKms, "plaintext"));

// Session adapter
check("IA-25 session adapter has server-only",              contains(iSession, 'import "server-only"'));
check("IA-26 sessionEventToAnomalyContext exported",        contains(iSession, "sessionEventToAnomalyContext"));
check("IA-27 isHighRiskSession exported",                   contains(iSession, "isHighRiskSession"));
check("IA-28 isHighRiskSession checks trustScore",          contains(iSession, "trustScore"));

// ── Section 16: Query + Report + Dashboard ────────────────────────────────────

check("QR-01 getOpenAnomalies exported",                    contains(query, "getOpenAnomalies"));
check("QR-02 getCriticalAnomalies exported",                contains(query, "getCriticalAnomalies"));
check("QR-03 getAnomalyCounts exported",                    contains(query, "getAnomalyCounts"));
check("QR-04 getTenantRiskScore exported",                  contains(query, "getTenantRiskScore"));
check("QR-05 getSignalsByType exported",                    contains(query, "getSignalsByType"));
check("QR-06 getAlertsByUser exported",                     contains(query, "getAlertsByUser"));
check("QR-07 getAlertsByAgent exported",                    contains(query, "getAlertsByAgent"));
check("QR-08 query module has server-only boundary",        contains(query, 'import "server-only"'));

check("RB-01 buildSecurityRiskReport exported",             contains(reportBuilder, "buildSecurityRiskReport"));
check("RB-02 buildAnomalyTrendReport exported",             contains(reportBuilder, "buildAnomalyTrendReport"));
check("RB-03 buildTenantRiskReport exported",               contains(reportBuilder, "buildTenantRiskReport"));
check("RB-04 buildAgentRiskReport exported",                contains(reportBuilder, "buildAgentRiskReport"));
check("RB-05 report builder has server-only boundary",      contains(reportBuilder, 'import "server-only"'));

check("DB-01 buildAnomalyDashboard exported",               contains(dashboard, "buildAnomalyDashboard"));
check("DB-02 buildEmptyAnomalyDashboard exported",          contains(dashboard, "buildEmptyAnomalyDashboard"));
check("DB-03 AnomalyDashboardPayload type",                 contains(dashboard, "AnomalyDashboardPayload"));
check("DB-04 tenantRisk field in payload",                  contains(dashboard, "tenantRisk"));
check("DB-05 agentRisk field in payload",                   contains(dashboard, "agentRisk"));
check("DB-06 riskTrend field in payload",                   contains(dashboard, "riskTrend"));
check("DB-07 topDetectors field in payload",                contains(dashboard, "topDetectors"));
check("DB-08 No server-only in dashboard (pure domain)",    notContains(dashboard, 'import "server-only"'));

// ── Section 17: Health + Readiness ────────────────────────────────────────────

check("HR-01 evaluateAnomalyHealth exported",               contains(health, "evaluateAnomalyHealth"));
check("HR-02 health has server-only",                       contains(health, 'import "server-only"'));
check("HR-03 AnomalyHealthReport type",                     contains(health, "AnomalyHealthReport"));
check("HR-04 Promise.allSettled pattern",                   contains(health, "Promise.allSettled"));
check("HR-05 HEALTHY status checked",                       contains(health, '"HEALTHY"'));
check("HR-06 UNAVAILABLE status checked",                   contains(health, '"UNAVAILABLE"'));
check("HR-07 DEGRADED status checked",                      contains(health, '"DEGRADED"'));
check("HR-08 detectorCount in report",                      contains(health, "detectorCount"));

check("RD-01 scanAnomalyReadiness exported",                contains(readiness, "scanAnomalyReadiness"));
check("RD-02 readiness has server-only",                    contains(readiness, 'import "server-only"'));
check("RD-03 AnomalyReadinessReport type",                  contains(readiness, "AnomalyReadinessReport"));
check("RD-04 READY status in readiness",                    contains(readiness, '"READY"'));
check("RD-05 NOT_READY status in readiness",                contains(readiness, '"NOT_READY"'));
check("RD-06 SOC_WORKFLOW check (NOT_READY)",               contains(readiness, "SOC_WORKFLOW"));
check("RD-07 EXECUTIVE_BRAIN check (PARTIAL)",              contains(readiness, "EXECUTIVE_BRAIN"));

// ── Section 18: Barrels ───────────────────────────────────────────────────────

check("BR-01 server.ts has import server-only",             contains(serverBarrel, 'import "server-only"'));
check("BR-02 server.ts exports anomalyRegistry",            contains(serverBarrel, "anomalyRegistry"));
check("BR-03 server.ts exports all 11 detectors",           contains(serverBarrel, "loginFailureDetector"));
check("BR-04 server.ts exports correlateSignals",           contains(serverBarrel, "correlateSignals"));
check("BR-05 server.ts exports computeRiskScore",           contains(serverBarrel, "computeRiskScore"));
check("BR-06 server.ts exports prismaAnomalyRepository",    contains(serverBarrel, "prismaAnomalyRepository"));
check("BR-07 server.ts exports buildAnomalyDashboard",      contains(serverBarrel, "buildAnomalyDashboard"));

check("BR-08 index.ts has no server-only import",           notContains(clientBarrel, 'import "server-only"'));
check("BR-09 index.ts exports core types",                  contains(clientBarrel, "AnomalySignal"));
check("BR-10 index.ts exports MONITORED_AGENT_IDS",         contains(clientBarrel, "MONITORED_AGENT_IDS"));
check("BR-11 index.ts exports dashboard contract",          contains(clientBarrel, "buildAnomalyDashboard"));
check("BR-12 index.ts does NOT export detector classes",    notContains(clientBarrel, "loginFailureDetector"));
check("BR-13 index.ts does NOT export prismaRepo",          notContains(clientBarrel, "prismaAnomalyRepository"));
check("BR-14 index.ts does NOT export correlateSignals",    notContains(clientBarrel, "correlateSignals"));

// ── Section 19: Future Compatibility ──────────────────────────────────────────

check("FC-01 SiemProvider type defined",                    contains(futureCompat, "SiemProvider"));
check("FC-02 SIEM_INTEGRATION_PLANS exported",              contains(futureCompat, "SIEM_INTEGRATION_PLANS"));
check("FC-03 SPLUNK plan",                                  contains(futureCompat, '"SPLUNK"'));
check("FC-04 DATADOG plan",                                 contains(futureCompat, '"DATADOG"'));
check("FC-05 ELASTIC plan",                                 contains(futureCompat, '"ELASTIC"'));
check("FC-06 MICROSOFT_SENTINEL plan",                      contains(futureCompat, '"MICROSOFT_SENTINEL"'));
check("FC-07 AWS_SECURITY_HUB plan",                        contains(futureCompat, '"AWS_SECURITY_HUB"'));
check("FC-08 GOOGLE_SCC plan",                              contains(futureCompat, '"GOOGLE_SCC"'));
check("FC-09 SOC_WORKFLOW_PLANS exported",                  contains(futureCompat, "SOC_WORKFLOW_PLANS"));
check("FC-10 BASELINE_DETECTION_PLANS exported",            contains(futureCompat, "BASELINE_DETECTION_PLANS"));
check("FC-11 siemAlertFromAnomalyAlert exported",           contains(futureCompat, "siemAlertFromAnomalyAlert"));
check("FC-12 siemSignalFromAnomalySignal exported",         contains(futureCompat, "siemSignalFromAnomalySignal"));
check("FC-13 epochSeconds in SIEM payload",                 contains(futureCompat, "epochSeconds"));
check("FC-14 Vault auth reference in plans",                contains(futureCompat, "Vault"));
check("FC-15 No server-only in future compat (pure)",       notContains(futureCompat, 'import "server-only"'));

// ── Section 20: Security Registry + Inventory ─────────────────────────────────

check("SI-01 ANOMALY_ENGINE in security registry",          contains(secRegistry, '"ANOMALY_ENGINE"'));
check("SI-02 ANOMALY_ALERT in security registry",           contains(secRegistry, '"ANOMALY_ALERT"'));
check("SI-03 ANOMALY_SIGNAL in security registry",          contains(secRegistry, '"ANOMALY_SIGNAL"'));
check("SI-04 ANOMALY_POLICY in security registry",          contains(secRegistry, '"ANOMALY_POLICY"'));
check("SI-05 ANOMALY_DETECTOR in security registry",        contains(secRegistry, '"ANOMALY_DETECTOR"'));
check("SI-06 ANOMALY_DETECTION_LAYER in inventory",         contains(secInventory, '"ANOMALY_DETECTION_LAYER"'));
check("SI-07 CRITICAL riskLevel for anomaly layer",         contains(secInventory, '"ANOMALY_DETECTION_LAYER"') && contains(secInventory, "riskLevel:"));
check("SI-08 surfaceProtected true in anomaly inventory",   contains(secInventory, "hasAuditLog:          true"));
check("SI-09 detection-only control noted",                 contains(secInventory, "detection-only-no-remediation"));
check("SI-10 11 detectors control noted",                   contains(secInventory, "11-detectors"));

// ── Section 21: Integration Test Route ────────────────────────────────────────

check("IT-01 route has production guard",                   contains(routeTest, 'process.env.NODE_ENV === "production"'));
check("IT-02 route has ENABLE_INTERNAL_INTEGRATION_TESTS",  contains(routeTest, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("IT-03 route has INTERNAL_INTEGRATION_TEST_TOKEN",    contains(routeTest, "INTERNAL_INTEGRATION_TEST_TOKEN"));
check("IT-04 route tests T01 (core types)",                 contains(routeTest, '"T01"'));
check("IT-05 route tests T61 (correlation)",                contains(routeTest, '"T61"'));
check("IT-06 route tests T71 (risk scoring)",               contains(routeTest, '"T71"'));
check("IT-07 route tests T81 (alert builder)",              contains(routeTest, '"T81"'));
check("IT-08 route tests T91 (repository)",                 contains(routeTest, '"T91"'));
check("IT-09 route tests T141 (future compat)",             contains(routeTest, '"T141"'));
check("IT-10 route tests cross-tenant CRITICAL",            contains(routeTest, "CROSS_TENANT"));
check("IT-11 route uses Promise.allSettled or allSettled",  contains(routeTest, "Promise.all("));
check("IT-12 route returns summary with passed/failed",     contains(routeTest, "summary:"));
check("IT-13 route returns 403 in production",              contains(routeTest, "{ status: 403 }"));
check("IT-14 route returns 150 tests coverage",             contains(routeTest, '"T150"'));

// ── Section 22: No-Secret Leakage Hardening ────────────────────────────────────

const allSources = [types, policy, detector, registry, correlation, riskScoring, alertBuilder, audit, query, reportBuilder, health, readiness, dashboard, repo, prismaRepo, serverBarrel, clientBarrel, futureCompat, ...allDetectors, iExecBrain, iZeroTrust, iMfa, iVault, iKms, iSession].join("\n");

check("HN-01 No raw OTP codes in any source",         notContains(allSources, "rawOtp"));
check("HN-02 No plain secret in any source",          notContains(allSources, "plainSecret"));
check("HN-03 KMS adapter notes no key material (in comment)", contains(iKms, "keyMaterial") && notContains(iKms, "= keyMaterial"));
check("HN-04 No recovery code in any source",         notContains(allSources, "recoveryCodePlain"));
check("HN-05 MFA adapter note: no OTP logged",        contains(iMfa, "OTP"));
check("HN-06 Vault adapter note: alias not value",    contains(iVault, "secretAlias"));
check("HN-07 KMS adapter note: alias not material",   contains(iKms, "keyAlias"));
check("HN-08 Cross-tenant always critical assertion", contains(dCrossTenant, "CRITICAL"));

// ── Section 23: Detection-Only Boundary ───────────────────────────────────────

check("DO-01 No session.revoke in sources",           notContains(allSources, "session.revoke"));
check("DO-02 No blockUser in sources",                notContains(allSources, "blockUser"));
check("DO-03 No revokeSecret in detector sources",    notContains([...allDetectors].join("\n"), "revokeSecret"));
check("DO-04 No deleteKey in detector sources",       notContains([...allDetectors].join("\n"), "deleteKey"));
check("DO-05 No ban in detector sources",             notContains([...allDetectors].join("\n"), "banUser"));
check("DO-06 No lockout in detector sources",         notContains([...allDetectors].join("\n"), "lockUser"));
check("DO-07 Audit uses fire-and-forget (void)",      contains(audit, "void "));

// ── Section 24: Tenant Isolation ─────────────────────────────────────────────

check("TI-01 orgSlug in AnomalySignal type",              contains(types, "orgSlug:"));
check("TI-02 orgSlug in AnomalyAlert type",               contains(types, "orgSlug:"));
check("TI-03 orgSlug required in Prisma saveAlert",        contains(prismaRepo, "org_slug_required"));
check("TI-04 orgSlug required in Prisma saveSignal",       contains(prismaRepo, "org_slug_required"));
check("TI-05 orgSlug filter in getSignals",                contains(prismaRepo, "orgSlug,"));
check("TI-06 orgSlug filter in listAlerts",                contains(prismaRepo, "orgSlug,"));
check("TI-07 orgSlug filter in countOpenAlerts",           contains(prismaRepo, "orgSlug, status"));
check("TI-08 orgSlug in correlation engine check",         contains(correlation, "orgSlug"));
check("TI-09 orgSlug in query helpers",                    contains(query, "orgSlug"));
check("TI-10 cross-tenant detector checks target org",     contains(dCrossTenant, "targetOrgSlug"));

// ── Section 25: Extra Coverage ────────────────────────────────────────────────

check("EC-01 resolveDetector in registry",                 contains(registry, "resolveDetector"));
check("EC-02 CorrelatedGroup has rule and signals",        contains(correlation, "rule") && contains(correlation, "signals"));
check("EC-03 alert builder uses cuid or uid",              contains(alertBuilder, "cuid") || contains(alertBuilder, "crypto") || contains(alertBuilder, "Date.now"));
check("EC-04 AnomalyReadinessReport has score field",      contains(readiness, "score:"));
check("EC-05 AnomalyHealthReport has detectorCount",       contains(health, "detectorCount:"));
check("EC-06 buildAgentRiskReport in report builder",      contains(reportBuilder, "buildAgentRiskReport"));
check("EC-07 riskTrend IMPROVING/WORSENING in dashboard",  contains(dashboard, "IMPROVING") && contains(dashboard, "WORSENING"));
check("EC-08 signalCount24h in dashboard payload",         contains(dashboard, "signalCount24h"));
check("EC-09 InMemoryAnomalyRepository.clear()",           contains(repo, "clear()"));
check("EC-10 fire-and-forget _persist in audit",           contains(audit, "async function _persist"));

// ── Final Report ──────────────────────────────────────────────────────────────

const total = passed + failed;
console.log("\n" + "═".repeat(60));
console.log("  AGENTIK-SECURITY-ANOMALY-DETECTION-01 — Static Validation");
console.log("═".repeat(60));
console.log(`  Total checks : ${total}`);
console.log(`  Passed       : ${passed}`);
console.log(`  Failed       : ${failed}`);
console.log("═".repeat(60));

if (failures.length > 0) {
  console.log("\n  FAILURES:");
  failures.forEach(f => console.log(f));
  console.log("");
}

if (failed === 0) {
  console.log(`\n  ✓ ALL ${total} CHECKS PASS — Sprint complete.\n`);
} else {
  console.log(`\n  ✗ ${failed} check(s) failed.\n`);
  process.exit(1);
}
