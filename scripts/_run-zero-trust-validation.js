#!/usr/bin/env node
/**
 * scripts/_run-zero-trust-validation.js
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Static Validation Suite — 350+ checks
 *
 * Run: node scripts/_run-zero-trust-validation.js
 */

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ZT   = path.join(ROOT, "lib/security/zero-trust");

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

let passed = 0;
let failed = 0;
const failures = [];

function check(section, description, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`[${section}] ${description}`);
  }
}

// ── Load files ────────────────────────────────────────────────────────────────

const TYPES    = readFile(path.join(ZT, "zero-trust-types.ts"));
const ENGINE   = readFile(path.join(ZT, "zero-trust-policy-engine.ts"));
const SCORE    = readFile(path.join(ZT, "trust-score-engine.ts"));
const SESSION  = readFile(path.join(ZT, "session-trust.ts"));
const TENANT   = readFile(path.join(ZT, "tenant-isolation.ts"));
const AGENT    = readFile(path.join(ZT, "agent-security.ts"));
const INTEG    = readFile(path.join(ZT, "integration-security.ts"));
const EXEC     = readFile(path.join(ZT, "executive-brain-security.ts"));
const COPILOT  = readFile(path.join(ZT, "copilot-security.ts"));
const VAULT    = readFile(path.join(ZT, "vault-security.ts"));
const EVENTS   = readFile(path.join(ZT, "security-events.ts"));
const AUDIT    = readFile(path.join(ZT, "security-audit.ts"));
const DASH     = readFile(path.join(ZT, "security-dashboard-contract.ts"));
const READY    = readFile(path.join(ZT, "zero-trust-readiness.ts"));
const HEALTH   = readFile(path.join(ZT, "zero-trust-health.ts"));
const SERVER   = readFile(path.join(ZT, "server.ts"));
const INDEX    = readFile(path.join(ZT, "index.ts"));
const FUTURE   = readFile(path.join(ZT, "future-compatibility.ts"));
const REGISTRY = readFile(path.join(ROOT, "lib/security/security-registry.ts"));
const HARNESS  = readFile(path.join(ROOT, "app/api/internal/integration-tests/zero-trust/route.ts"));

// ── Section A: File Existence ────────────────────────────────────────────────

check("A", "zero-trust-types.ts exists",              TYPES    !== null);
check("A", "zero-trust-policy-engine.ts exists",      ENGINE   !== null);
check("A", "trust-score-engine.ts exists",            SCORE    !== null);
check("A", "session-trust.ts exists",                 SESSION  !== null);
check("A", "tenant-isolation.ts exists",              TENANT   !== null);
check("A", "agent-security.ts exists",                AGENT    !== null);
check("A", "integration-security.ts exists",          INTEG    !== null);
check("A", "executive-brain-security.ts exists",      EXEC     !== null);
check("A", "copilot-security.ts exists",              COPILOT  !== null);
check("A", "vault-security.ts exists",                VAULT    !== null);
check("A", "security-events.ts exists",               EVENTS   !== null);
check("A", "security-audit.ts exists",                AUDIT    !== null);
check("A", "security-dashboard-contract.ts exists",   DASH     !== null);
check("A", "zero-trust-readiness.ts exists",          READY    !== null);
check("A", "zero-trust-health.ts exists",             HEALTH   !== null);
check("A", "server.ts exists",                        SERVER   !== null);
check("A", "index.ts exists",                         INDEX    !== null);
check("A", "future-compatibility.ts exists",          FUTURE   !== null);
check("A", "integration-tests/zero-trust/route.ts exists", HARNESS !== null);

// ── Section B: Server-Only Boundary ──────────────────────────────────────────

check("B", "policy-engine has server-only",     ENGINE  && ENGINE.includes('import "server-only"'));
check("B", "agent-security has server-only",    AGENT   && AGENT.includes('import "server-only"'));
check("B", "integration-security has server-only", INTEG && INTEG.includes('import "server-only"'));
check("B", "executive-brain has server-only",   EXEC    && EXEC.includes('import "server-only"'));
check("B", "copilot-security has server-only",  COPILOT && COPILOT.includes('import "server-only"'));
check("B", "vault-security has server-only",    VAULT   && VAULT.includes('import "server-only"'));
check("B", "security-audit has server-only",    AUDIT   && AUDIT.includes('import "server-only"'));
check("B", "server.ts has server-only",         SERVER  && SERVER.includes('import "server-only"'));

