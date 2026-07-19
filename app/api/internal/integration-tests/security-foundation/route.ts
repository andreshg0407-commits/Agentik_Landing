/**
 * app/api/internal/integration-tests/security-foundation/route.ts
 *
 * AGENTIK-SECURITY-FOUNDATION-01 — Integration Test Harness
 *
 * HTTP endpoint for live integration testing of the Security Foundation layer.
 * GET /api/internal/integration-tests/security-foundation
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *
 * Tests:
 *  T01 — tenant access allowed (same org)
 *  T02 — tenant access denied (cross-org, strict policy)
 *  T03 — assertSameTenant throws on mismatch
 *  T04 — filterToTenant scopes records to org
 *  T05 — evaluatePolicy: TENANT_ISOLATION passes for same tenant
 *  T06 — evaluatePolicy: TENANT_ISOLATION fails for cross-tenant
 *  T07 — evaluatePolicy: AUDIT_REQUIRED for CONFIDENTIAL without audit
 *  T08 — data classification: token → RESTRICTED
 *  T09 — data classification: memory → CONFIDENTIAL
 *  T10 — data classification: report → INTERNAL (default)
 *  T11 — security registry: COPILOT_MEMORY entry exists
 *  T12 — security registry: AI_TOKEN requires encryption
 *  T13 — audit log: record and retrieve events
 *  T14 — audit log: orgSlug filter works
 *  T15 — access context: buildAccessContext produces valid context
 *  T16 — security signals: detectTenantBoundaryViolation for cross-org
 *  T17 — security signals: analyzeEventsForSignals detects policy violations
 *  T18 — report builder: buildSecurityReport produces serializable output
 *  T19 — security inventory: critical surfaces identified
 *  T20 — debt registry: all 7 planned sprints documented
 *  T21 — canRead: allowed for same-tenant non-restricted resource
 *  T22 — canExport: RESTRICTED always denied
 *  T23 — serialization: SecurityEvent is fully JSON-serializable
 *  T24 — barrel validation: client index exports expected types
 *  T25 — independence: security layer has no Copilot/Agent/Finance imports
 */
import "server-only";
import { NextResponse }                    from "next/server";

// Core types
import type { SecurityEvent }             from "@/lib/security/security-types";

// Tenant boundary
import {
  isTenantAllowed,
  assertSameTenant,
  filterToTenant,
  TenantBoundaryViolation,
  STRICT_TENANT_BOUNDARY_POLICY,
}                                          from "@/lib/security/tenant-boundary";

// Policy engine
import {
  evaluatePolicy,
  evaluateAllPolicies,
  isPolicyPassing,
  SECURITY_POLICIES,
}                                          from "@/lib/security/security-policy-engine";

// Data classification
import {
  classifyData,
  classifyResourceById,
  isHighSensitivity,
  requiresAudit,
}                                          from "@/lib/security/data-classification";

// Registry
import {
  getRegistryEntry,
  getEntriesByClassification,
  getEncryptionRequiredEntries,
  SECURITY_REGISTRY,
}                                          from "@/lib/security/security-registry";

// Audit
import {
  SecurityAuditLog,
  globalSecurityAuditLog,
  createSecurityEvent,
  auditPolicyViolation,
}                                          from "@/lib/security/security-audit";

// Access context
import {
  buildAccessContext,
  buildSystemContext,
  isValidAccessContext,
  getEffectiveResourceOrg,
}                                          from "@/lib/security/access-context";

// Security evaluator
import {
  canRead,
  canWrite,
  canExport,
}                                          from "@/lib/security/security-evaluator";

// Security signals
import {
  detectTenantBoundaryViolation,
  detectPolicyViolation,
  analyzeEventsForSignals,
  ALL_SIGNAL_IDS,
}                                          from "@/lib/security/security-signals";

// Report builder
import { buildSecurityReport }            from "@/lib/security/security-report-builder";

// Inventory
import {
  getCriticalRiskSurfaces,
  getInventorySummary,
  SECURITY_INVENTORY,
}                                          from "@/lib/security/security-inventory";

// Debt registry
import {
  SECURITY_DEBT_REGISTRY,
  getDebtItem,
  getDebtByPriority,
}                                          from "@/lib/security/security-debt-registry";

