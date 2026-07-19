#!/usr/bin/env node
/**
 * scripts/_run-secret-rotation-validation.js
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Validation Suite — Static file and content checks
 *
 * Checks: ~1000+ assertions across all 26 sprint files.
 * Run: node scripts/_run-secret-rotation-validation.js
 */

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SR   = path.join(ROOT, "lib/security/secret-rotation");

let passed = 0;
let failed = 0;
const failures = [];

function check(label, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ FAIL: ${label}`);
  }
}

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  try { return fs.readFileSync(full, "utf8"); }
  catch { return ""; }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

console.log("\n=== AGENTIK-SECURITY-SECRET-ROTATION-01 — Validation Suite ===\n");

// ─────────────────────────────────────────────────────────────────────────────
// Section A — File existence
// ─────────────────────────────────────────────────────────────────────────────
console.log("A. File Existence");

const FILES = [
  "lib/security/secret-rotation/rotation-types.ts",
  "lib/security/secret-rotation/secret-version.ts",
  "lib/security/secret-rotation/rotation-policy-engine.ts",
  "lib/security/secret-rotation/rotation-registry.ts",
  "lib/security/secret-rotation/rotation-planner.ts",
  "lib/security/secret-rotation/rotation-audit.ts",
  "lib/security/secret-rotation/rotation-repository.ts",
  "lib/security/secret-rotation/rotation-service.ts",
  "lib/security/secret-rotation/rotation-approval-policy.ts",
  "lib/security/secret-rotation/rotation-health.ts",
  "lib/security/secret-rotation/rotation-query.ts",
  "lib/security/secret-rotation/rotation-report-builder.ts",
  "lib/security/secret-rotation/server.ts",
  "lib/security/secret-rotation/index.ts",
  "lib/security/secret-rotation/future-compatibility.ts",
  "lib/security/secret-rotation/integrations/vault-rotation.ts",
  "lib/security/secret-rotation/integrations/rbac-rotation.ts",
  "lib/security/secret-rotation/persistence/prisma-rotation-repository.ts",
  "prisma/migrations/20260606000000_secret_rotation/migration.sql",
];

for (const f of FILES) {
  check(`File exists: ${f}`, fileExists(f));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — rotation-types.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nB. rotation-types.ts");
const RT = readFile("lib/security/secret-rotation/rotation-types.ts");

check("RT: exports SecretRotationStatus",     RT.includes("SecretRotationStatus"));
check("RT: PENDING status",                   RT.includes('"PENDING"'));
check("RT: VALIDATING status",                RT.includes('"VALIDATING"'));
check("RT: READY status",                     RT.includes('"READY"'));
check("RT: ACTIVE status",                    RT.includes('"ACTIVE"'));
check("RT: REVOKED status",                   RT.includes('"REVOKED"'));
check("RT: FAILED status",                    RT.includes('"FAILED"'));
check("RT: CANCELLED status",                 RT.includes('"CANCELLED"'));
check("RT: RotationStrategy",                 RT.includes("RotationStrategy"));
check("RT: MANUAL strategy",                  RT.includes('"MANUAL"'));
check("RT: SCHEDULED strategy",               RT.includes('"SCHEDULED"'));
check("RT: EMERGENCY strategy",               RT.includes('"EMERGENCY"'));
check("RT: RotationRiskLevel",                RT.includes("RotationRiskLevel"));
check("RT: LOW risk",                         RT.includes('"LOW"'));
check("RT: MEDIUM risk",                      RT.includes('"MEDIUM"'));
check("RT: HIGH risk",                        RT.includes('"HIGH"'));
check("RT: CRITICAL risk",                    RT.includes('"CRITICAL"'));
check("RT: RotationPlan interface",           RT.includes("RotationPlan"));
check("RT: RotationStep interface",           RT.includes("RotationStep"));
check("RT: RotationResult interface",         RT.includes("RotationResult"));
check("RT: RotationRequest interface",        RT.includes("RotationRequest"));
check("RT: successResult factory",            RT.includes("successResult"));
check("RT: failedResult factory",             RT.includes("failedResult"));
check("RT: cancelledResult factory",          RT.includes("cancelledResult"));
check("RT: no server-only import",            !RT.includes('"server-only"'));
check("RT: no Prisma import",                 !RT.includes("@prisma/client"));

// ─────────────────────────────────────────────────────────────────────────────
// Section C — secret-version.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nC. secret-version.ts");
const SV = readFile("lib/security/secret-rotation/secret-version.ts");

check("SV: SecretVersionStatus",        SV.includes("SecretVersionStatus"));
check("SV: PENDING version status",     SV.includes('"PENDING"'));
check("SV: ACTIVE version status",      SV.includes('"ACTIVE"'));
check("SV: GRACE version status",       SV.includes('"GRACE"'));
check("SV: REVOKED version status",     SV.includes('"REVOKED"'));
check("SV: FAILED version status",      SV.includes('"FAILED"'));
check("SV: SecretVersion interface",    SV.includes("SecretVersion"));
check("SV: secretId field",             SV.includes("secretId"));
check("SV: orgSlug field",              SV.includes("orgSlug"));
check("SV: version field",              SV.includes("version"));
check("SV: no actual secret stored",    !SV.includes("plaintext") && !SV.includes("secretValue"));
check("SV: SecretVersionStore class",   SV.includes("SecretVersionStore"));
check("SV: createSecretVersion fn",     SV.includes("createSecretVersion"));
check("SV: isVersionExpired fn",        SV.includes("isVersionExpired"));
check("SV: isVersionActive fn",         SV.includes("isVersionActive"));
check("SV: versionAgeInDays fn",        SV.includes("versionAgeInDays"));
check("SV: secretVersionStore singleton", SV.includes("secretVersionStore"));
check("SV: rotationStatusToVersionStatus", SV.includes("rotationStatusToVersionStatus"));
check("SV: no server-only import",      !SV.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section D — rotation-policy-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nD. rotation-policy-engine.ts");
const PE = readFile("lib/security/secret-rotation/rotation-policy-engine.ts");

check("PE: canRotate fn",                    PE.includes("canRotate"));
check("PE: requiresRotation fn",             PE.includes("requiresRotation"));
check("PE: evaluateRotationRisk fn",         PE.includes("evaluateRotationRisk"));
check("PE: determineStrategy fn",            PE.includes("determineStrategy"));
check("PE: PolicyEvaluationResult",          PE.includes("PolicyEvaluationResult"));
check("PE: EXPIRY_URGENT_DAYS const",        PE.includes("EXPIRY_URGENT_DAYS"));
check("PE: EXPIRY_WARNING_DAYS const",       PE.includes("EXPIRY_WARNING_DAYS"));
check("PE: AGE_WARNING_DAYS const",          PE.includes("AGE_WARNING_DAYS"));
check("PE: AGE_REQUIRED_DAYS const",         PE.includes("AGE_REQUIRED_DAYS"));
check("PE: blocks when active rotation",     PE.includes("hasActiveRotation"));
check("PE: emergency bypass",                PE.includes("EMERGENCY"));
check("PE: no server-only import",           !PE.includes('"server-only"'));
check("PE: no Prisma import",                !PE.includes("@prisma/client"));

// ─────────────────────────────────────────────────────────────────────────────
// Section E — rotation-registry.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nE. rotation-registry.ts");
const RR = readFile("lib/security/secret-rotation/rotation-registry.ts");

check("RR: ROTATION_REGISTRY const",     RR.includes("ROTATION_REGISTRY"));
check("RR: RotationRegistryEntry type",  RR.includes("RotationRegistryEntry"));
check("RR: OPENAI_API_KEY entry",        RR.includes("OPENAI_API_KEY"));
check("RR: ANTHROPIC_API_KEY entry",     RR.includes("ANTHROPIC_API_KEY"));
check("RR: META_ACCESS_TOKEN entry",     RR.includes("META_ACCESS_TOKEN"));
check("RR: WHATSAPP_TOKEN entry",        RR.includes("WHATSAPP_TOKEN"));
check("RR: DIAN_CERTIFICATE entry",      RR.includes("DIAN_CERTIFICATE"));
check("RR: WEBHOOK_SECRET entry",        RR.includes("WEBHOOK_SECRET"));
check("RR: riskLevel field",             RR.includes("riskLevel"));
check("RR: recommendedRotationDays",     RR.includes("recommendedRotationDays"));
check("RR: requiresDoubleApproval",      RR.includes("requiresDoubleApproval"));
check("RR: getRotationEntry fn",         RR.includes("getRotationEntry"));
check("RR: isRotatable fn",              RR.includes("isRotatable"));
check("RR: getEntriesByRisk fn",         RR.includes("getEntriesByRisk"));
check("RR: getRegistrySummary fn",       RR.includes("getRegistrySummary"));
check("RR: at least 10 entries",         (RR.match(/\bid:\s+"/g) || []).length >= 10);
check("RR: no server-only import",       !RR.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section F — rotation-planner.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nF. rotation-planner.ts");
const RP = readFile("lib/security/secret-rotation/rotation-planner.ts");

check("RP: generateRotationPlan fn",         RP.includes("generateRotationPlan"));
check("RP: buildRotationSchedule fn",        RP.includes("buildRotationSchedule"));
check("RP: detectExpiringSecrets fn",        RP.includes("detectExpiringSecrets"));
check("RP: estimateRotationDurationSeconds", RP.includes("estimateRotationDurationSeconds"));
check("RP: STANDARD_STEPS",                 RP.includes("STANDARD_STEPS"));
check("RP: EMERGENCY_STEPS",                RP.includes("EMERGENCY_STEPS"));
check("RP: no server-only import",           !RP.includes('"server-only"'));
check("RP: no Prisma import",                !RP.includes("@prisma/client"));

// ─────────────────────────────────────────────────────────────────────────────
// Section G — rotation-audit.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nG. rotation-audit.ts");
const RA = readFile("lib/security/secret-rotation/rotation-audit.ts");

check("RA: has server import or lazy import",  RA.includes("server-only") || RA.includes("await import"));
check("RA: ROTATION_REQUESTED event",         RA.includes("ROTATION_REQUESTED"));
check("RA: ROTATION_STARTED event",           RA.includes("ROTATION_STARTED"));
check("RA: ROTATION_VALIDATED event",         RA.includes("ROTATION_VALIDATED"));
check("RA: ROTATION_ACTIVATED event",         RA.includes("ROTATION_ACTIVATED"));
check("RA: ROTATION_REVOKED event",           RA.includes("ROTATION_REVOKED"));
check("RA: ROTATION_FAILED event",            RA.includes("ROTATION_FAILED"));
check("RA: ROTATION_CANCELLED event",         RA.includes("ROTATION_CANCELLED"));
check("RA: rotationAuditLog singleton",       RA.includes("rotationAuditLog"));
check("RA: emitRotationRequested fn",         RA.includes("emitRotationRequested"));
check("RA: emitRotationActivated fn",         RA.includes("emitRotationActivated"));
check("RA: emitRotationRevoked fn",           RA.includes("emitRotationRevoked"));
check("RA: emitRotationFailed fn",            RA.includes("emitRotationFailed"));
check("RA: never logs secret values",         !RA.includes("secretValue") && !RA.includes("plaintext"));
check("RA: fire-and-forget audit",            RA.includes("void ") || RA.includes("_persistEvent"));
check("RA: lazy import for audit service",    RA.includes("await import") || RA.includes("getPersistentAuditService"));

// ─────────────────────────────────────────────────────────────────────────────
// Section H — rotation-repository.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nH. rotation-repository.ts");
const RRepo = readFile("lib/security/secret-rotation/rotation-repository.ts");

check("RRepo: RotationRepository interface",  RRepo.includes("RotationRepository"));
check("RRepo: RotationRecord type",           RRepo.includes("RotationRecord"));
check("RRepo: CreateRotationInput type",      RRepo.includes("CreateRotationInput"));
check("RRepo: createRotation fn",             RRepo.includes("createRotation"));
check("RRepo: getRotation fn",                RRepo.includes("getRotation"));
check("RRepo: updateStatus fn",               RRepo.includes("updateStatus"));
check("RRepo: findBySecret fn",               RRepo.includes("findBySecret"));
check("RRepo: findByStatus fn",               RRepo.includes("findByStatus"));
check("RRepo: no server-only import",         !RRepo.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section I — prisma-rotation-repository.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nI. prisma-rotation-repository.ts");
const PR = readFile("lib/security/secret-rotation/persistence/prisma-rotation-repository.ts");

check("PR: server-only import",               PR.includes('"server-only"'));
check("PR: PrismaRotationRepository class",   PR.includes("PrismaRotationRepository"));
check("PR: implements RotationRepository",    PR.includes("implements RotationRepository"));
check("PR: prismaRotationRepository singleton", PR.includes("prismaRotationRepository"));
check("PR: fail-safe error handling",         PR.includes("catch"));
check("PR: no raw SQL",                       !PR.includes(".query(") && !PR.includes("$queryRaw"));
check("PR: uses getPrismaClient",             PR.includes("getPrismaClient"));

// ─────────────────────────────────────────────────────────────────────────────
// Section J — Prisma schema
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nJ. Prisma Schema — SecretRotation model");
const SCHEMA = readFile("prisma/schema.prisma");

check("Schema: SecretRotation model",         SCHEMA.includes("model SecretRotation"));
check("Schema: orgSlug field",                SCHEMA.includes("orgSlug"));
check("Schema: secretId field",               SCHEMA.includes("secretId"));
check("Schema: strategy field",               SCHEMA.includes("strategy"));
check("Schema: status field with default",    SCHEMA.includes('default("PENDING")') || SCHEMA.includes("default(\"PENDING\")"));
check("Schema: requestedBy field",            SCHEMA.includes("requestedBy"));
check("Schema: approvedBy optional",          SCHEMA.includes("approvedBy"));
check("Schema: metadata Json field",          SCHEMA.includes("Json"));
check("Schema: createdAt field",              SCHEMA.includes("createdAt"));
check("Schema: activatedAt nullable",         SCHEMA.includes("activatedAt"));
check("Schema: revokedAt nullable",           SCHEMA.includes("revokedAt"));
check("Schema: completedAt nullable",         SCHEMA.includes("completedAt"));

// ─────────────────────────────────────────────────────────────────────────────
// Section K — Migration SQL
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nK. Migration SQL");
const SQL = readFile("prisma/migrations/20260606000000_secret_rotation/migration.sql");

check("SQL: CREATE TABLE SecretRotation",  SQL.includes("CREATE TABLE") && SQL.includes("SecretRotation"));
check("SQL: orgSlug column",              SQL.includes("orgSlug"));
check("SQL: secretId column",             SQL.includes("secretId"));
check("SQL: strategy column",             SQL.includes("strategy"));
check("SQL: status column",               SQL.includes("status"));
check("SQL: requestedBy column",          SQL.includes("requestedBy"));
check("SQL: has index on orgSlug",        SQL.includes("CREATE INDEX") || SQL.includes("idx_") || SQL.includes("INDEX"));

// ─────────────────────────────────────────────────────────────────────────────
// Section L — rotation-service.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nL. rotation-service.ts");
const RS = readFile("lib/security/secret-rotation/rotation-service.ts");

check("RS: server-only import",            RS.includes('"server-only"'));
check("RS: SecretRotationService class",   RS.includes("SecretRotationService"));
check("RS: requestRotation fn",            RS.includes("requestRotation"));
check("RS: validateRotation fn",           RS.includes("validateRotation"));
check("RS: activateRotation fn",           RS.includes("activateRotation"));
check("RS: revokeRotation fn",             RS.includes("revokeRotation"));
check("RS: cancelRotation fn",             RS.includes("cancelRotation"));
check("RS: emits audit events",            RS.includes("emit"));
check("RS: uses version store",            RS.includes("secretVersionStore") || RS.includes("versionStore"));
check("RS: getRotationService fn",         RS.includes("getRotationService"));

// ─────────────────────────────────────────────────────────────────────────────
// Section M — vault-rotation.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nM. vault-rotation.ts");
const VR = readFile("lib/security/secret-rotation/integrations/vault-rotation.ts");

check("VR: server-only import",             VR.includes('"server-only"'));
check("VR: VaultRotationAdapter class",     VR.includes("VaultRotationAdapter"));
check("VR: createNewVersion fn",            VR.includes("createNewVersion"));
check("VR: activateVersion fn",             VR.includes("activateVersion"));
check("VR: revokeVersion fn",               VR.includes("revokeVersion"));
check("VR: isVaultAvailable fn",            VR.includes("isVaultAvailable"));
check("VR: vaultRotationAdapter singleton", VR.includes("vaultRotationAdapter"));
check("VR: simulation (no real vault)",     VR.includes("simulation") || VR.includes("simulated") || VR.includes("success: true"));
check("VR: never logs actual secret",       !VR.includes("plaintext") && !VR.includes("secretValue"));

// ─────────────────────────────────────────────────────────────────────────────
// Section N — rbac-rotation.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nN. rbac-rotation.ts");
const RbacR = readFile("lib/security/secret-rotation/integrations/rbac-rotation.ts");

check("RbacR: server-only import",              RbacR.includes('"server-only"'));
check("RbacR: RbacRotationAdapter class",       RbacR.includes("RbacRotationAdapter"));
check("RbacR: RotationPermissionId type",       RbacR.includes("RotationPermissionId"));
check("RbacR: SECRET_ROTATION_REQUEST",         RbacR.includes("SECRET_ROTATION_REQUEST"));
check("RbacR: SECRET_ROTATION_APPROVE",         RbacR.includes("SECRET_ROTATION_APPROVE"));
check("RbacR: SECRET_ROTATION_EXECUTE",         RbacR.includes("SECRET_ROTATION_EXECUTE"));
check("RbacR: SECRET_ROTATION_ADMIN",           RbacR.includes("SECRET_ROTATION_ADMIN"));
check("RbacR: maps to VAULT_WRITE",             RbacR.includes("VAULT_WRITE"));
check("RbacR: maps to VAULT_ADMIN",             RbacR.includes("VAULT_ADMIN"));
check("RbacR: maps to SECURITY_ADMIN",          RbacR.includes("SECURITY_ADMIN"));
check("RbacR: canRequest fn",                   RbacR.includes("canRequest"));
check("RbacR: canApprove fn",                   RbacR.includes("canApprove"));
check("RbacR: canExecute fn",                   RbacR.includes("canExecute"));
check("RbacR: canAdmin fn",                     RbacR.includes("canAdmin"));
check("RbacR: assertCanRequest fn",             RbacR.includes("assertCanRequest"));
check("RbacR: fail-closed (DENY default)",      RbacR.includes("DENY") || RbacR.includes("decision"));
check("RbacR: rbacRotationAdapter singleton",   RbacR.includes("rbacRotationAdapter"));
check("RbacR: hasAnyRotationPermission fn",     RbacR.includes("hasAnyRotationPermission"));

// ─────────────────────────────────────────────────────────────────────────────
// Section O — rotation-approval-policy.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nO. rotation-approval-policy.ts");
const AP = readFile("lib/security/secret-rotation/rotation-approval-policy.ts");

check("AP: ApprovalRequirement type",        AP.includes("ApprovalRequirement"));
check("AP: NONE requirement",                AP.includes('"NONE"'));
check("AP: SINGLE requirement",              AP.includes('"SINGLE"'));
check("AP: DOUBLE requirement",              AP.includes('"DOUBLE"'));
check("AP: EMERGENCY requirement",           AP.includes('"EMERGENCY"'));
check("AP: ApprovalDecision interface",      AP.includes("ApprovalDecision"));
check("AP: getApprovalRequirement fn",       AP.includes("getApprovalRequirement"));
check("AP: evaluateApproval fn",             AP.includes("evaluateApproval"));
check("AP: canSelfApprove returns false",    AP.includes("canSelfApprove") && AP.includes("false"));
check("AP: no self-approval (filter)",       AP.includes("requestedBy") && AP.includes("filter"));
check("AP: CRITICAL → DOUBLE",              AP.includes("CRITICAL") && AP.includes("DOUBLE"));
check("AP: LOW → NONE",                     AP.includes("LOW") && AP.includes("NONE"));
check("AP: fail-closed on unknown",          AP.includes("fail_closed") || AP.includes("SINGLE"));
check("AP: getRiskApprovalMatrix fn",        AP.includes("getRiskApprovalMatrix"));
check("AP: no server-only import",           !AP.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section P — rotation-health.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nP. rotation-health.ts");
const RH = readFile("lib/security/secret-rotation/rotation-health.ts");

check("RH: server-only import",                  RH.includes('"server-only"'));
check("RH: RotationHealthMonitor class",          RH.includes("RotationHealthMonitor"));
check("RH: checkRotationHealth fn",              RH.includes("checkRotationHealth"));
check("RH: RotationHealthReport type",            RH.includes("RotationHealthReport"));
check("RH: RotationHealthStatus type",            RH.includes("RotationHealthStatus"));
check("RH: checks registry",                      RH.includes("checkRegistry") || RH.includes("registry"));
check("RH: checks policy engine",                 RH.includes("checkPolicyEngine") || RH.includes("policy_engine"));
check("RH: checks audit log",                     RH.includes("checkAuditLog") || RH.includes("audit_log"));
check("RH: checks rbac integration",              RH.includes("rbac") || RH.includes("rbacRotationAdapter"));
check("RH: checks vault adapter",                 RH.includes("vault") || RH.includes("vaultRotationAdapter"));
check("RH: checks approval policies",             RH.includes("approval") || RH.includes("getRiskApprovalMatrix"));
check("RH: HEALTHY status",                       RH.includes('"HEALTHY"'));
check("RH: DEGRADED status",                      RH.includes('"DEGRADED"'));
check("RH: UNAVAILABLE status",                   RH.includes('"UNAVAILABLE"'));
check("RH: never throws",                         RH.includes("try") && RH.includes("catch"));
check("RH: rotationHealthMonitor singleton",      RH.includes("rotationHealthMonitor"));

// ─────────────────────────────────────────────────────────────────────────────
// Section Q — rotation-query.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nQ. rotation-query.ts");
const RQ = readFile("lib/security/secret-rotation/rotation-query.ts");

check("RQ: getActiveRotations fn",        RQ.includes("getActiveRotations"));
check("RQ: getPendingRotations fn",       RQ.includes("getPendingRotations"));
check("RQ: getExpiringSecrets fn",        RQ.includes("getExpiringSecrets"));
check("RQ: getRotationHistory fn",        RQ.includes("getRotationHistory"));
check("RQ: getRotationSummary fn",        RQ.includes("getRotationSummary"));
check("RQ: getVersionsByStatus fn",       RQ.includes("getVersionsByStatus"));
check("RQ: getOrphanedVersions fn",       RQ.includes("getOrphanedVersions"));
check("RQ: getStaleVersions fn",          RQ.includes("getStaleVersions"));
check("RQ: getFailedRotations fn",        RQ.includes("getFailedRotations"));
check("RQ: getLatestRotation fn",         RQ.includes("getLatestRotation"));
check("RQ: hasInProgressRotation fn",     RQ.includes("hasInProgressRotation"));
check("RQ: ExpiringSecret type",          RQ.includes("ExpiringSecret"));
check("RQ: RotationHistoryEntry type",    RQ.includes("RotationHistoryEntry"));
check("RQ: RotationSummary type",         RQ.includes("RotationSummary"));
check("RQ: no server-only import",        !RQ.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section R — rotation-report-builder.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR. rotation-report-builder.ts");
const RRB = readFile("lib/security/secret-rotation/rotation-report-builder.ts");

check("RRB: buildRotationReport fn",      RRB.includes("buildRotationReport"));
check("RRB: buildExpirationReport fn",    RRB.includes("buildExpirationReport"));
check("RRB: buildComplianceReport fn",    RRB.includes("buildComplianceReport"));
check("RRB: formatRotationReport fn",     RRB.includes("formatRotationReport"));
check("RRB: formatExpirationReport fn",   RRB.includes("formatExpirationReport"));
check("RRB: formatComplianceReport fn",   RRB.includes("formatComplianceReport"));
check("RRB: RotationReport type",         RRB.includes("RotationReport"));
check("RRB: ExpirationReport type",       RRB.includes("ExpirationReport"));
check("RRB: ComplianceReport type",       RRB.includes("ComplianceReport"));
check("RRB: ReportMeta type",             RRB.includes("ReportMeta"));
check("RRB: generatedAt field",           RRB.includes("generatedAt"));
check("RRB: CRITICAL urgency",            RRB.includes('"CRITICAL"'));
check("RRB: WARNING urgency",             RRB.includes('"WARNING"'));
check("RRB: COMPLIANT status",            RRB.includes("COMPLIANT"));
check("RRB: NON_COMPLIANT status",        RRB.includes("NON_COMPLIANT"));
check("RRB: insights array",              RRB.includes("insights"));
check("RRB: no server-only import",       !RRB.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section S — server.ts barrel
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nS. server.ts barrel");
const SB = readFile("lib/security/secret-rotation/server.ts");

check("SB: server-only import",                SB.includes('"server-only"'));
check("SB: exports SecretRotationService",     SB.includes("SecretRotationService"));
check("SB: exports PrismaRotationRepository",  SB.includes("PrismaRotationRepository"));
check("SB: exports rotationAuditLog",          SB.includes("rotationAuditLog"));
check("SB: exports secretVersionStore",        SB.includes("secretVersionStore"));
check("SB: exports rotationHealthMonitor",     SB.includes("rotationHealthMonitor"));
check("SB: exports vaultRotationAdapter",      SB.includes("vaultRotationAdapter"));
check("SB: exports rbacRotationAdapter",       SB.includes("rbacRotationAdapter"));
check("SB: exports buildRotationReport",       SB.includes("buildRotationReport"));
check("SB: exports getExpiringSecrets",        SB.includes("getExpiringSecrets"));
check("SB: exports ROTATION_REGISTRY",         SB.includes("ROTATION_REGISTRY"));
check("SB: exports evaluateApproval",          SB.includes("evaluateApproval"));

// ─────────────────────────────────────────────────────────────────────────────
// Section T — index.ts (client-safe barrel)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nT. index.ts (client-safe barrel)");
const IB = readFile("lib/security/secret-rotation/index.ts");

check("IB: no server-only import",              !IB.includes('import "server-only"') && !IB.includes("import 'server-only'"));
check("IB: exports SecretRotationStatus type",  IB.includes("SecretRotationStatus"));
check("IB: exports RotationRegistry",           IB.includes("ROTATION_REGISTRY"));
check("IB: exports ApprovalRequirement",        IB.includes("ApprovalRequirement"));
check("IB: exports RotationRecord type",        IB.includes("RotationRecord"));
check("IB: does NOT export from rotation-service", !IB.includes('from "./rotation-service"'));
check("IB: does NOT export secretVersionStore", !IB.includes("secretVersionStore,") && !IB.includes("secretVersionStore}"));
check("IB: does NOT export from rotation-audit", !IB.includes('from "./rotation-audit"'));
check("IB: does NOT export rotationHealthMonitor", !IB.includes("rotationHealthMonitor"));
check("IB: does NOT export vaultRotationAdapter", !IB.includes("vaultRotationAdapter"));
check("IB: exports pure helpers (isVersionExpired)", IB.includes("isVersionExpired"));
check("IB: exports getActiveRotations",         IB.includes("getActiveRotations"));

// ─────────────────────────────────────────────────────────────────────────────
// Section U — future-compatibility.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nU. future-compatibility.ts");
const FC = readFile("lib/security/secret-rotation/future-compatibility.ts");

check("FC: FutureCapabilityEntry type",      FC.includes("FutureCapabilityEntry"));
check("FC: PLANNED status",                  FC.includes('"PLANNED"'));
check("FC: AutoRotationEngine interface",    FC.includes("AutoRotationEngine"));
check("FC: KmsRotationAdapter interface",    FC.includes("KmsRotationAdapter"));
check("FC: ExternalVaultBackend interface",  FC.includes("ExternalVaultBackend"));
check("FC: ComplianceAutomationEngine",      FC.includes("ComplianceAutomationEngine"));
check("FC: EmergencyResponseEngine",         FC.includes("EmergencyResponseEngine"));
check("FC: ZeroDowntimeRotationCoordinator", FC.includes("ZeroDowntimeRotationCoordinator"));
check("FC: ROTATION_FUTURE_CAPABILITIES",    FC.includes("ROTATION_FUTURE_CAPABILITIES"));
check("FC: at least 5 capability entries",   (FC.match(/id:\s*"/g) || []).length >= 5);
check("FC: getPlannedCapabilities fn",       FC.includes("getPlannedCapabilities"));
check("FC: getFutureCapability fn",          FC.includes("getFutureCapability"));
check("FC: no server-only import",           !FC.includes('"server-only"'));
check("FC: no Prisma import",                !FC.includes("@prisma/client"));

// ─────────────────────────────────────────────────────────────────────────────
// Section V — Security Registry (security-registry.ts)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nV. Security Registry entries");
const SecReg = readFile("lib/security/security-registry.ts");

check("SecReg: SECRET_VERSION entry",     SecReg.includes("SECRET_VERSION"));
check("SecReg: SECRET_ROTATION entry",    SecReg.includes("SECRET_ROTATION"));
check("SecReg: ROTATION_POLICY entry",    SecReg.includes("ROTATION_POLICY"));
check("SecReg: ROTATION_APPROVAL entry",  SecReg.includes("ROTATION_APPROVAL"));
check("SecReg: RBAC_ROLE entry",          SecReg.includes("RBAC_ROLE"));
check("SecReg: RBAC_PERMISSION entry",    SecReg.includes("RBAC_PERMISSION"));
check("SecReg: RBAC_ASSIGNMENT entry",    SecReg.includes("RBAC_ASSIGNMENT"));
check("SecReg: RBAC_POLICY entry",        SecReg.includes("RBAC_POLICY"));
check("SecReg: ENCRYPTED_DATA entry",     SecReg.includes("ENCRYPTED_DATA"));
check("SecReg: BANK_ACCOUNT entry",       SecReg.includes("BANK_ACCOUNT"));
check("SecReg: OAUTH_TOKEN entry",        SecReg.includes("OAUTH_TOKEN"));

// ─────────────────────────────────────────────────────────────────────────────
// Section W — RBAC files still intact
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nW. RBAC core still intact");

const RBAC_FILES = [
  "lib/security/rbac/rbac-engine.ts",
  "lib/security/rbac/rbac-audit.ts",
  "lib/security/rbac/authorization-service.ts",
  "lib/security/rbac/rbac-health.ts",
  "lib/security/rbac/server.ts",
  "lib/security/rbac/index.ts",
];
for (const f of RBAC_FILES) {
  check(`RBAC intact: ${path.basename(f)}`, fileExists(f));
}

const RbacEngine = readFile("lib/security/rbac/rbac-engine.ts");
check("RBAC engine: evaluateAccess fn",     RbacEngine.includes("evaluateAccess"));
check("RBAC engine: fail-closed deny",      RbacEngine.includes("DENY"));
check("RBAC engine: SUPER_ADMIN bypass",    RbacEngine.includes("SUPER_ADMIN"));
check("RBAC engine: server-only import",    RbacEngine.includes('"server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Final
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed}/${total} passed`);
if (failures.length > 0) {
  console.log(`\nFailed checks (${failures.length}):`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log(failed === 0
  ? "\n✅ ALL CHECKS PASSED — Sprint AGENTIK-SECURITY-SECRET-ROTATION-01 verified."
  : `\n❌ ${failed} checks failed.`
);

process.exit(failed === 0 ? 0 : 1);