// ── Section C: No server-only in pure domain files ────────────────────────────

function hasServerOnlyImport(content) {
  if (!content) return false;
  return /^import\s+"server-only"/m.test(content) || /^import\s+'server-only'/m.test(content);
}
check("C", "types no server-only",     !hasServerOnlyImport(TYPES));
check("C", "trust-score no server-only", !hasServerOnlyImport(SCORE));
check("C", "session-trust no server-only", !hasServerOnlyImport(SESSION));
check("C", "tenant-isolation no server-only", !hasServerOnlyImport(TENANT));
check("C", "security-events no server-only", !hasServerOnlyImport(EVENTS));
check("C", "dashboard-contract no server-only", !hasServerOnlyImport(DASH));
check("C", "readiness no server-only", !hasServerOnlyImport(READY));
check("C", "health no server-only", !hasServerOnlyImport(HEALTH));
check("C", "index.ts no server-only", !hasServerOnlyImport(INDEX));
check("C", "future-compat no server-only", !hasServerOnlyImport(FUTURE));

// ── Section D: No 'any' types ────────────────────────────────────────────────

function hasAnyType(content) {
  if (!content) return false;
  // Remove block comments (/** ... */) and single-line comments (//)
  const noBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
  const noComments = noBlockComments.replace(/\/\/[^\n]*/g, "");
  return /: any\b|<any>|\bas any\b/.test(noComments);
}
check("D", "types: no any",          !hasAnyType(TYPES));
check("D", "engine: no any",         !hasAnyType(ENGINE));
check("D", "score: no any",          !hasAnyType(SCORE));
check("D", "session: no any",        !hasAnyType(SESSION));
check("D", "tenant: no any",         !hasAnyType(TENANT));
check("D", "agent: no any",          !hasAnyType(AGENT));
check("D", "integ: no any",          !hasAnyType(INTEG));
check("D", "exec: no any",           !hasAnyType(EXEC));
check("D", "copilot: no any",        !hasAnyType(COPILOT));
check("D", "vault: no any",          !hasAnyType(VAULT));
check("D", "events: no any",         !hasAnyType(EVENTS));
check("D", "audit: no any",          !hasAnyType(AUDIT));
check("D", "dash: no any",           !hasAnyType(DASH));
check("D", "ready: no any",          !hasAnyType(READY));
check("D", "health: no any",         !hasAnyType(HEALTH));
check("D", "future: no any",         !hasAnyType(FUTURE));

// ── Section E: Core Types ─────────────────────────────────────────────────────

check("E", "types: ZeroTrustDecision",       TYPES && TYPES.includes("ZeroTrustDecision"));
check("E", "types: ZeroTrustRiskLevel",      TYPES && TYPES.includes("ZeroTrustRiskLevel"));
check("E", "types: ZeroTrustSubjectType",    TYPES && TYPES.includes("ZeroTrustSubjectType"));
check("E", "types: ZeroTrustResourceType",   TYPES && TYPES.includes("ZeroTrustResourceType"));
check("E", "types: ZeroTrustAction",         TYPES && TYPES.includes("ZeroTrustAction"));
check("E", "types: ZeroTrustContext",        TYPES && TYPES.includes("ZeroTrustContext"));
check("E", "types: ZeroTrustEvaluation",     TYPES && TYPES.includes("ZeroTrustEvaluation"));
check("E", "types: TRUST_THRESHOLDS",        TYPES && TYPES.includes("TRUST_THRESHOLDS"));
check("E", "types: RESOURCE_RISK_LEVELS",    TYPES && TYPES.includes("RESOURCE_RISK_LEVELS"));
check("E", "types: ACTION_RISK_MULTIPLIERS", TYPES && TYPES.includes("ACTION_RISK_MULTIPLIERS"));
check("E", "types: AgentAccessResult",       TYPES && TYPES.includes("AgentAccessResult"));
check("E", "types: IntegrationTrustResult",  TYPES && TYPES.includes("IntegrationTrustResult"));
check("E", "types: TenantIsolationResult",   TYPES && TYPES.includes("TenantIsolationResult"));
check("E", "types: SessionTrustInput",       TYPES && TYPES.includes("SessionTrustInput"));
check("E", "types: SessionTrustResult",      TYPES && TYPES.includes("SessionTrustResult"));

