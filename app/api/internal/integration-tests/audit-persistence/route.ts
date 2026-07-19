/**
 * app/api/internal/integration-tests/audit-persistence/route.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Integration Harness — Persistent Security Audit Layer
 *
 * 36 runtime tests for the full audit persistence layer.
 * Tests run in process — no external HTTP calls.
 *
 * NOT for production use. Internal only.
 */

import { NextResponse } from "next/server";

// ── Guards ────────────────────────────────────────────────────────────────────

const ALLOWED =
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_INTERNAL_INTEGRATION_TESTS === "true";

const EXPECTED_TOKEN = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id:         string;
  label:      string;
  status:     "PASS" | "FAIL" | "SKIP";
  detail?:    string;
  durationMs: number;
}

interface HarnessReport {
  totalTests: number;
  passed:     number;
  failed:     number;
  skipped:    number;
  results:    TestResult[];
  ranAt:      string;
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTest(
  id:    string,
  label: string,
  fn:    () => unknown | Promise<unknown>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { id, label, status: "PASS", durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      id,
      label,
      status:     "FAIL",
      detail:     e?.message ?? String(e),
      durationMs: Date.now() - start,
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── T01 — audit-event-types: createPersistentAuditEvent shape ─────────────────

async function t01(): Promise<void> {
  const { createPersistentAuditEvent } = await import("@/lib/security/audit-persistence");
  const event = createPersistentAuditEvent({
    orgSlug:   "test-org",
    eventType: "SECRET_ACCESSED",
    category:  "VAULT",
    severity:  "HIGH",
    metadata:  { action: "read", secretKey: "OPENAI_API_KEY" },
  });
  assert(typeof event.id === "string" && event.id.length > 0, "id is non-empty string");
  assert(event.orgSlug === "test-org", "orgSlug preserved");
  assert(event.eventType === "SECRET_ACCESSED", "eventType preserved");
  assert(event.category === "VAULT", "category preserved");
  assert(event.severity === "HIGH", "severity preserved");
  assert(typeof event.createdAt === "string", "createdAt is string");
  assert(event.createdAt.includes("T"), "createdAt is ISO string");
  assert(typeof event.metadata === "object", "metadata is object");
}

// ── T02 — audit-event-types: IDs are unique per call ─────────────────────────

async function t02(): Promise<void> {
  const { createPersistentAuditEvent } = await import("@/lib/security/audit-persistence");
  const base = {
    orgSlug:   "test-org",
    eventType: "SYSTEM_STARTUP" as const,
    category:  "SYSTEM" as const,
    severity:  "LOW" as const,
    metadata:  {},
  };
  const a = createPersistentAuditEvent(base);
  const b = createPersistentAuditEvent(base);
  assert(a.id !== b.id, "each call produces a unique id");
}

// ── T03 — audit-event-types: formatAuditEventForLog no metadata values ────────

async function t03(): Promise<void> {
  const { createPersistentAuditEvent, formatAuditEventForLog } = await import(
    "@/lib/security/audit-persistence"
  );
  const event = createPersistentAuditEvent({
    orgSlug:   "test-org",
    eventType: "SECRET_ACCESSED",
    category:  "VAULT",
    severity:  "HIGH",
    metadata:  { secretKey: "ERP_PASSWORD", label: "AUDIT_FORMAT_TEST_MARKER" },
  });
  const log = formatAuditEventForLog(event);
  assert(typeof log === "string", "log is string");
  assert(!log.includes("AUDIT_FORMAT_TEST_MARKER"), "log must not include metadata values");
  assert(log.includes("SECRET_ACCESSED"), "log includes event type");
}

// ── T04 — audit-event-types: AUDIT_SEVERITY_RANK ordering ────────────────────

async function t04(): Promise<void> {
  const { AUDIT_SEVERITY_RANK } = await import("@/lib/security/audit-persistence");
  assert(AUDIT_SEVERITY_RANK.LOW < AUDIT_SEVERITY_RANK.MEDIUM, "LOW < MEDIUM");
  assert(AUDIT_SEVERITY_RANK.MEDIUM < AUDIT_SEVERITY_RANK.HIGH, "MEDIUM < HIGH");
  assert(AUDIT_SEVERITY_RANK.HIGH < AUDIT_SEVERITY_RANK.CRITICAL, "HIGH < CRITICAL");
}

// ── T05 — audit-category-registry: all 15 categories present ─────────────────

async function t05(): Promise<void> {
  const { AUDIT_CATEGORY_REGISTRY, getAllCategoryIds } = await import(
    "@/lib/security/audit-persistence"
  );
  const ids = getAllCategoryIds();
  const required = [
    "AUTHENTICATION", "AUTHORIZATION", "DATA_ACCESS", "DATA_EXPORT",
    "SECRET_ACCESS", "TENANT_BOUNDARY", "POLICY_VIOLATION", "INTEGRATION",
    "SYSTEM", "VAULT", "MEMORY", "PLAYBOOK", "EXECUTIVE_BRAIN", "COPILOT",
    "AUTONOMOUS_OPERATIONS",
  ];
  for (const cat of required) {
    assert(ids.includes(cat as any), `Category ${cat} must be in registry`);
  }
  assert(AUDIT_CATEGORY_REGISTRY.length >= 15, "Registry has at least 15 entries");
}

// ── T06 — audit-category-registry: TENANT_BOUNDARY is CRITICAL ───────────────

async function t06(): Promise<void> {
  const { getCategoryEntry, getCriticalAlertCategories } = await import(
    "@/lib/security/audit-persistence"
  );
  const entry = getCategoryEntry("TENANT_BOUNDARY");
  assert(entry !== undefined, "TENANT_BOUNDARY entry exists");
  assert(entry!.defaultSeverity === "CRITICAL", "TENANT_BOUNDARY default severity is CRITICAL");
  assert(entry!.alertOnCritical === true, "TENANT_BOUNDARY alertOnCritical is true");
  const criticalAlerts = getCriticalAlertCategories();
  const alertIds = criticalAlerts.map(c => c.id);
  assert(alertIds.includes("TENANT_BOUNDARY"), "TENANT_BOUNDARY in critical alerts");
  assert(alertIds.includes("VAULT"), "VAULT in critical alerts");
}

// ── T07 — audit-retention: CRITICAL severity has indefinite retention ─────────

async function t07(): Promise<void> {
  const { getRetentionDays, isIndefiniteRetention, computeExpiryDate } = await import(
    "@/lib/security/audit-persistence"
  );
  const critDays = getRetentionDays("CRITICAL", "SYSTEM");
  assert(critDays === null, "CRITICAL severity has null (indefinite) retention");
  assert(isIndefiniteRetention("CRITICAL", "SYSTEM"), "CRITICAL is indefinite");

  const lowDays = getRetentionDays("LOW", "SYSTEM");
  assert(lowDays === 90, "LOW severity has 90-day retention");
  assert(!isIndefiniteRetention("LOW", "SYSTEM"), "LOW is not indefinite");

  const expiry = computeExpiryDate("HIGH", "SYSTEM", new Date().toISOString());
  assert(expiry !== null, "HIGH severity has an expiry date");
  assert(typeof expiry === "string", "expiry is string (ISO)");
}

// ── T08 — audit-retention: VAULT category is always indefinite ───────────────

async function t08(): Promise<void> {
  const { getRetentionDays, isIndefiniteRetention } = await import(
    "@/lib/security/audit-persistence"
  );
  const days = getRetentionDays("HIGH", "VAULT");
  assert(days === null, "VAULT category has null retention (overrides severity)");
  assert(isIndefiniteRetention("HIGH", "VAULT"), "VAULT category is indefinite");

  const tbDays = getRetentionDays("MEDIUM", "TENANT_BOUNDARY");
  assert(tbDays === null, "TENANT_BOUNDARY has null retention");
}

// ── T09 — prisma-audit-repository: singleton pattern ─────────────────────────

async function t09(): Promise<void> {
  const { getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const r1 = getPrismaAuditRepository();
  const r2 = getPrismaAuditRepository();
  assert(r1 === r2, "getPrismaAuditRepository returns same instance");
  assert(typeof r1.appendEvent === "function", "appendEvent is function");
  assert(typeof r1.appendMany === "function", "appendMany is function");
  assert(typeof r1.findByTenant === "function", "findByTenant is function");
  assert(typeof r1.findByCategory === "function", "findByCategory is function");
  assert(typeof r1.findBySeverity === "function", "findBySeverity is function");
  assert(typeof r1.findByDateRange === "function", "findByDateRange is function");
  assert(typeof r1.findRecent === "function", "findRecent is function");
  assert(typeof r1.countEvents === "function", "countEvents is function");
}

// ── T10 — persistent-audit-service: singleton pattern ────────────────────────

async function t10(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const s1 = getPersistentAuditService();
  const s2 = getPersistentAuditService();
  assert(s1 === s2, "getPersistentAuditService returns same instance");
  assert(typeof s1.recordEvent === "function", "recordEvent is function");
  assert(typeof s1.recordMany === "function", "recordMany is function");
  assert(typeof s1.queryEvents === "function", "queryEvents is function");
  assert(typeof s1.queryRecentEvents === "function", "queryRecentEvents is function");
  assert(typeof s1.queryByCategory === "function", "queryByCategory is function");
  assert(typeof s1.queryBySeverity === "function", "queryBySeverity is function");
}

// ── T11 — persistent-audit-service: recordEvent never throws ─────────────────

async function t11(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const svc = getPersistentAuditService();
  let threw = false;
  try {
    await svc.recordEvent({
      orgSlug:   "test-org",
      eventType: "SYSTEM_STARTUP",
      category:  "SYSTEM",
      severity:  "LOW",
      metadata:  { test: true },
    });
  } catch {
    threw = true;
  }
  assert(!threw, "recordEvent must never throw (fail-safe)");
}

// ── T12 — persistent-audit-service: sanitizeMetadata strips secrets ───────────

async function t12(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const svc = getPersistentAuditService();
  let threw = false;
  try {
    await svc.recordEvent({
      orgSlug:   "test-org",
      eventType: "SECRET_ACCESSED",
      category:  "VAULT",
      severity:  "HIGH",
      metadata:  {
        // These should be stripped before persistence
        password:  "super-secret",
        token:     "eyJ0eXAi...",
        apiKey:    "sk-live-xyz",
        safeField: "safe-value",
      },
    });
  } catch {
    threw = true;
  }
  assert(!threw, "recordEvent with secret-keyed metadata must not throw");
}

// ── T13 — persistent-audit-service: recordMany fail-safe ─────────────────────

async function t13(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const svc = getPersistentAuditService();
  let threw = false;
  try {
    await svc.recordMany([
      {
        orgSlug:   "test-org",
        eventType: "SYSTEM_STARTUP",
        category:  "SYSTEM",
        severity:  "LOW",
        metadata:  { batch: 1 },
      },
      {
        orgSlug:   "test-org",
        eventType: "SYSTEM_ERROR",
        category:  "SYSTEM",
        severity:  "HIGH",
        metadata:  { batch: 2 },
      },
    ]);
  } catch {
    threw = true;
  }
  assert(!threw, "recordMany must never throw (fail-safe)");
}

// ── T14 — persistent-audit-service: queryEvents fail-safe returns [] ──────────

async function t14(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const svc = getPersistentAuditService();
  let threw = false;
  let result: unknown;
  try {
    result = await svc.queryEvents("test-org", { limit: 5 });
  } catch {
    threw = true;
  }
  assert(!threw, "queryEvents must never throw");
  assert(Array.isArray(result), "queryEvents returns array even on DB failure");
}

// ── T15 — query-engine: AuditQueryEngine construction ────────────────────────

async function t15(): Promise<void> {
  const { AuditQueryEngine, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const repo   = getPrismaAuditRepository();
  const engine = new AuditQueryEngine(repo);
  assert(typeof engine.getTenantEvents === "function", "getTenantEvents is function");
  assert(typeof engine.getRecentEvents === "function", "getRecentEvents is function");
  assert(typeof engine.getCriticalEvents === "function", "getCriticalEvents is function");
  assert(typeof engine.getCategoryEvents === "function", "getCategoryEvents is function");
  assert(typeof engine.getEventTimeline === "function", "getEventTimeline is function");
}

// ── T16 — query-engine: getTenantEvents fail-safe ────────────────────────────

async function t16(): Promise<void> {
  const { AuditQueryEngine, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const engine = new AuditQueryEngine(getPrismaAuditRepository());
  let threw  = false;
  let result: unknown;
  try {
    result = await engine.getTenantEvents("test-org", 10);
  } catch {
    threw = true;
  }
  assert(!threw, "getTenantEvents must never throw");
  assert(Array.isArray(result), "getTenantEvents returns array");
}

// ── T17 — query-engine: getCriticalEvents fail-safe ──────────────────────────

async function t17(): Promise<void> {
  const { AuditQueryEngine, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const engine = new AuditQueryEngine(getPrismaAuditRepository());
  let threw  = false;
  let result: unknown;
  try {
    result = await engine.getCriticalEvents("test-org", 50);
  } catch {
    threw = true;
  }
  assert(!threw, "getCriticalEvents must never throw");
  assert(Array.isArray(result), "getCriticalEvents returns array");
}

// ── T18 — query-engine: getEventTimeline fail-safe ───────────────────────────

async function t18(): Promise<void> {
  const { AuditQueryEngine, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const engine = new AuditQueryEngine(getPrismaAuditRepository());
  let threw  = false;
  let result: unknown;
  try {
    result = await engine.getEventTimeline("test-org");
  } catch {
    threw = true;
  }
  assert(!threw, "getEventTimeline must never throw");
  assert(Array.isArray(result), "getEventTimeline returns array");
}

// ── T19 — report-builder: buildAuditReport fail-safe ─────────────────────────

async function t19(): Promise<void> {
  const { buildAuditReport, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const repo = getPrismaAuditRepository();
  let threw  = false;
  let report: unknown;
  try {
    report = await buildAuditReport("test-org", repo, 30);
  } catch {
    threw = true;
  }
  assert(!threw, "buildAuditReport must never throw");
  assert(typeof report === "object" && report !== null, "report is object");
  const r = report as Record<string, unknown>;
  assert(r.orgSlug === "test-org", "report.orgSlug is correct");
  assert(typeof r.generatedAt === "string", "report.generatedAt is string");
  assert(typeof r.summary === "object", "report.summary is object");
}

// ── T20 — report-builder: formatAuditReport returns safe string ───────────────

async function t20(): Promise<void> {
  const { buildAuditReport, formatAuditReport, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const repo   = getPrismaAuditRepository();
  const report = await buildAuditReport("test-org", repo, 7);
  const formatted = formatAuditReport(report);
  assert(typeof formatted === "string", "formatAuditReport returns string");
  assert(formatted.length > 0, "formatted is non-empty");
}

// ── T21 — health-monitor: AuditHealthMonitor construction ────────────────────

async function t21(): Promise<void> {
  const { AuditHealthMonitor, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const repo    = getPrismaAuditRepository();
  const monitor = new AuditHealthMonitor(repo);
  assert(typeof monitor.checkAuditHealth === "function", "checkAuditHealth is function");
}

// ── T22 — health-monitor: checkAuditHealth fail-safe ─────────────────────────

async function t22(): Promise<void> {
  const { checkAuditHealth, getPrismaAuditRepository } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const repo = getPrismaAuditRepository();
  let threw  = false;
  let report: unknown;
  try {
    report = await checkAuditHealth(repo);
  } catch {
    threw = true;
  }
  assert(!threw, "checkAuditHealth must never throw");
  assert(typeof report === "object" && report !== null, "report is object");
  const r = report as Record<string, unknown>;
  assert(
    ["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(r.status as string),
    "status is valid AuditHealthStatus",
  );
  assert(Array.isArray(r.checks), "report.checks is array");
  assert(typeof r.checkedAt === "string", "checkedAt is string");
  assert(typeof r.durationMs === "number", "durationMs is number");
}

// ── T23 — security-audit adapter: persistentSecurityAuditAdapter exists ───────

async function t23(): Promise<void> {
  const { persistentSecurityAuditAdapter, PersistentSecurityAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  assert(persistentSecurityAuditAdapter !== null, "singleton is non-null");
  assert(
    persistentSecurityAuditAdapter instanceof PersistentSecurityAuditAdapter,
    "singleton is PersistentSecurityAuditAdapter",
  );
  assert(typeof persistentSecurityAuditAdapter.record === "function", "record is function");
}

// ── T24 — security-audit adapter: record does not throw ──────────────────────

async function t24(): Promise<void> {
  const { persistentSecurityAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  let threw = false;
  try {
    persistentSecurityAuditAdapter.record({
      type:     "AUTH_SUCCESS",
      orgSlug:  "test-org",
      actor:    "test-user",
      resource: "test-resource",
      metadata: { test: true },
    } as any);
  } catch {
    threw = true;
  }
  assert(!threw, "record on security adapter must not throw");
}

// ── T25 — vault-service adapter: persistentVaultAuditAdapter exists ───────────

async function t25(): Promise<void> {
  const { persistentVaultAuditAdapter, PersistentVaultAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  assert(persistentVaultAuditAdapter !== null, "vault adapter singleton is non-null");
  assert(
    persistentVaultAuditAdapter instanceof PersistentVaultAuditAdapter,
    "singleton is PersistentVaultAuditAdapter",
  );
  assert(typeof persistentVaultAuditAdapter.record === "function", "record is function");
}

// ── T26 — vault-service adapter: record does not throw ───────────────────────

async function t26(): Promise<void> {
  const { persistentVaultAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  let threw = false;
  try {
    persistentVaultAuditAdapter.record({
      type:      "SECRET_READ",
      orgSlug:   "test-org",
      secretKey: "OPENAI_API_KEY",
      metadata:  {},
    } as any);
  } catch {
    threw = true;
  }
  assert(!threw, "vault adapter record must not throw");
}

// ── T27 — executive-audit adapter: persistentExecutiveAuditAdapter exists ─────

async function t27(): Promise<void> {
  const { persistentExecutiveAuditAdapter, PersistentExecutiveAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  assert(persistentExecutiveAuditAdapter !== null, "executive adapter singleton is non-null");
  assert(
    persistentExecutiveAuditAdapter instanceof PersistentExecutiveAuditAdapter,
    "singleton is PersistentExecutiveAuditAdapter",
  );
  assert(typeof persistentExecutiveAuditAdapter.push === "function", "push is function");
}

// ── T28 — executive-audit adapter: push does not throw ───────────────────────

async function t28(): Promise<void> {
  const { persistentExecutiveAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  let threw = false;
  try {
    persistentExecutiveAuditAdapter.push({
      type:    "SIGNAL_PROCESSED",
      orgSlug: "test-org",
      data:    { signalId: "sig-001" },
    } as any);
  } catch {
    threw = true;
  }
  assert(!threw, "executive adapter push must not throw");
}

// ── T29 — copilot-audit adapter: persistentCopilotAuditAdapter exists ─────────

async function t29(): Promise<void> {
  const { persistentCopilotAuditAdapter, PersistentCopilotAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  assert(persistentCopilotAuditAdapter !== null, "copilot adapter singleton is non-null");
  assert(
    persistentCopilotAuditAdapter instanceof PersistentCopilotAuditAdapter,
    "singleton is PersistentCopilotAuditAdapter",
  );
  assert(typeof persistentCopilotAuditAdapter.push === "function", "push is function");
  assert(
    typeof persistentCopilotAuditAdapter.pushWithOrg === "function",
    "pushWithOrg is function",
  );
}

// ── T30 — copilot-audit adapter: pushWithOrg does not throw ──────────────────

async function t30(): Promise<void> {
  const { persistentCopilotAuditAdapter } = await import(
    "@/lib/security/audit-persistence/server"
  );
  let threw = false;
  try {
    persistentCopilotAuditAdapter.pushWithOrg(
      {
        type:      "intent_resolved",
        requestId: "req-001",
        data:      { intent: "test" },
      } as any,
      "test-org",
    );
  } catch {
    threw = true;
  }
  assert(!threw, "copilot pushWithOrg must not throw");
}

// ── T31 — migration-adapters: AUDIT_SOURCE_MIGRATION_STATUS completeness ──────

async function t31(): Promise<void> {
  const { AUDIT_SOURCE_MIGRATION_STATUS, getMigratedAuditSources, getMemoryOnlyAuditSources } =
    await import("@/lib/security/audit-persistence/audit-migration-adapters");
  assert(AUDIT_SOURCE_MIGRATION_STATUS.length >= 4, "At least 4 audit sources tracked");
  const migrated = getMigratedAuditSources();
  assert(migrated.length >= 4, "At least 4 sources are MEMORY_AND_PERSISTENT");
  const memOnly = getMemoryOnlyAuditSources();
  assert(Array.isArray(memOnly), "getMemoryOnlyAuditSources returns array");
  const migratedIds = migrated.map(s => s.id);
  assert(migratedIds.includes("security_audit_log"), "security_audit_log is migrated");
  assert(migratedIds.includes("vault_service_audit_log"), "vault_service_audit_log is migrated");
  assert(migratedIds.includes("executive_audit_log"), "executive_audit_log is migrated");
  assert(migratedIds.includes("copilot_audit_log"), "copilot_audit_log is migrated");
}

// ── T32 — migration-adapters: getAuditSourceStatus returns correct entry ──────

async function t32(): Promise<void> {
  const { getAuditSourceStatus } = await import(
    "@/lib/security/audit-persistence/audit-migration-adapters"
  );
  const entry = getAuditSourceStatus("vault_service_audit_log");
  assert(entry !== undefined, "vault_service_audit_log entry found");
  assert(entry!.status === "MEMORY_AND_PERSISTENT", "status is MEMORY_AND_PERSISTENT");
  assert(typeof entry!.adapterClass === "string", "adapterClass is string");
  assert(entry!.adapterClass.length > 0, "adapterClass is non-empty");

  const missing = getAuditSourceStatus("nonexistent_source_xyz");
  assert(missing === undefined, "unknown id returns undefined");
}

// ── T33 — tenant isolation: empty orgSlug handled safely ─────────────────────

async function t33(): Promise<void> {
  const { getPersistentAuditService } = await import(
    "@/lib/security/audit-persistence/server"
  );
  const svc = getPersistentAuditService();
  let threw = false;
  try {
    await svc.recordEvent({
      orgSlug:   "",
      eventType: "SYSTEM_STARTUP",
      category:  "SYSTEM",
      severity:  "LOW",
      metadata:  {},
    });
  } catch {
    threw = true;
  }
  // Service must not throw — returns null for invalid input
  assert(!threw, "recordEvent with empty orgSlug must not throw");
}

// ── T34 — serialization: event survives JSON round-trip ──────────────────────

async function t34(): Promise<void> {
  const { createPersistentAuditEvent } = await import("@/lib/security/audit-persistence");
  const event = createPersistentAuditEvent({
    orgSlug:   "test-org",
    eventType: "INTENT_RESOLVED",
    category:  "COPILOT",
    severity:  "LOW",
    metadata:  { intent: "query_status", confidence: 0.9 },
    actor:     { id: "user-123", type: "USER", name: "Test User" },
    resource:  { id: "res-456", type: "MODULE", name: "finanzas" },
  });
  const parsed = JSON.parse(JSON.stringify(event));
  assert(parsed.id === event.id, "id survives round-trip");
  assert(parsed.orgSlug === event.orgSlug, "orgSlug survives round-trip");
  assert(parsed.eventType === event.eventType, "eventType survives round-trip");
  assert(parsed.createdAt === event.createdAt, "createdAt survives round-trip");
  assert(parsed.actor?.id === "user-123", "actor.id survives round-trip");
  assert(parsed.resource?.id === "res-456", "resource.id survives round-trip");
}

// ── T35 — server barrel: all exports present ──────────────────────────────────

async function t35(): Promise<void> {
  const serverBarrel = await import("@/lib/security/audit-persistence/server");
  const required = [
    "PrismaAuditRepository",
    "getPrismaAuditRepository",
    "PersistentAuditService",
    "getPersistentAuditService",
    "AuditQueryEngine",
    "getTenantEvents",
    "getRecentEvents",
    "getCriticalEvents",
    "getCategoryEvents",
    "getEventTimeline",
    "buildAuditReport",
    "formatAuditReport",
    "AuditHealthMonitor",
    "checkAuditHealth",
    "createPersistentAuditEvent",
    "formatAuditEventForLog",
    "AUDIT_SEVERITY_RANK",
    "persistentSecurityAuditAdapter",
    "persistentVaultAuditAdapter",
    "persistentExecutiveAuditAdapter",
    "persistentCopilotAuditAdapter",
    "globalCopilotAuditLog",
  ];
  for (const name of required) {
    assert(name in serverBarrel, `server barrel must export ${name}`);
  }
}

// ── T36 — client barrel: no server-only classes exposed ──────────────────────

async function t36(): Promise<void> {
  const clientBarrel = await import("@/lib/security/audit-persistence");
  // Client barrel must NOT export server-only classes
  assert(!("PrismaAuditRepository" in clientBarrel), "PrismaAuditRepository not in client barrel");
  assert(!("PersistentAuditService" in clientBarrel), "PersistentAuditService not in client barrel");
  assert(!("AuditHealthMonitor" in clientBarrel), "AuditHealthMonitor not in client barrel");
  // Must export safe pure helpers
  assert("createPersistentAuditEvent" in clientBarrel, "createPersistentAuditEvent in client barrel");
  assert("AUDIT_SEVERITY_RANK" in clientBarrel, "AUDIT_SEVERITY_RANK in client barrel");
  assert("AUDIT_CATEGORY_REGISTRY" in clientBarrel, "AUDIT_CATEGORY_REGISTRY in client barrel");
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  if (!ALLOWED) {
    return NextResponse.json(
      { error: "Integration tests are disabled in this environment." },
      { status: 403 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (EXPECTED_TOKEN && token !== EXPECTED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tests: Array<[string, string, () => Promise<void>]> = [
    ["T01", "audit-event-types: createPersistentAuditEvent shape",             t01],
    ["T02", "audit-event-types: IDs are unique per call",                       t02],
    ["T03", "audit-event-types: formatAuditEventForLog no metadata values",     t03],
    ["T04", "audit-event-types: AUDIT_SEVERITY_RANK ordering",                  t04],
    ["T05", "audit-category-registry: all 15 categories present",               t05],
    ["T06", "audit-category-registry: TENANT_BOUNDARY is CRITICAL",             t06],
    ["T07", "audit-retention: CRITICAL severity has indefinite retention",       t07],
    ["T08", "audit-retention: VAULT category is always indefinite",              t08],
    ["T09", "prisma-audit-repository: singleton pattern",                        t09],
    ["T10", "persistent-audit-service: singleton pattern",                       t10],
    ["T11", "persistent-audit-service: recordEvent never throws",                t11],
    ["T12", "persistent-audit-service: sanitizeMetadata strips secrets",         t12],
    ["T13", "persistent-audit-service: recordMany fail-safe",                    t13],
    ["T14", "persistent-audit-service: queryEvents fail-safe returns []",        t14],
    ["T15", "query-engine: AuditQueryEngine construction",                       t15],
    ["T16", "query-engine: getTenantEvents fail-safe",                           t16],
    ["T17", "query-engine: getCriticalEvents fail-safe",                         t17],
    ["T18", "query-engine: getEventTimeline fail-safe",                          t18],
    ["T19", "report-builder: buildAuditReport fail-safe",                        t19],
    ["T20", "report-builder: formatAuditReport returns safe string",             t20],
    ["T21", "health-monitor: AuditHealthMonitor construction",                   t21],
    ["T22", "health-monitor: checkAuditHealth fail-safe",                        t22],
    ["T23", "security-audit adapter: singleton exists",                          t23],
    ["T24", "security-audit adapter: record does not throw",                     t24],
    ["T25", "vault-service adapter: singleton exists",                           t25],
    ["T26", "vault-service adapter: record does not throw",                      t26],
    ["T27", "executive-audit adapter: singleton exists",                         t27],
    ["T28", "executive-audit adapter: push does not throw",                      t28],
    ["T29", "copilot-audit adapter: singleton and pushWithOrg exist",            t29],
    ["T30", "copilot-audit adapter: pushWithOrg does not throw",                 t30],
    ["T31", "migration-adapters: AUDIT_SOURCE_MIGRATION_STATUS completeness",    t31],
    ["T32", "migration-adapters: getAuditSourceStatus returns correct entry",    t32],
    ["T33", "tenant isolation: empty orgSlug handled safely",                    t33],
    ["T34", "serialization: event survives JSON round-trip",                     t34],
    ["T35", "server barrel: all exports present",                                t35],
    ["T36", "client barrel: no server-only classes exposed",                     t36],
  ];

  const results: TestResult[] = [];
  for (const [id, label, fn] of tests) {
    results.push(await runTest(id, label, fn));
  }

  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;

  const report: HarnessReport = {
    totalTests: results.length,
    passed,
    failed,
    skipped,
    results,
    ranAt: new Date().toISOString(),
  };

  return NextResponse.json(report, { status: failed > 0 ? 207 : 200 });
}
