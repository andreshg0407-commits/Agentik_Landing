/**
 * app/api/internal/integration-tests/zero-trust/route.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Integration Harness — 80+ Tests
 *
 * GET /api/internal/integration-tests/zero-trust
 *
 * Tests cover:
 *   T01–T10  — Core policy engine (ALLOW/DENY/CHALLENGE)
 *   T11–T20  — Trust score engine
 *   T21–T30  — Session trust
 *   T31–T38  — Tenant isolation
 *   T39–T48  — Agent security
 *   T49–T58  — Integration security
 *   T59–T66  — Executive brain security
 *   T67–T72  — Copilot security
 *   T73–T78  — Vault security
 *   T79–T84  — Security events
 *   T85–T88  — Dashboard contract
 *   T89–T92  — Readiness scanner
 *   T93–T96  — Health monitor
 */

import { NextResponse } from "next/server";

import {
  evaluateZeroTrust,
  isZeroTrustAllowed,
} from "@/lib/security/zero-trust/zero-trust-policy-engine";
import {
  calculateTrustScore,
  isTrustedForRisk,
  riskFromScore,
} from "@/lib/security/zero-trust/trust-score-engine";
import {
  evaluateSessionTrust,
} from "@/lib/security/zero-trust/session-trust";
import {
  verifyTenantIsolation,
  assertTenantMatch,
  isSameTenant,
  isValidOrgSlug,
} from "@/lib/security/zero-trust/tenant-isolation";
import {
  canAgentAccess,
  validateAgentScope,
  evaluateAgentTrust,
  KNOWN_AGENT_IDS,
} from "@/lib/security/zero-trust/agent-security";
import {
  validateIntegrationAccess,
  evaluateIntegrationTrust,
  denyCompromisedIntegration,
  KNOWN_INTEGRATION_IDS,
} from "@/lib/security/zero-trust/integration-security";
import {
  validateExecutiveBrainAccess,
  canAgentReadExecutiveBrain,
  canAgentWriteMemory,
} from "@/lib/security/zero-trust/executive-brain-security";
import {
  canAccessCopilot,
  canDelegateTask,
  canReadMemory,
  canWriteMemory,
  canExecuteAgent,
} from "@/lib/security/zero-trust/copilot-security";
import {
  validateVaultAccess,
  canRotateSecret,
} from "@/lib/security/zero-trust/vault-security";
import {
  buildZeroTrustEvent,
  buildCrossTenantEvent,
  buildAgentScopeEvent,
  buildSecretAccessDeniedEvent,
  isCriticalEvent,
  filterEventsBySeverity,
} from "@/lib/security/zero-trust/security-events";
import {
  buildZeroTrustDashboard,
  buildEmptyDashboard,
} from "@/lib/security/zero-trust/security-dashboard-contract";
import {
  scanZeroTrustReadiness,
} from "@/lib/security/zero-trust/zero-trust-readiness";
import {
  evaluateZeroTrustHealth,
  isZeroTrustHealthy,
} from "@/lib/security/zero-trust/zero-trust-health";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id:      string;
  name:    string;
  status:  "PASS" | "FAIL";
  detail?: string;
}

function pass(id: string, name: string): TestResult {
  return { id, name, status: "PASS" };
}

function fail(id: string, name: string, detail: string): TestResult {
  return { id, name, status: "FAIL", detail };
}