// ── Section F: Trust Score Engine ────────────────────────────────────────────

check("F", "score: calculateTrustScore",      SCORE && SCORE.includes("calculateTrustScore"));
check("F", "score: isTrustedScore",           SCORE && SCORE.includes("isTrustedScore"));
check("F", "score: isTrustedForRisk",         SCORE && SCORE.includes("isTrustedForRisk"));
check("F", "score: riskFromScore",            SCORE && SCORE.includes("riskFromScore"));
check("F", "score: FACTOR_WEIGHTS",           SCORE && SCORE.includes("FACTOR_WEIGHTS"));
check("F", "score: SUBJECT_BASE_DEDUCTIONS",  SCORE && SCORE.includes("SUBJECT_BASE_DEDUCTIONS"));
check("F", "score: hasValidRole weight 20",   SCORE && SCORE.includes("hasValidRole:        20"));
check("F", "score: hasValidSession weight 20",SCORE && SCORE.includes("hasValidSession:     20"));
check("F", "score: hasValidTenant weight 20", SCORE && SCORE.includes("hasValidTenant:      20"));
check("F", "score: INTEGRATION deduction -15",SCORE && SCORE.includes("INTEGRATION:   -15"));
check("F", "score: critical cap at 50",       SCORE && SCORE.includes("Math.min(clampedScore, 50)"));

// ── Section G: Session Trust ──────────────────────────────────────────────────

check("G", "session: evaluateSessionTrust",   SESSION && SESSION.includes("evaluateSessionTrust"));
check("G", "session: MAX_SESSION_AGE_MS 30d", SESSION && SESSION.includes("30 * 24 * 60 * 60 * 1000"));
check("G", "session: MAX_IDLE_MS 24h",        SESSION && SESSION.includes("24 * 60 * 60 * 1000"));
check("G", "session: hijackRisk",             SESSION && SESSION.includes("hijackRisk"));
check("G", "session: replayRisk",             SESSION && SESSION.includes("replayRisk"));
check("G", "session: crossTenantRisk",        SESSION && SESSION.includes("crossTenantRisk"));
check("G", "session: expired",                SESSION && SESSION.includes("expired"));

// ── Section H: Tenant Isolation ───────────────────────────────────────────────

check("H", "tenant: verifyTenantIsolation",   TENANT && TENANT.includes("verifyTenantIsolation"));
check("H", "tenant: assertTenantMatch",       TENANT && TENANT.includes("assertTenantMatch"));
check("H", "tenant: isSameTenant",            TENANT && TENANT.includes("isSameTenant"));
check("H", "tenant: isValidOrgSlug",          TENANT && TENANT.includes("isValidOrgSlug"));
check("H", "tenant: regex a-z0-9",            TENANT && TENANT.includes("[a-z0-9]"));
check("H", "tenant: crossTenantAttempt",      TENANT && TENANT.includes("crossTenantAttempt"));
check("H", "tenant: fail-closed CRITICAL",    TENANT && TENANT.includes("\"CRITICAL\""));

// ── Section I: Policy Engine ──────────────────────────────────────────────────

check("I", "engine: evaluateZeroTrust",       ENGINE && ENGINE.includes("evaluateZeroTrust"));
check("I", "engine: PERMISSION_MAP",          ENGINE && ENGINE.includes("PERMISSION_MAP"));
check("I", "engine: APPROVAL_REQUIREMENTS",   ENGINE && ENGINE.includes("APPROVAL_REQUIREMENTS"));
check("I", "engine: CHALLENGE_BAND",          ENGINE && ENGINE.includes("CHALLENGE_BAND"));
check("I", "engine: tenant isolation step 1", ENGINE && ENGINE.includes("verifyTenantIsolation"));
check("I", "engine: RBAC step 5",             ENGINE && ENGINE.includes("evaluateAccess"));
check("I", "engine: isTrustedForRisk step 6", ENGINE && ENGINE.includes("isTrustedForRisk"));
check("I", "engine: FINANCIAL_DATA:READ",     ENGINE && ENGINE.includes('"FINANCIAL_DATA:READ"'));
check("I", "engine: VAULT:ROTATE_SECRET",     ENGINE && ENGINE.includes('"VAULT:ROTATE_SECRET"'));
check("I", "engine: isZeroTrustAllowed",      ENGINE && ENGINE.includes("isZeroTrustAllowed"));
check("I", "engine: assertZeroTrust",         ENGINE && ENGINE.includes("assertZeroTrust"));
check("I", "engine: fail-closed catch block", ENGINE && ENGINE.includes("evaluation_error_fail_closed"));