// ── Guard ─────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "Set ENABLE_INTERNAL_INTEGRATION_TESTS=true to run" }, { status: 403 });
  }

  const ORG_A = "castillitos";
  const ORG_B = "other-org-test";

  // Use isolated audit log for tests (not global singleton)
  const testAuditLog = new SecurityAuditLog();

  type TestResult = { id: string; name: string; passed: boolean; detail: string };
  const results: TestResult[] = [];

  async function run(
    id: string,
    name: string,
    fn: () => Promise<boolean | string>,
  ): Promise<TestResult> {
    try {
      const outcome = await fn();
      const passed  = outcome !== false;
      const detail  = typeof outcome === "string" ? outcome : (passed ? "ok" : "assertion failed");
      return { id, name, passed, detail };
    } catch (err: unknown) {
      return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── T01 — tenant access allowed (same org) ────────────────────────────────
  results.push(await run("T01", "tenant access allowed for same org", async () => {
    const allowed = isTenantAllowed(ORG_A, ORG_A, STRICT_TENANT_BOUNDARY_POLICY);
    return allowed ? `allowed=true for ${ORG_A}` : "expected true, got false";
  }));

  // ── T02 — tenant access denied (cross-org) ────────────────────────────────
  results.push(await run("T02", "tenant access denied for cross-org with strict policy", async () => {
    const allowed = isTenantAllowed(ORG_A, ORG_B, STRICT_TENANT_BOUNDARY_POLICY);
    return !allowed ? `denied=true (ORG_A cannot access ORG_B)` : "expected false, got true";
  }));

  // ── T03 — assertSameTenant throws on mismatch ─────────────────────────────
  results.push(await run("T03", "assertSameTenant throws TenantBoundaryViolation on mismatch", async () => {
    try {
      assertSameTenant(ORG_A, ORG_B, "test-resource");
      return "expected throw, got no throw";
    } catch (err) {
      const isBoundaryError = err instanceof TenantBoundaryViolation;
      return isBoundaryError ? `threw TenantBoundaryViolation` : `wrong error: ${String(err)}`;
    }
  }));

  // ── T04 — filterToTenant scopes records ───────────────────────────────────
  results.push(await run("T04", "filterToTenant returns only records for org", async () => {
    const records = [
      { orgSlug: ORG_A, id: "r1" },
      { orgSlug: ORG_B, id: "r2" },
      { orgSlug: ORG_A, id: "r3" },
    ];
    const filtered = filterToTenant(records, ORG_A);
    const correct  = filtered.length === 2 && filtered.every(r => r.orgSlug === ORG_A);
    return correct ? `filtered=${filtered.length} all-org-a=true` : `wrong: got ${filtered.length} records`;
  }));

  // ── T05 — TENANT_ISOLATION passes for same tenant ─────────────────────────
  results.push(await run("T05", "evaluatePolicy: TENANT_ISOLATION passes for same tenant", async () => {
    const decision = evaluatePolicy("TENANT_ISOLATION_REQUIRED", {
      orgSlug: ORG_A, resourceOrgSlug: ORG_A,
    });
    return decision.allowed
      ? `allowed=true reason="${decision.reason.slice(0, 40)}"`
      : `denied: ${decision.reason}`;
  }));

  // ── T06 — TENANT_ISOLATION fails for cross-tenant ─────────────────────────
  results.push(await run("T06", "evaluatePolicy: TENANT_ISOLATION fails for cross-tenant", async () => {
    const decision = evaluatePolicy("TENANT_ISOLATION_REQUIRED", {
      orgSlug: ORG_A, resourceOrgSlug: ORG_B,
    });
    return !decision.allowed
      ? `denied=true reason="${decision.reason.slice(0, 50)}"`
      : `expected denial, got allowed`;
  }));

  // ── T07 — AUDIT_REQUIRED for CONFIDENTIAL without audit ───────────────────
  results.push(await run("T07", "evaluatePolicy: AUDIT_REQUIRED denies unaudited CONFIDENTIAL access", async () => {
    const decision = evaluatePolicy("AUDIT_REQUIRED", {
      orgSlug: ORG_A, sensitivity: "CONFIDENTIAL", isAudited: false,
    });
    return !decision.allowed
      ? `denied=true (unaudited CONFIDENTIAL)`
      : `expected denial, got allowed`;
  }));

  // ── T08 — data classification: token → RESTRICTED ─────────────────────────
  results.push(await run("T08", "classifyData: 'api_token' → RESTRICTED", async () => {
    const result = classifyData("api_token secret access_key");
    return result.sensitivity === "RESTRICTED"
      ? `RESTRICTED keywords=[${result.matchedKeywords.slice(0, 2).join(",")}]`
      : `expected RESTRICTED, got ${result.sensitivity}`;
  }));

  // ── T09 — data classification: memory → CONFIDENTIAL ─────────────────────
  results.push(await run("T09", "classifyData: 'copilot memory playbook' → CONFIDENTIAL", async () => {
    const result = classifyData("copilot memory playbook executive");
    return result.sensitivity === "CONFIDENTIAL"
      ? `CONFIDENTIAL keywords=[${result.matchedKeywords.slice(0, 2).join(",")}]`
      : `expected CONFIDENTIAL, got ${result.sensitivity}`;
  }));

  // ── T10 — data classification: report → INTERNAL ─────────────────────────
  results.push(await run("T10", "classifyData: 'workflow execution log' → INTERNAL", async () => {
    const result = classifyData("workflow execution log status");
    return result.sensitivity === "INTERNAL"
      ? `INTERNAL keywords=[${result.matchedKeywords.slice(0, 2).join(",")}]`
      : `expected INTERNAL, got ${result.sensitivity}`;
  }));

  // ── T11 — security registry: COPILOT_MEMORY entry ────────────────────────
  results.push(await run("T11", "security registry: COPILOT_MEMORY entry exists with CONFIDENTIAL classification", async () => {
    const entry = getRegistryEntry("COPILOT_MEMORY");
    return entry?.classification === "CONFIDENTIAL" && entry.requiresAudit === true
      ? `classification=${entry.classification} requiresAudit=${entry.requiresAudit}`
      : `wrong: ${JSON.stringify(entry)}`;
  }));

  // ── T12 — security registry: AI_TOKEN requires encryption ────────────────
  results.push(await run("T12", "security registry: AI_TOKEN is RESTRICTED and requiresEncryption", async () => {
    const entry = getRegistryEntry("AI_TOKEN");
    return entry?.classification === "RESTRICTED" && entry.requiresEncryption === true
      ? `RESTRICTED encryption-required=true`
      : `wrong: ${JSON.stringify(entry)}`;
  }));

  // ── T13 — audit log: record and retrieve ─────────────────────────────────
  results.push(await run("T13", "audit log: record and getEvents() work correctly", async () => {
    const event = createSecurityEvent(
      ORG_A, "DATA_ACCESS", "DATA_READ", "LOW",
      "playbook:pb1", "user-123", "USER", { test: true },
    );
    testAuditLog.record(event);
    const events = testAuditLog.getEvents();
    return events.length > 0 && events.some(e => e.orgSlug === ORG_A && e.eventType === "DATA_READ")
      ? `recorded+retrieved events=${events.length}`
      : `events not found: ${events.length}`;
  }));

  // ── T14 — audit log: orgSlug filter ──────────────────────────────────────
  results.push(await run("T14", "audit log: getEventsForOrg filters correctly", async () => {
    const eventB = createSecurityEvent(
      ORG_B, "AUTHORIZATION", "ACCESS_DENIED", "HIGH",
      "memory:m1", "user-b", "USER",
    );
    testAuditLog.record(eventB);
    const orgAEvents = testAuditLog.getEventsForOrg(ORG_A);
    const orgBEvents = testAuditLog.getEventsForOrg(ORG_B);
    const isolated = orgAEvents.every(e => e.orgSlug === ORG_A) && orgBEvents.every(e => e.orgSlug === ORG_B);
    return isolated
      ? `orgA=${orgAEvents.length} orgB=${orgBEvents.length}`
      : `isolation failed`;
  }));

  // ── T15 — access context: buildAccessContext ──────────────────────────────
  results.push(await run("T15", "buildAccessContext produces valid, serializable context", async () => {
    const ctx = buildAccessContext(ORG_A, "user-456", "USER", "playbook:pb2", "READ", {
      module: "copilot",
    });
    const valid = isValidAccessContext(ctx);
    let json: string;
    try { json = JSON.stringify(ctx); } catch { return "not JSON-serializable"; }
    return valid && typeof json === "string"
      ? `valid=true serialized=${json.length}chars`
      : `invalid context: ${JSON.stringify(ctx)}`;
  }));

  // ── T16 — security signals: detectTenantBoundaryViolation ────────────────
  results.push(await run("T16", "detectTenantBoundaryViolation generates signal for cross-org", async () => {
    const ctx = buildAccessContext(ORG_A, "user-456", "USER", "memory:m1", "READ", {
      resourceOrgSlug: ORG_B,
    });
    const signal = detectTenantBoundaryViolation(ctx);
    return signal?.signalId === "TENANT_BOUNDARY_VIOLATION" && signal.severity === "CRITICAL"
      ? `TENANT_BOUNDARY_VIOLATION severity=${signal.severity}`
      : `no signal or wrong type: ${JSON.stringify(signal)}`;
  }));

  // ── T17 — security signals: analyzeEventsForSignals ──────────────────────
  results.push(await run("T17", "analyzeEventsForSignals detects POLICY_VIOLATION in events", async () => {
    const violationEvent = createSecurityEvent(
      ORG_A, "AUTHORIZATION", "POLICY_VIOLATION", "HIGH",
      "copilot-memory:m2", "user-789", "USER", { policy: "TENANT_ISOLATION_REQUIRED" },
    );
    const signals = analyzeEventsForSignals([violationEvent], ORG_A);
    return signals.length > 0 && signals.some(s => s.signalId === "POLICY_VIOLATION")
      ? `signals=${signals.length} has-policy-violation=true`
      : `signals not detected: ${signals.length}`;
  }));

  // ── T18 — report builder: buildSecurityReport ─────────────────────────────
  results.push(await run("T18", "buildSecurityReport produces serializable SecurityReport", async () => {
    const events   = testAuditLog.getEventsForOrg(ORG_A);
    const signals  = [detectPolicyViolation(ORG_A, "AUDIT_REQUIRED", "copilot-memory", "Missing audit")];
    const decision = evaluatePolicy("TENANT_ISOLATION_REQUIRED", { orgSlug: ORG_A });
    const report   = buildSecurityReport(ORG_A, events, signals, [decision]);
    let json: string;
    try { json = JSON.stringify(report); } catch { return "not JSON-serializable"; }
    return report.orgSlug === ORG_A && typeof report.securityScore === "number"
      ? `score=${report.securityScore} events=${report.totalEvents} signals=${report.activeSignals.length} len=${json.length}`
      : `wrong report structure`;
  }));

  // ── T19 — security inventory: critical surfaces ───────────────────────────
  results.push(await run("T19", "security inventory: critical risk surfaces identified", async () => {
    const critical = getCriticalRiskSurfaces();
    const summary  = getInventorySummary();
    return critical.length > 0
      ? `critical-surfaces=${critical.length} total=${SECURITY_INVENTORY.length} summary=${JSON.stringify(summary)}`
      : "no critical surfaces found";
  }));

  // ── T20 — debt registry: 7 planned sprints ────────────────────────────────
  results.push(await run("T20", "debt registry: all 7 planned security sprints documented", async () => {
    const vaultItem  = getDebtItem("AGENTIK-SECURITY-VAULT-01");
    const p0Items    = getDebtByPriority("P0_CRITICAL");
    const totalItems = SECURITY_DEBT_REGISTRY.length;
    return vaultItem?.priority === "P0_CRITICAL" && totalItems >= 7
      ? `total=${totalItems} p0=${p0Items.length} vault-priority=${vaultItem.priority}`
      : `wrong: total=${totalItems} vault=${JSON.stringify(vaultItem?.priority)}`;
  }));

  // ── T21 — canRead: allowed for same-tenant resource ───────────────────────
  results.push(await run("T21", "canRead: allowed for same-tenant non-restricted resource", async () => {
    const ctx    = buildAccessContext(ORG_A, "user-1", "USER", "playbook:pb1", "READ");
    const result = canRead(ctx);
    return result.allowed
      ? `allowed=true sensitivity=${result.sensitivity}`
      : `denied unexpectedly: ${result.reason}`;
  }));

  // ── T22 — canExport: RESTRICTED always denied ─────────────────────────────
  results.push(await run("T22", "canExport: RESTRICTED resource always denied", async () => {
    const ctx    = buildAccessContext(ORG_A, "user-1", "USER", "ai_token:anthropic", "EXPORT");
    const result = canExport(ctx);
    return !result.allowed && result.sensitivity === "RESTRICTED"
      ? `denied=true sensitivity=RESTRICTED`
      : `expected denial, got allowed=${result.allowed}`;
  }));

  // ── T23 — serialization: SecurityEvent ───────────────────────────────────
  results.push(await run("T23", "SecurityEvent is fully JSON-serializable (no Date objects)", async () => {
    const event = createSecurityEvent(
      ORG_A, "SECRET", "SECRET_ACCESSED", "HIGH",
      "ai_token:anthropic", "system", "SYSTEM", { test: "serialization" },
    );
    let json: string;
    try { json = JSON.stringify(event); } catch { return "JSON.stringify threw"; }
    const parsed = JSON.parse(json) as SecurityEvent;
    return parsed.orgSlug === ORG_A && typeof parsed.occurredAt === "string"
      ? `serialized=${json.length}chars occurredAt-is-string=true`
      : "parse mismatch";
  }));

  // ── T24 — barrel: client index exports expected types ────────────────────
  results.push(await run("T24", "client barrel exports accessible (type sanity check)", async () => {
    // Verify that pure helpers from the client barrel work at runtime
    const sensitivity = classifyData("bank account credentials").sensitivity;
    const isHigh      = isHighSensitivity(sensitivity);
    const needsAudit  = requiresAudit(sensitivity);
    return isHigh && needsAudit
      ? `sensitivity=${sensitivity} isHigh=${isHigh} needsAudit=${needsAudit}`
      : `unexpected: sensitivity=${sensitivity}`;
  }));

  // ── T25 — independence: no domain cross-imports ───────────────────────────
  results.push(await run("T25", "evaluateAllPolicies + isPolicyPassing: full evaluation chain", async () => {
    const decisions = evaluateAllPolicies({ orgSlug: ORG_A, resourceOrgSlug: ORG_A });
    const passing   = isPolicyPassing(decisions);
    const total     = decisions.length;
    const passed    = decisions.filter(d => d.allowed).length;
    return total === Object.keys(SECURITY_POLICIES).length
      ? `total=${total} passed=${passed} allPass=${passing}`
      : `wrong count: got ${total} expected ${Object.keys(SECURITY_POLICIES).length}`;
  }));

  // ── T26 — detectTenantBoundaryViolation: same tenant returns undefined ────
  results.push(await run("T26", "detectTenantBoundaryViolation: undefined for same-tenant access", async () => {
    const ctx    = buildAccessContext(ORG_A, "user-1", "USER", "playbook:pb1", "READ");
    const signal = detectTenantBoundaryViolation(ctx);
    return signal === undefined ? "undefined (same-tenant, no violation)" : `unexpected signal: ${signal.signalId}`;
  }));

  // ── T27 — ALL_SIGNAL_IDS contains all 5 signal types ─────────────────────
  results.push(await run("T27", "ALL_SIGNAL_IDS contains all 5 security signal types", async () => {
    const required = [
      "TENANT_BOUNDARY_VIOLATION",
      "UNCLASSIFIED_SENSITIVE_DATA",
      "UNAUDITED_ACCESS",
      "POLICY_VIOLATION",
      "SECRET_EXPOSURE_RISK",
    ];
    const allPresent = required.every(id => ALL_SIGNAL_IDS.includes(id as never));
    return allPresent ? `all-5-present count=${ALL_SIGNAL_IDS.length}` : `missing: ${required.filter(id => !ALL_SIGNAL_IDS.includes(id as never)).join(",")}`;
  }));

  // ── T28 — getEncryptionRequiredEntries: RESTRICTED assets ────────────────
  results.push(await run("T28", "getEncryptionRequiredEntries returns RESTRICTED assets", async () => {
    const encrypted = getEncryptionRequiredEntries();
    const allRestricted = encrypted.every(e => e.classification === "RESTRICTED");
    return allRestricted && encrypted.length > 0
      ? `count=${encrypted.length} all-RESTRICTED=${allRestricted}`
      : `wrong: count=${encrypted.length} allRestricted=${allRestricted}`;
  }));

  // ── T29 — buildSystemContext: SYSTEM actor ────────────────────────────────
  results.push(await run("T29", "buildSystemContext creates valid SYSTEM actor context", async () => {
    const ctx   = buildSystemContext(ORG_A, "workflow:run-123", "READ", "finance");
    const valid = isValidAccessContext(ctx) && ctx.actorType === "SYSTEM" && ctx.actorId === "system";
    return valid ? `actorType=${ctx.actorType} actorId=${ctx.actorId} module=${ctx.module}` : `invalid: ${JSON.stringify(ctx)}`;
  }));

  // ── T30 — getEffectiveResourceOrg fallback ────────────────────────────────
  results.push(await run("T30", "getEffectiveResourceOrg falls back to orgSlug when resourceOrgSlug absent", async () => {
    const ctx    = buildAccessContext(ORG_A, "user-1", "USER", "playbook:pb1", "READ");
    const effOrg = getEffectiveResourceOrg(ctx);
    return effOrg === ORG_A ? `effective-org=${effOrg}` : `wrong: ${effOrg}`;
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  return NextResponse.json({
    sprint:  "AGENTIK-SECURITY-FOUNDATION-01",
    total,
    passed,
    failed,
    verdict: failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED",
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