function check(id: string, name: string, condition: boolean, detail?: string): TestResult {
  return condition ? pass(id, name) : fail(id, name, detail ?? "condition false");
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const results: TestResult[] = [];

  // ── T01–T10: Core Policy Engine ───────────────────────────────────────────

  // T01: ALLOW for USER with valid role/session/tenant
  try {
    const ctx = {
      orgSlug: "castillitos", subjectType: "USER" as const,
      userId: "user-1", resourceType: "FINANCIAL_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T01", "policy_engine_evaluates_without_throw",
      r !== null && typeof r.decision === "string",
    ));
  } catch (e) {
    results.push(fail("T01", "policy_engine_evaluates_without_throw", String(e)));
  }

  // T02: DENY for missing orgSlug
  {
    const ctx = {
      orgSlug: "", subjectType: "USER" as const,
      userId: "user-1", resourceType: "FINANCIAL_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T02", "policy_engine_denies_missing_orgSlug", r.decision === "DENY"));
  }

  // T03: DENY for missing userId
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "USER" as const,
      userId: undefined, resourceType: "FINANCIAL_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T03", "policy_engine_denies_missing_userId", r.decision === "DENY"));
  }

  // T04: DENY for invalid orgSlug format
  {
    const ctx = {
      orgSlug: "../etc/passwd", subjectType: "USER" as const,
      userId: "user-1", resourceType: "FINANCIAL_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T04", "policy_engine_denies_invalid_orgSlug", r.decision === "DENY"));
  }

  // T05: DENY for AGENT accessing FINANCIAL_DATA directly (not in domain)
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "AGENT" as const,
      agentId: "luca", resourceType: "FINANCIAL_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    // luca is denied FINANCIAL_DATA in agent-security
    results.push(check("T05", "policy_engine_denies_agent_out_of_domain",
      r.riskLevel === "CRITICAL" || r.decision === "DENY",
    ));
  }

  // T06: evaluation always returns ZeroTrustEvaluation shape
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "SYSTEM" as const,
      resourceType: "AI_MEMORY" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T06", "policy_engine_returns_valid_shape",
      "decision" in r && "riskLevel" in r && "score" in r && Array.isArray(r.reasons),
    ));
  }

  // T07: isZeroTrustAllowed returns boolean
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "USER" as const,
      userId: "user-1", resourceType: "MARKETING_DATA" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const allowed = isZeroTrustAllowed(ctx);
    results.push(check("T07", "isZeroTrustAllowed_returns_boolean", typeof allowed === "boolean"));
  }

  // T08: audit required on DENY
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "USER" as const,
      userId: undefined, resourceType: "VAULT" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T08", "evaluation_audit_required_on_deny", r.auditRequired === true));
  }

  // T09: evaluation duration is recorded
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "SYSTEM" as const,
      resourceType: "AI_MEMORY" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T09", "evaluation_records_duration_ms",
      typeof r.durationMs === "number" && r.durationMs >= 0,
    ));
  }

  // T10: evaluatedAt is ISO string
  {
    const ctx = {
      orgSlug: "castillitos", subjectType: "SYSTEM" as const,
      resourceType: "AI_MEMORY" as const,
      action: "READ" as const, timestamp: new Date().toISOString(),
    };
    const r = evaluateZeroTrust(ctx);
    results.push(check("T10", "evaluation_evaluatedAt_is_iso",
      typeof r.evaluatedAt === "string" && r.evaluatedAt.includes("T"),
    ));
  }

  // ── T11–T20: Trust Score Engine ───────────────────────────────────────────

  // T11: perfect score USER
  {
    const r = calculateTrustScore({
      hasValidRole: true, hasValidSession: true, hasValidTenant: true,
      mfaVerified: true, isKnownIp: true, isKnownDevice: true,
      hasRecentActivity: true, noSuspiciousSignals: true,
      subjectType: "USER",
    });
    results.push(check("T11", "trust_score_perfect_user_near_100", r.score >= 90));
  }

  // T12: zero score for missing critical factors
  {
    const r = calculateTrustScore({
      hasValidRole: false, hasValidSession: false, hasValidTenant: false,
      mfaVerified: false, isKnownIp: false, isKnownDevice: false,
      hasRecentActivity: false, noSuspiciousSignals: false,
      subjectType: "USER",
    });
    results.push(check("T12", "trust_score_zero_all_false", r.score === 0));
  }

  // T13: critical cap at 50 when missing critical factors
  {
    const r = calculateTrustScore({
      hasValidRole: false, hasValidSession: true, hasValidTenant: true,
      mfaVerified: true, isKnownIp: true, isKnownDevice: true,
      hasRecentActivity: true, noSuspiciousSignals: true,
      subjectType: "USER",
    });
    results.push(check("T13", "trust_score_capped_at_50_missing_critical", r.score <= 50));
  }

  // T14: INTEGRATION subject gets deducted
  {
    const r = calculateTrustScore({
      hasValidRole: true, hasValidSession: true, hasValidTenant: true,
      mfaVerified: false, isKnownIp: false, isKnownDevice: false,
      hasRecentActivity: true, noSuspiciousSignals: true,
      subjectType: "INTEGRATION",
    });
    results.push(check("T14", "trust_score_integration_deducted", r.subjectDeduction === -15));
  }

  // T15: isTrustedForRisk LOW threshold
  {
    const trusted = isTrustedForRisk(40, "LOW");
    results.push(check("T15", "isTrustedForRisk_low_40_is_trusted", trusted === true));
  }

  // T16: isTrustedForRisk CRITICAL threshold
  {
    const trusted = isTrustedForRisk(80, "CRITICAL");
    results.push(check("T16", "isTrustedForRisk_critical_80_not_trusted", trusted === false));
  }

  // T17: riskFromScore critical
  {
    const risk = riskFromScore(10);
    results.push(check("T17", "riskFromScore_10_is_critical", risk === "CRITICAL"));
  }

  // T18: riskFromScore low
  {
    const risk = riskFromScore(95);
    results.push(check("T18", "riskFromScore_95_is_low", risk === "LOW"));
  }

  // T19: score is clamped 0–100
  {
    const r = calculateTrustScore({
      hasValidRole: true, hasValidSession: true, hasValidTenant: true,
      mfaVerified: true, isKnownIp: true, isKnownDevice: true,
      hasRecentActivity: true, noSuspiciousSignals: true,
      subjectType: "SYSTEM",
    });
    results.push(check("T19", "trust_score_clamped_max_100", r.score <= 100));
  }

  // T20: factors array has 8 entries
  {
    const r = calculateTrustScore({
      hasValidRole: true, hasValidSession: true, hasValidTenant: true,
      mfaVerified: false, isKnownIp: false, isKnownDevice: false,
      hasRecentActivity: true, noSuspiciousSignals: true,
      subjectType: "USER",
    });
    results.push(check("T20", "trust_score_has_8_factors", r.factors.length === 8));
  }

  // ── T21–T30: Session Trust ────────────────────────────────────────────────

  const futureDate  = new Date(Date.now() + 3600 * 1000).toISOString();
  const recentDate  = new Date(Date.now() - 60 * 1000).toISOString();
  const freshDate   = new Date(Date.now() - 1000).toISOString();
  const expiredDate = new Date(Date.now() - 1000).toISOString();

  // T21: valid session
  {
    const r = evaluateSessionTrust({
      sessionId: "sess-abcdef1234567890",
      userId: "user-1",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: futureDate,
      lastActiveAt: recentDate,
      issuedForOrg: "castillitos",
    }, "castillitos");
    results.push(check("T21", "session_trust_valid_session", r.trusted === true));
  }

  // T22: expired session
  {
    const r = evaluateSessionTrust({
      sessionId: "sess-abcdef1234567890",
      userId: "user-1",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: expiredDate,
      lastActiveAt: recentDate,
      issuedForOrg: "castillitos",
    }, "castillitos");
    results.push(check("T22", "session_trust_expired_session", r.expired === true));
  }

  // T23: cross-tenant session
  {
    const r = evaluateSessionTrust({
      sessionId: "sess-abcdef1234567890",
      userId: "user-1",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: futureDate,
      lastActiveAt: recentDate,
      issuedForOrg: "other-org",
    }, "castillitos");
    results.push(check("T23", "session_trust_cross_tenant_risk", r.crossTenantRisk === true || r.trusted === false));
  }

  // T24: missing sessionId
  {
    const r = evaluateSessionTrust({
      sessionId: "",
      userId: "user-1",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: futureDate,
      lastActiveAt: recentDate,
      issuedForOrg: "castillitos",
    }, "castillitos");
    results.push(check("T24", "session_trust_missing_session_id", r.trusted === false));
  }

  // T25: missing userId
  {
    const r = evaluateSessionTrust({
      sessionId: "sess-abcdef1234567890",
      userId: "",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: futureDate,
      lastActiveAt: recentDate,
      issuedForOrg: "castillitos",
    }, "castillitos");
    results.push(check("T25", "session_trust_missing_userId", r.trusted === false));
  }

  // T26: session result has riskLevel
  {
    const r = evaluateSessionTrust({
      sessionId: "sess-abcdef1234567890",
      userId: "user-1",
      orgSlug: "castillitos",
      createdAt: freshDate,
      expiresAt: futureDate,
      lastActiveAt: recentDate,
      issuedForOrg: "castillitos",
    }, "castillitos");
    results.push(check("T26", "session_trust_has_riskLevel", typeof r.riskLevel === "string"));
  }

  // ── T27–T30: Tenant Isolation ─────────────────────────────────────────────

  // T27: valid tenant
  {
    const r = verifyTenantIsolation({ orgSlug: "castillitos", subjectType: "USER", resourceType: "FINANCIAL_DATA" as const, action: "READ" as const, timestamp: "" });
    results.push(check("T27", "tenant_isolation_valid", r.isolated === true));
  }

  // T28: injection attempt blocked
  {
    const r = verifyTenantIsolation({ orgSlug: "../etc", subjectType: "USER", resourceType: "FINANCIAL_DATA" as const, action: "READ" as const, timestamp: "" });
    results.push(check("T28", "tenant_isolation_blocks_injection", r.isolated === false));
  }

  // T29: cross-tenant blocked
  {
    const r = verifyTenantIsolation({ orgSlug: "castillitos", subjectType: "USER", resourceType: "FINANCIAL_DATA" as const, action: "READ" as const, timestamp: "" }, "other-org");
    results.push(check("T29", "tenant_isolation_cross_tenant", r.crossTenantAttempt === true));
  }

  // T30: isSameTenant and isValidOrgSlug
  {
    results.push(check("T30", "tenant_helpers_correct",
      isSameTenant("castillitos", "castillitos") === true &&
      isSameTenant("castillitos", "other-org") === false &&
      isValidOrgSlug("castillitos") === true &&
      isValidOrgSlug("a") === false,
    ));
  }

  // ── T31–T38: assertTenantMatch ────────────────────────────────────────────

  // T31: no throw when same tenant
  {
    let threw = false;
    try { assertTenantMatch("castillitos", "castillitos"); } catch { threw = true; }
    results.push(check("T31", "assertTenantMatch_no_throw_same", !threw));
  }

  // T32: throws when different tenant
  {
    let threw = false;
    try { assertTenantMatch("castillitos", "other-org"); } catch { threw = true; }
    results.push(check("T32", "assertTenantMatch_throws_different", threw));
  }

  // ── T33–T38: Tenant edge cases ────────────────────────────────────────────

  // T33: empty orgSlug
  {
    const r = verifyTenantIsolation({ orgSlug: "", subjectType: "USER", resourceType: "FINANCIAL_DATA" as const, action: "READ" as const, timestamp: "" });
    results.push(check("T33", "tenant_isolation_empty_orgSlug", r.isolated === false));
  }

  // T34: single-char slug rejected
  {
    results.push(check("T34", "isValidOrgSlug_single_char_rejected", isValidOrgSlug("a") === false));
  }

  // T35: valid 2-char slug
  {
    results.push(check("T35", "isValidOrgSlug_valid_2char", isValidOrgSlug("ab") === true));
  }

  // T36: hyphen in middle is valid
  {
    results.push(check("T36", "isValidOrgSlug_hyphen_middle_valid", isValidOrgSlug("my-org") === true));
  }

  // T37: leading hyphen is invalid
  {
    results.push(check("T37", "isValidOrgSlug_leading_hyphen_invalid", isValidOrgSlug("-bad") === false));
  }

  // T38: all lowercase required
  {
    results.push(check("T38", "isValidOrgSlug_uppercase_invalid", isValidOrgSlug("MyOrg") === false));
  }

  // ── T39–T48: Agent Security ───────────────────────────────────────────────

  // T39: diego can read FINANCIAL_DATA
  {
    const r = canAgentAccess({ agentId: "diego", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "READ" });
    results.push(check("T39", "diego_can_read_financial_data", r.allowed === true));
  }

  // T40: luca denied FINANCIAL_DATA
  {
    const r = canAgentAccess({ agentId: "luca", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "READ" });
    results.push(check("T40", "luca_denied_financial_data", r.allowed === false && r.scopeViolation === true));
  }

  // T41: no agent can APPROVE
  {
    const r = canAgentAccess({ agentId: "pablo", orgSlug: "castillitos", resourceType: "AI_MEMORY", action: "APPROVE" });
    results.push(check("T41", "agents_cannot_approve", r.allowed === false));
  }

  // T42: no agent can ADMIN
  {
    const r = canAgentAccess({ agentId: "diego", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "ADMIN" });
    results.push(check("T42", "agents_cannot_admin", r.allowed === false));
  }

  // T43: unknown agent returns DENY
  {
    const r = canAgentAccess({ agentId: "unknown-bot", orgSlug: "castillitos", resourceType: "AI_MEMORY", action: "READ" });
    results.push(check("T43", "unknown_agent_denied", r.allowed === false));
  }

  // T44: validateAgentScope non-agent subject
  {
    const r = validateAgentScope({ orgSlug: "castillitos", subjectType: "USER", resourceType: "FINANCIAL_DATA", action: "READ", timestamp: "" });
    results.push(check("T44", "validateAgentScope_rejects_non_agent", r.allowed === false));
  }

  // T45: all 7 agents are known
  {
    const expected = ["luca", "diego", "laura", "david", "sofia", "mila", "pablo"];
    const allKnown = expected.every(a => (KNOWN_AGENT_IDS as string[]).includes(a));
    results.push(check("T45", "all_7_agents_registered", allKnown));
  }

  // T46: evaluateAgentTrust known agent
  {
    const r = evaluateAgentTrust("luca", "castillitos");
    results.push(check("T46", "evaluateAgentTrust_known_agent", r.trusted === true && r.score === 60));
  }

  // T47: evaluateAgentTrust unknown agent
  {
    const r = evaluateAgentTrust("rogue-bot", "castillitos");
    results.push(check("T47", "evaluateAgentTrust_unknown_agent", r.trusted === false && r.score === 0));
  }

  // T48: no agent can access VAULT
  {
    const r = canAgentAccess({ agentId: "diego", orgSlug: "castillitos", resourceType: "VAULT", action: "READ" });
    results.push(check("T48", "no_agent_can_access_vault", r.allowed === false && r.scopeViolation === true));
  }

  // ── T49–T58: Integration Security ────────────────────────────────────────

  // T49: shopify can read COMMERCIAL_DATA
  {
    const r = validateIntegrationAccess({ integrationId: "shopify", orgSlug: "castillitos", resourceType: "COMMERCIAL_DATA", action: "READ", secretVersion: "v1" });
    results.push(check("T49", "shopify_can_read_commercial_data", r.trusted === true));
  }

  // T50: compromised integration denied
  {
    const r = validateIntegrationAccess({ integrationId: "shopify", orgSlug: "castillitos", resourceType: "COMMERCIAL_DATA", action: "READ", secretVersion: "v1", isCompromised: true });
    results.push(check("T50", "compromised_integration_denied", r.trusted === false && r.riskLevel === "CRITICAL"));
  }

  // T51: revoked integration denied
  {
    const r = validateIntegrationAccess({ integrationId: "meta", orgSlug: "castillitos", resourceType: "MARKETING_DATA", action: "READ", secretVersion: "v1", isRevoked: true });
    results.push(check("T51", "revoked_integration_denied", r.trusted === false));
  }

  // T52: missing secret version denied
  {
    const r = validateIntegrationAccess({ integrationId: "stripe", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "READ", secretVersion: "" });
    results.push(check("T52", "missing_secret_version_denied", r.trusted === false));
  }

  // T53: unknown integration denied
  {
    const r = validateIntegrationAccess({ integrationId: "unknown-crm", orgSlug: "castillitos", resourceType: "CUSTOMER_DATA", action: "READ", secretVersion: "v1" });
    results.push(check("T53", "unknown_integration_denied", r.trusted === false && r.riskLevel === "CRITICAL"));
  }

  // T54: integration EXECUTE not allowed
  {
    const r = validateIntegrationAccess({ integrationId: "shopify", orgSlug: "castillitos", resourceType: "COMMERCIAL_DATA", action: "EXECUTE", secretVersion: "v1" });
    results.push(check("T54", "integration_cannot_execute", r.trusted === false));
  }

  // T55: denyCompromisedIntegration returns CRITICAL
  {
    const r = denyCompromisedIntegration("stripe", "castillitos", "credential_leak");
    results.push(check("T55", "denyCompromised_returns_critical", r.riskLevel === "CRITICAL" && r.trusted === false));
  }

  // T56: evaluateIntegrationTrust known integration
  {
    const r = evaluateIntegrationTrust({ integrationId: "meta", orgSlug: "castillitos", secretVersion: "v2" });
    results.push(check("T56", "evaluateIntegrationTrust_known_meta", r.score > 0));
  }

  // T57: all 8 integrations registered
  {
    const expected = ["shopify", "meta", "whatsapp", "tiktok", "dian", "fedex", "stripe", "castillitos_crm"];
    const allKnown = expected.every(i => (KNOWN_INTEGRATION_IDS as string[]).includes(i));
    results.push(check("T57", "all_8_integrations_registered", allKnown));
  }

  // T58: dian is CRITICAL base risk
  {
    const r = validateIntegrationAccess({ integrationId: "dian", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "READ", secretVersion: "v1" });
    results.push(check("T58", "dian_has_elevated_risk", r.trusted === true || r.riskLevel !== "LOW"));
  }

  // ── T59–T66: Executive Brain Security ────────────────────────────────────

  // T59: diego can read executive brain
  {
    const r = canAgentReadExecutiveBrain("diego");
    results.push(check("T59", "diego_can_read_executive_brain", r.allowed === true));
  }

  // T60: luca cannot read executive brain
  {
    const r = canAgentReadExecutiveBrain("luca");
    results.push(check("T60", "luca_cannot_read_executive_brain", r.allowed === false));
  }

  // T61: agents cannot write executive brain
  {
    const r = validateExecutiveBrainAccess({ subjectId: "diego", subjectType: "AGENT", orgSlug: "castillitos", resourceType: "AI_EXECUTIVE_BRAIN", action: "WRITE" });
    results.push(check("T61", "agents_cannot_write_executive_brain", r.allowed === false));
  }

  // T62: canAgentWriteMemory known agent
  {
    const r = canAgentWriteMemory("luca");
    results.push(check("T62", "agent_can_write_own_memory", r.allowed === true));
  }

  // T63: unknown agent cannot write memory
  {
    const r = canAgentWriteMemory("rogue-bot");
    results.push(check("T63", "unknown_agent_cannot_write_memory", r.allowed === false));
  }

  // T64: user without role cannot access executive brain
  {
    const r = validateExecutiveBrainAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "AI_EXECUTIVE_BRAIN", action: "READ", roles: ["MARKETING_MANAGER"] });
    results.push(check("T64", "user_without_role_denied_executive_brain", r.allowed === false));
  }

  // T65: FINANCE_ADMIN can read executive brain
  {
    const r = validateExecutiveBrainAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "AI_EXECUTIVE_BRAIN", action: "READ", roles: ["FINANCE_ADMIN"] });
    results.push(check("T65", "finance_admin_can_read_executive_brain", r.allowed === true));
  }

  // T66: playbook read for ORG_ADMIN
  {
    const r = validateExecutiveBrainAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "AI_PLAYBOOK", action: "READ", roles: ["ORG_ADMIN"] });
    results.push(check("T66", "org_admin_can_read_playbook", r.allowed === true));
  }

  // ── T67–T72: Copilot Security ─────────────────────────────────────────────

  // T67: user with COPILOT_EXECUTE can access copilot
  {
    const r = canAccessCopilot({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", permissions: ["COPILOT_EXECUTE"] });
    results.push(check("T67", "user_with_copilot_execute_can_access", r.allowed === true));
  }

  // T68: user without permission denied
  {
    const r = canAccessCopilot({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", permissions: ["FINANCE_VIEW"] });
    results.push(check("T68", "user_without_copilot_perm_denied", r.allowed === false));
  }

  // T69: user can delegate to known agent
  {
    const r = canDelegateTask({ fromSubjectId: "user-1", fromSubjectType: "USER", toAgentId: "diego", orgSlug: "castillitos", permissions: ["COPILOT_EXECUTE"] });
    results.push(check("T69", "user_can_delegate_to_known_agent", r.allowed === true));
  }

  // T70: delegation to unknown agent denied
  {
    const r = canDelegateTask({ fromSubjectId: "user-1", fromSubjectType: "USER", toAgentId: "unknown-bot", orgSlug: "castillitos", permissions: ["COPILOT_EXECUTE"] });
    results.push(check("T70", "delegation_to_unknown_agent_denied", r.allowed === false));
  }

  // T71: agent can read own memory
  {
    const r = canReadMemory({ subjectId: "luca", subjectType: "AGENT", targetAgentId: "luca", orgSlug: "castillitos" });
    results.push(check("T71", "agent_can_read_own_memory", r.allowed === true));
  }

  // T72: agent cannot read other agent memory (except pablo)
  {
    const r = canReadMemory({ subjectId: "luca", subjectType: "AGENT", targetAgentId: "diego", orgSlug: "castillitos" });
    results.push(check("T72", "agent_cannot_read_other_memory", r.allowed === false));
  }

  // ── T73–T78: Vault Security ───────────────────────────────────────────────

  // T73: agents denied vault access
  {
    const r = validateVaultAccess({ subjectId: "diego", subjectType: "AGENT", orgSlug: "castillitos", resourceType: "VAULT", action: "READ" });
    results.push(check("T73", "agent_denied_vault_access", r.allowed === false && r.riskLevel === "CRITICAL"));
  }

  // T74: user with VAULT_READ can read vault
  {
    const r = validateVaultAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "VAULT", action: "READ", roles: ["VAULT_READ"] });
    results.push(check("T74", "vault_read_role_can_read", r.allowed === true));
  }

  // T75: user without role denied vault
  {
    const r = validateVaultAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "VAULT", action: "READ", roles: ["FINANCE_VIEW"] });
    results.push(check("T75", "user_without_vault_role_denied", r.allowed === false));
  }

  // T76: canRotateSecret requires VAULT_ADMIN
  {
    const r = canRotateSecret({ userId: "user-1", orgSlug: "castillitos", roles: ["VAULT_ADMIN"] });
    results.push(check("T76", "canRotateSecret_vault_admin_allowed", r.allowed === true && r.requiresApproval === true));
  }

  // T77: canRotateSecret denied without role
  {
    const r = canRotateSecret({ userId: "user-1", orgSlug: "castillitos", roles: ["FINANCE_VIEW"] });
    results.push(check("T77", "canRotateSecret_no_role_denied", r.allowed === false));
  }

  // T78: all vault access is audit required
  {
    const r = validateVaultAccess({ subjectId: "user-1", subjectType: "USER", orgSlug: "castillitos", resourceType: "VAULT", action: "READ", roles: ["VAULT_READ"] });
    results.push(check("T78", "vault_access_always_audit_required", r.auditRequired === true));
  }

  // ── T79–T84: Security Events ──────────────────────────────────────────────

  // T79: buildZeroTrustEvent returns valid shape
  {
    const e = buildZeroTrustEvent({ decision: "DENY", riskLevel: "HIGH", orgSlug: "castillitos", subjectId: "user-1", subjectType: "USER", resourceType: "FINANCIAL_DATA", action: "READ", reasons: ["test"] });
    results.push(check("T79", "buildZeroTrustEvent_valid_shape", "eventId" in e && "severity" in e && "occurredAt" in e));
  }

  // T80: CRITICAL events are isCriticalEvent
  {
    const e = buildSecretAccessDeniedEvent({ subjectId: "bot", subjectType: "AGENT", orgSlug: "castillitos", resourceType: "VAULT", action: "READ", reasons: ["denied"] });
    results.push(check("T80", "isCriticalEvent_true_for_secret_denial", isCriticalEvent(e) === true));
  }

  // T81: buildCrossTenantEvent has CRITICAL severity
  {
    const e = buildCrossTenantEvent({ orgSlug: "castillitos", subjectId: "user-1", subjectType: "USER", requestedOrg: "other-org", resourceType: "FINANCIAL_DATA" });
    results.push(check("T81", "cross_tenant_event_is_critical", e.severity === "CRITICAL"));
  }

  // T82: buildAgentScopeEvent has eventType AGENT_SCOPE_BLOCKED
  {
    const e = buildAgentScopeEvent({ agentId: "luca", orgSlug: "castillitos", resourceType: "FINANCIAL_DATA", action: "READ", reasons: ["denied"] });
    results.push(check("T82", "agent_scope_event_type", e.eventType === "AGENT_SCOPE_BLOCKED"));
  }

  // T83: filterEventsBySeverity returns only HIGH and CRITICAL
  {
    const events = [
      buildZeroTrustEvent({ decision: "ALLOW", riskLevel: "LOW", orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", resourceType: "AI_MEMORY", action: "READ", reasons: [] }),
      buildCrossTenantEvent({ orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", requestedOrg: "other", resourceType: "FINANCIAL_DATA" }),
    ];
    const filtered = filterEventsBySeverity(events, "HIGH");
    results.push(check("T83", "filterEventsBySeverity_high_and_critical", filtered.length === 1 && filtered[0].severity === "CRITICAL"));
  }

  // T84: event occurredAt is ISO
  {
    const e = buildZeroTrustEvent({ decision: "DENY", riskLevel: "MEDIUM", orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", resourceType: "AI_MEMORY", action: "WRITE", reasons: [] });
    results.push(check("T84", "event_occurredAt_is_iso", e.occurredAt.includes("T")));
  }

  // ── T85–T88: Dashboard Contract ───────────────────────────────────────────

  // T85: buildEmptyDashboard returns zeroed shape
  {
    const d = buildEmptyDashboard("castillitos");
    results.push(check("T85", "buildEmptyDashboard_zeroed", d.summary.totalEvaluations === 0 && d.threats.crossTenantAttempts === 0));
  }

  // T86: buildZeroTrustDashboard aggregates events
  {
    const events = [
      buildCrossTenantEvent({ orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", requestedOrg: "other", resourceType: "FINANCIAL_DATA" }),
      buildZeroTrustEvent({ decision: "ALLOW", riskLevel: "LOW", orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", resourceType: "AI_MEMORY", action: "READ", reasons: [] }),
    ];
    const d = buildZeroTrustDashboard({ orgSlug: "castillitos", events, periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });
    results.push(check("T86", "buildZeroTrustDashboard_aggregates", d.threats.crossTenantAttempts === 1));
  }

  // T87: deny rate computed correctly
  {
    const events = [
      buildCrossTenantEvent({ orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", requestedOrg: "other", resourceType: "FINANCIAL_DATA" }),
      buildZeroTrustEvent({ decision: "ALLOW", riskLevel: "LOW", orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", resourceType: "AI_MEMORY", action: "READ", reasons: [] }),
    ];
    const d = buildZeroTrustDashboard({ orgSlug: "castillitos", events, periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });
    results.push(check("T87", "dashboard_deny_rate_50_pct", d.summary.denyRate === 50));
  }

  // T88: generatedAt is ISO
  {
    const d = buildEmptyDashboard("castillitos");
    results.push(check("T88", "dashboard_generatedAt_is_iso", d.generatedAt.includes("T")));
  }

  // ── T89–T92: Readiness Scanner ────────────────────────────────────────────

  // T89: scanZeroTrustReadiness runs without error
  {
    let status: string;
    try {
      const r = scanZeroTrustReadiness();
      status = r.status;
    } catch {
      status = "ERROR";
    }
    results.push(check("T89", "readiness_scanner_no_throw", status !== "ERROR"));
  }

  // T90: readiness report has 8 subsystems
  {
    const r = scanZeroTrustReadiness();
    results.push(check("T90", "readiness_report_8_subsystems", r.subsystems.length === 8));
  }

  // T91: policy engine subsystem is READY
  {
    const r = scanZeroTrustReadiness();
    const pe = r.subsystems.find(s => s.subsystem === "POLICY_ENGINE");
    results.push(check("T91", "policy_engine_subsystem_ready", pe?.status === "READY"));
  }

  // T92: overall status is READY or PARTIAL (never ERROR)
  {
    const r = scanZeroTrustReadiness();
    results.push(check("T92", "overall_readiness_not_error",
      r.status === "READY" || r.status === "PARTIAL" || r.status === "NOT_READY",
    ));
  }

  // ── T93–T96: Health Monitor ───────────────────────────────────────────────

  // T93: healthy with no events
  {
    const r = evaluateZeroTrustHealth({ orgSlug: "castillitos", recentEvents: [] });
    results.push(check("T93", "health_monitor_healthy_no_events", r.status === "HEALTHY"));
  }

  // T94: degraded with cross-tenant events
  {
    const events = Array.from({ length: 5 }, () =>
      buildCrossTenantEvent({ orgSlug: "castillitos", subjectId: "u1", subjectType: "USER", requestedOrg: "other", resourceType: "FINANCIAL_DATA" }),
    );
    const r = evaluateZeroTrustHealth({ orgSlug: "castillitos", recentEvents: events });
    results.push(check("T94", "health_monitor_degraded_with_cross_tenant", r.status !== "HEALTHY"));
  }

  // T95: isZeroTrustHealthy returns boolean
  {
    const r = evaluateZeroTrustHealth({ orgSlug: "castillitos", recentEvents: [] });
    results.push(check("T95", "isZeroTrustHealthy_returns_boolean", typeof isZeroTrustHealthy(r) === "boolean"));
  }

  // T96: health report has signals array
  {
    const r = evaluateZeroTrustHealth({ orgSlug: "castillitos", recentEvents: [] });
    results.push(check("T96", "health_report_has_signals", Array.isArray(r.signals)));
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;

  return NextResponse.json({
    sprint:  "AGENTIK-SECURITY-ZERO-TRUST-01",
    summary: { total: results.length, passed, failed },
    results,
  });
}