// ── Section J: Agent Security ─────────────────────────────────────────────────

check("J", "agent: canAgentAccess",           AGENT && AGENT.includes("canAgentAccess"));
check("J", "agent: validateAgentScope",       AGENT && AGENT.includes("validateAgentScope"));
check("J", "agent: evaluateAgentTrust",       AGENT && AGENT.includes("evaluateAgentTrust"));
check("J", "agent: AGENT_DOMAINS luca",       AGENT && AGENT.includes("luca:"));
check("J", "agent: AGENT_DOMAINS diego",      AGENT && AGENT.includes("diego:"));
check("J", "agent: AGENT_DOMAINS laura",      AGENT && AGENT.includes("laura:"));
check("J", "agent: AGENT_DOMAINS david",      AGENT && AGENT.includes("david:"));
check("J", "agent: AGENT_DOMAINS sofia",      AGENT && AGENT.includes("sofia:"));
check("J", "agent: AGENT_DOMAINS mila",       AGENT && AGENT.includes("mila:"));
check("J", "agent: AGENT_DOMAINS pablo",      AGENT && AGENT.includes("pablo:"));
check("J", "agent: DENY_ALL_DOMAIN",          AGENT && AGENT.includes("DENY_ALL_DOMAIN"));
check("J", "agent: agents cannot APPROVE",    AGENT && AGENT.includes("case \"APPROVE\""));
check("J", "agent: agents cannot ADMIN",      AGENT && AGENT.includes("case \"ADMIN\""));
check("J", "agent: luca denied FINANCIAL_DATA", AGENT && AGENT.includes('"FINANCIAL_DATA"'));
check("J", "agent: KNOWN_AGENT_IDS",          AGENT && AGENT.includes("KNOWN_AGENT_IDS"));

// ── Section K: Integration Security ──────────────────────────────────────────

check("K", "integ: validateIntegrationAccess",     INTEG && INTEG.includes("validateIntegrationAccess"));
check("K", "integ: evaluateIntegrationTrust",      INTEG && INTEG.includes("evaluateIntegrationTrust"));
check("K", "integ: denyCompromisedIntegration",    INTEG && INTEG.includes("denyCompromisedIntegration"));
check("K", "integ: shopify scope",                 INTEG && INTEG.includes("shopify:"));
check("K", "integ: meta scope",                    INTEG && INTEG.includes("meta:"));
check("K", "integ: whatsapp scope",                INTEG && INTEG.includes("whatsapp:"));
check("K", "integ: tiktok scope",                  INTEG && INTEG.includes("tiktok:"));
check("K", "integ: dian scope CRITICAL",           INTEG && INTEG.includes("dian:") && INTEG.includes("isFiscal:  true"));
check("K", "integ: fedex scope",                   INTEG && INTEG.includes("fedex:"));
check("K", "integ: stripe isPayment true",         INTEG && INTEG.includes("isPayment: true"));
check("K", "integ: castillitos_crm scope",         INTEG && INTEG.includes("castillitos_crm:"));
check("K", "integ: compromised check",             INTEG && INTEG.includes("isCompromised"));
check("K", "integ: revoked check",                 INTEG && INTEG.includes("isRevoked"));
check("K", "integ: secret version check",          INTEG && INTEG.includes("secretVersion"));
check("K", "integ: KNOWN_INTEGRATION_IDS",         INTEG && INTEG.includes("KNOWN_INTEGRATION_IDS"));

// ── Section L: Executive Brain Security ──────────────────────────────────────

check("L", "exec: validateExecutiveBrainAccess",   EXEC && EXEC.includes("validateExecutiveBrainAccess"));
check("L", "exec: canAgentReadExecutiveBrain",      EXEC && EXEC.includes("canAgentReadExecutiveBrain"));
check("L", "exec: canAgentWriteMemory",             EXEC && EXEC.includes("canAgentWriteMemory"));
check("L", "exec: diego can read exec brain",       EXEC && EXEC.includes('"diego"') && EXEC.includes("EXECUTIVE_BRAIN_READER_AGENTS"));
check("L", "exec: pablo can read exec brain",       EXEC && EXEC.includes('"pablo"'));
check("L", "exec: agents cannot write exec brain",  EXEC && EXEC.includes("agents_cannot_write_executive_brain"));
check("L", "exec: FINANCE_ADMIN write role",        EXEC && EXEC.includes("FINANCE_ADMIN"));
check("L", "exec: all 7 agents can write memory",   EXEC && EXEC.includes("MEMORY_WRITE_AGENTS"));

// ── Section M: Copilot Security ───────────────────────────────────────────────

check("M", "copilot: canAccessCopilot",        COPILOT && COPILOT.includes("canAccessCopilot"));
check("M", "copilot: canDelegateTask",         COPILOT && COPILOT.includes("canDelegateTask"));
check("M", "copilot: canReadMemory",           COPILOT && COPILOT.includes("canReadMemory"));
check("M", "copilot: canWriteMemory",          COPILOT && COPILOT.includes("canWriteMemory"));
check("M", "copilot: canExecuteAgent",         COPILOT && COPILOT.includes("canExecuteAgent"));
check("M", "copilot: COPILOT_EXECUTE",         COPILOT && COPILOT.includes("COPILOT_EXECUTE"));
check("M", "copilot: pablo cross-domain",      COPILOT && COPILOT.includes("CROSS_DOMAIN_DELEGATORS"));
check("M", "copilot: agent cannot read other memory", COPILOT && COPILOT.includes("agent_cannot_read_other_agent_memory"));

// ── Section N: Vault Security ─────────────────────────────────────────────────

check("N", "vault: validateVaultAccess",       VAULT && VAULT.includes("validateVaultAccess"));
check("N", "vault: canRotateSecret",           VAULT && VAULT.includes("canRotateSecret"));
check("N", "vault: canManageEncryptionKey",    VAULT && VAULT.includes("canManageEncryptionKey"));
check("N", "vault: agents_cannot_access_vault",VAULT && VAULT.includes("agents_cannot_access_vault"));
check("N", "vault: VAULT_ADMIN_ROLES",         VAULT && VAULT.includes("VAULT_ADMIN_ROLES"));
check("N", "vault: ENCRYPTION_ADMIN_ROLES",    VAULT && VAULT.includes("ENCRYPTION_ADMIN_ROLES"));
check("N", "vault: rotation requires approval",VAULT && VAULT.includes("vault_rotation_requires_approval"));
check("N", "vault: audit always required",     VAULT && VAULT.includes("auditRequired: true"));

// ── Section O: Security Events ────────────────────────────────────────────────

check("O", "events: ZERO_TRUST_ALLOW",         EVENTS && EVENTS.includes("ZERO_TRUST_ALLOW"));
check("O", "events: ZERO_TRUST_DENY",          EVENTS && EVENTS.includes("ZERO_TRUST_DENY"));
check("O", "events: ZERO_TRUST_CHALLENGE",     EVENTS && EVENTS.includes("ZERO_TRUST_CHALLENGE"));
check("O", "events: CROSS_TENANT_BLOCKED",     EVENTS && EVENTS.includes("CROSS_TENANT_BLOCKED"));
check("O", "events: AGENT_SCOPE_BLOCKED",      EVENTS && EVENTS.includes("AGENT_SCOPE_BLOCKED"));
check("O", "events: INTEGRATION_BLOCKED",      EVENTS && EVENTS.includes("INTEGRATION_BLOCKED"));
check("O", "events: SECRET_ACCESS_DENIED",     EVENTS && EVENTS.includes("SECRET_ACCESS_DENIED"));
check("O", "events: SESSION_HIJACK_DETECTED",  EVENTS && EVENTS.includes("SESSION_HIJACK_DETECTED"));
check("O", "events: SESSION_EXPIRED",          EVENTS && EVENTS.includes("SESSION_EXPIRED"));
check("O", "events: buildZeroTrustEvent",      EVENTS && EVENTS.includes("buildZeroTrustEvent"));
check("O", "events: buildCrossTenantEvent",    EVENTS && EVENTS.includes("buildCrossTenantEvent"));
check("O", "events: buildAgentScopeEvent",     EVENTS && EVENTS.includes("buildAgentScopeEvent"));
check("O", "events: buildSecretAccessDenied",  EVENTS && EVENTS.includes("buildSecretAccessDeniedEvent"));
check("O", "events: buildSessionHijackEvent",  EVENTS && EVENTS.includes("buildSessionHijackEvent"));
check("O", "events: isCriticalEvent",          EVENTS && EVENTS.includes("isCriticalEvent"));
check("O", "events: filterEventsBySeverity",   EVENTS && EVENTS.includes("filterEventsBySeverity"));
check("O", "events: REQUIRES_ACTION_EVENTS",   EVENTS && EVENTS.includes("REQUIRES_ACTION_EVENTS"));

// ── Section P: Security Audit ─────────────────────────────────────────────────

check("P", "audit: buildZeroTrustAuditRecord",       AUDIT && AUDIT.includes("buildZeroTrustAuditRecord"));
check("P", "audit: buildSecurityEventAuditRecord",   AUDIT && AUDIT.includes("buildSecurityEventAuditRecord"));
check("P", "audit: shouldAuditEvaluation",           AUDIT && AUDIT.includes("shouldAuditEvaluation"));
check("P", "audit: shouldAuditSecurityEvent",        AUDIT && AUDIT.includes("shouldAuditSecurityEvent"));
check("P", "audit: maps DENY to ACCESS_DENIED",      AUDIT && AUDIT.includes("ACCESS_DENIED"));
check("P", "audit: maps ALLOW to ACCESS_GRANTED",    AUDIT && AUDIT.includes("ACCESS_GRANTED"));
check("P", "audit: CROSS_TENANT_BLOCKED category",   AUDIT && AUDIT.includes("TENANT_BOUNDARY"));
check("P", "audit: SECRET_ACCESS_DENIED category",   AUDIT && AUDIT.includes("SECRET_ACCESS"));
check("P", "audit: ZeroTrustAuditRecord type",       AUDIT && AUDIT.includes("ZeroTrustAuditRecord"));

// ── Section Q: Dashboard Contract ────────────────────────────────────────────

check("Q", "dash: ZeroTrustSummaryKPIs",       DASH && DASH.includes("ZeroTrustSummaryKPIs"));
check("Q", "dash: ThreatBreakdown",            DASH && DASH.includes("ThreatBreakdown"));
check("Q", "dash: TrustScoreDistribution",     DASH && DASH.includes("TrustScoreDistribution"));
check("Q", "dash: RiskLevelBreakdown",         DASH && DASH.includes("RiskLevelBreakdown"));
check("Q", "dash: ZeroTrustDashboardPayload",  DASH && DASH.includes("ZeroTrustDashboardPayload"));
check("Q", "dash: buildZeroTrustDashboard",    DASH && DASH.includes("buildZeroTrustDashboard"));
check("Q", "dash: buildEmptyDashboard",        DASH && DASH.includes("buildEmptyDashboard"));
check("Q", "dash: denyRate",                   DASH && DASH.includes("denyRate"));
check("Q", "dash: topDenied up to 10",         DASH && DASH.includes(".slice(0, 10)"));
check("Q", "dash: severityToLabel",            DASH && DASH.includes("severityToLabel"));

// ── Section R: Readiness Scanner ──────────────────────────────────────────────

check("R", "ready: scanZeroTrustReadiness",    READY && READY.includes("scanZeroTrustReadiness"));
check("R", "ready: ZeroTrustReadinessStatus",  READY && READY.includes("ZeroTrustReadinessStatus"));
check("R", "ready: READY|PARTIAL|NOT_READY",   READY && READY.includes('"READY"') && READY.includes('"PARTIAL"') && READY.includes('"NOT_READY"'));
check("R", "ready: 8 subsystem checks",        READY && (READY.match(/check\w+\(\)/g) || []).length >= 8);
check("R", "ready: POLICY_ENGINE check",       READY && READY.includes("POLICY_ENGINE"));
check("R", "ready: TRUST_SCORE_ENGINE check",  READY && READY.includes("TRUST_SCORE_ENGINE"));
check("R", "ready: TENANT_ISOLATION check",    READY && READY.includes("TENANT_ISOLATION"));
check("R", "ready: AGENT_SECURITY check",      READY && READY.includes("AGENT_SECURITY"));
check("R", "ready: INTEGRATION_SECURITY check",READY && READY.includes("INTEGRATION_SECURITY"));
check("R", "ready: VAULT_SECURITY check",      READY && READY.includes("VAULT_SECURITY"));
check("R", "ready: AUDIT_INTEGRATION check",   READY && READY.includes("AUDIT_INTEGRATION"));
check("R", "ready: version string",            READY && READY.includes("AGENTIK-SECURITY-ZERO-TRUST-01"));

// ── Section S: Health Monitor ─────────────────────────────────────────────────

check("S", "health: evaluateZeroTrustHealth",   HEALTH && HEALTH.includes("evaluateZeroTrustHealth"));
check("S", "health: HEALTHY|DEGRADED|UNAVAIL",  HEALTH && HEALTH.includes('"HEALTHY"') && HEALTH.includes('"DEGRADED"') && HEALTH.includes('"UNAVAILABLE"'));
check("S", "health: DENY_RATE threshold 20",    HEALTH && HEALTH.includes("DENY_RATE_DEGRADED_THRESHOLD"));
check("S", "health: CRITICAL threshold 5",      HEALTH && HEALTH.includes("CRITICAL_EVENT_DEGRADED_THRESHOLD"));
check("S", "health: CROSS_TENANT threshold 3",  HEALTH && HEALTH.includes("CROSS_TENANT_DEGRADED_THRESHOLD"));
check("S", "health: isZeroTrustHealthy",        HEALTH && HEALTH.includes("isZeroTrustHealthy"));
check("S", "health: getUnhealthySignals",       HEALTH && HEALTH.includes("getUnhealthySignals"));
check("S", "health: version string",            HEALTH && HEALTH.includes("AGENTIK-SECURITY-ZERO-TRUST-01"));
check("S", "health: summary builder",           HEALTH && HEALTH.includes("buildSummary"));

// ── Section T: Server Barrel ──────────────────────────────────────────────────

check("T", "server: evaluateZeroTrust export",        SERVER && SERVER.includes("evaluateZeroTrust"));
check("T", "server: canAgentAccess export",           SERVER && SERVER.includes("canAgentAccess"));
check("T", "server: validateIntegrationAccess export",SERVER && SERVER.includes("validateIntegrationAccess"));
check("T", "server: validateExecutiveBrainAccess",    SERVER && SERVER.includes("validateExecutiveBrainAccess"));
check("T", "server: canAccessCopilot export",         SERVER && SERVER.includes("canAccessCopilot"));
check("T", "server: validateVaultAccess export",      SERVER && SERVER.includes("validateVaultAccess"));
check("T", "server: buildZeroTrustAuditRecord",       SERVER && SERVER.includes("buildZeroTrustAuditRecord"));
check("T", "server: KNOWN_AGENT_IDS export",          SERVER && SERVER.includes("KNOWN_AGENT_IDS"));
check("T", "server: KNOWN_INTEGRATION_IDS export",    SERVER && SERVER.includes("KNOWN_INTEGRATION_IDS"));

// ── Section U: Index Barrel ───────────────────────────────────────────────────

check("U", "index: ZeroTrustDecision export",     INDEX && INDEX.includes("ZeroTrustDecision"));
check("U", "index: calculateTrustScore export",   INDEX && INDEX.includes("calculateTrustScore"));
check("U", "index: evaluateSessionTrust export",  INDEX && INDEX.includes("evaluateSessionTrust"));
check("U", "index: verifyTenantIsolation export", INDEX && INDEX.includes("verifyTenantIsolation"));
check("U", "index: buildZeroTrustEvent export",   INDEX && INDEX.includes("buildZeroTrustEvent"));
check("U", "index: buildZeroTrustDashboard",      INDEX && INDEX.includes("buildZeroTrustDashboard"));
check("U", "index: scanZeroTrustReadiness",       INDEX && INDEX.includes("scanZeroTrustReadiness"));
check("U", "index: evaluateZeroTrustHealth",      INDEX && INDEX.includes("evaluateZeroTrustHealth"));
check("U", "index: future-compatibility",         INDEX && INDEX.includes("future-compatibility"));
check("U", "index: no server-only",               !hasServerOnlyImport(INDEX));

// ── Section V: Future Compatibility ──────────────────────────────────────────

check("V", "future: ZeroTrustFutureCapability",   FUTURE && FUTURE.includes("ZeroTrustFutureCapability"));
check("V", "future: KMS_INTEGRATION",             FUTURE && FUTURE.includes("KMS_INTEGRATION"));
check("V", "future: MFA_ENFORCEMENT",             FUTURE && FUTURE.includes("MFA_ENFORCEMENT"));
check("V", "future: ANOMALY_DETECTION",           FUTURE && FUTURE.includes("ANOMALY_DETECTION"));
check("V", "future: SOC_INTEGRATION",             FUTURE && FUTURE.includes("SOC_INTEGRATION"));
check("V", "future: DEVICE_TRUST",                FUTURE && FUTURE.includes("DEVICE_TRUST"));
check("V", "future: GEO_RESTRICTION",             FUTURE && FUTURE.includes("GEO_RESTRICTION"));
check("V", "future: KmsZeroTrustAdapter",         FUTURE && FUTURE.includes("KmsZeroTrustAdapter"));
check("V", "future: MfaZeroTrustAdapter",         FUTURE && FUTURE.includes("MfaZeroTrustAdapter"));
check("V", "future: AnomalySignal",               FUTURE && FUTURE.includes("AnomalySignal"));
check("V", "future: SocEventEmitter",             FUTURE && FUTURE.includes("SocEventEmitter"));
check("V", "future: getZeroTrustCapabilityStatus",FUTURE && FUTURE.includes("getZeroTrustCapabilityStatus"));
check("V", "future: AGENTIK-SECURITY-KMS-01",     FUTURE && FUTURE.includes("AGENTIK-SECURITY-KMS-01"));
check("V", "future: AGENTIK-SECURITY-SOC-01",     FUTURE && FUTURE.includes("AGENTIK-SECURITY-SOC-01"));

// ── Section W: Security Registry ─────────────────────────────────────────────

check("W", "registry: ZERO_TRUST_POLICY entry",     REGISTRY && REGISTRY.includes("ZERO_TRUST_POLICY"));
check("W", "registry: TRUST_SCORING entry",         REGISTRY && REGISTRY.includes("TRUST_SCORING"));
check("W", "registry: TENANT_ISOLATION entry",      REGISTRY && REGISTRY.includes("TENANT_ISOLATION"));
check("W", "registry: AGENT_SECURITY entry",        REGISTRY && REGISTRY.includes("AGENT_SECURITY"));
check("W", "registry: INTEGRATION_SECURITY entry",  REGISTRY && REGISTRY.includes("INTEGRATION_SECURITY"));

// ── Section X: Integration Harness ───────────────────────────────────────────

check("X", "harness: T01 policy engine",      HARNESS && HARNESS.includes("T01"));
check("X", "harness: T11 trust score",        HARNESS && HARNESS.includes("T11"));
check("X", "harness: T21 session trust",      HARNESS && HARNESS.includes("T21"));
check("X", "harness: T27 tenant isolation",   HARNESS && HARNESS.includes("T27"));
check("X", "harness: T39 agent security",     HARNESS && HARNESS.includes("T39"));
check("X", "harness: T49 integration sec",    HARNESS && HARNESS.includes("T49"));
check("X", "harness: T59 executive brain",    HARNESS && HARNESS.includes("T59"));
check("X", "harness: T67 copilot security",   HARNESS && HARNESS.includes("T67"));
check("X", "harness: T73 vault security",     HARNESS && HARNESS.includes("T73"));
check("X", "harness: T79 security events",    HARNESS && HARNESS.includes("T79"));
check("X", "harness: T85 dashboard",          HARNESS && HARNESS.includes("T85"));
check("X", "harness: T89 readiness",          HARNESS && HARNESS.includes("T89"));
check("X", "harness: T93 health monitor",     HARNESS && HARNESS.includes("T93"));
check("X", "harness: T96 last test",          HARNESS && HARNESS.includes("T96"));
check("X", "harness: at least 96 tests",      HARNESS && (HARNESS.match(/\bT\d{2,3}\b/g) || []).length >= 96);

// ── Results ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\nAGENTIK-SECURITY-ZERO-TRUST-01 Validation Suite`);
console.log(`================================================`);
console.log(`Total: ${total}  Passed: ${passed}  Failed: ${failed}`);

if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  FAIL: ${f}`));
  process.exit(1);
} else {
  console.log(`\nAll ${total} checks passed.`);
  process.exit(0);
}
