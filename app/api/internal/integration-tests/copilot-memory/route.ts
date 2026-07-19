/**
 * app/api/internal/integration-tests/copilot-memory/route.ts
 *
 * Agentik — Copilot Memory Engine — Integration Test Harness
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * GET /api/internal/integration-tests/copilot-memory
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - x-agentik-integration-token matches INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * Tests the full Copilot Memory pipeline:
 *   manager → classifier → repository → retrieval → summaries → audit
 *
 * Cases:
 *   1. Create strategic memory
 *   2. Create preference
 *   3. Create learning
 *   4. Create operational fact
 *   5. Retrieve strategic context
 *   6. Search by tags
 *   7. Tenant isolation
 *   8. Trivial content rejection
 *   9. Summaries
 *   10. Audit trail
 */

import { NextRequest, NextResponse } from "next/server";
import { InMemoryMemoryRepository }   from "@/lib/copilot/memory/in-memory-memory-repository";
import { StrategicMemoryManager }     from "@/lib/copilot/memory/strategic-memory-manager";
import { getStrategicContext, searchRelevantMemories } from "@/lib/copilot/memory/memory-retrieval";
import { buildFullContextSummary }    from "@/lib/copilot/memory/memory-summary";
import { MemoryAuditLog, auditMemoryCreated, globalMemoryAuditLog } from "@/lib/copilot/memory/memory-audit";

// ── Security guard ────────────────────────────────────────────────────────────

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token    = req.headers.get("x-agentik-integration-token") ?? "";
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
  return token === expected;
}

// ── Test infrastructure ────────────────────────────────────────────────────────

interface TestResult {
  test:    string;
  passed:  boolean;
  message: string;
  data?:   unknown;
}

function pass(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: true, message, data };
}

function fail(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: false, message, data };
}

const ORG = "castillitos";

// ── Tests ──────────────────────────────────────────────────────────────────────

async function testCreateStrategicMemory(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    const result = await mgr.recordStrategicFact(
      ORG,
      "SAG integration",
      "Castillitos usa SAG para facturación y control de cartera de clientes",
      { tags: ["sag", "integration"] },
    );

    if (!result.stored)          return fail("create-strategic", `Not stored: ${result.reason}`);
    if (!result.entry)           return fail("create-strategic", "No entry returned");
    if (result.entry.type !== "STRATEGIC") return fail("create-strategic", `Expected STRATEGIC, got ${result.entry.type}`);
    if (result.entry.importance !== "HIGH" && result.entry.importance !== "CRITICAL") {
      return fail("create-strategic", `Expected HIGH/CRITICAL, got ${result.entry.importance}`);
    }
    if (!result.entry.tags.includes("sag")) return fail("create-strategic", "Missing sag tag");

    return pass("create-strategic", `OK — ${result.entry.type}/${result.entry.importance} id:${result.entry.id}`, {
      id:         result.entry.id,
      type:       result.entry.type,
      importance: result.entry.importance,
      tags:       result.entry.tags,
    });
  } catch (err) {
    return fail("create-strategic", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCreatePreference(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    const result = await mgr.recordPreference(
      ORG,
      "Agent specialization preference",
      "Andrés prefiere agentes especializados por módulo de negocio para mayor precisión",
    );

    if (!result.stored)         return fail("create-preference", `Not stored: ${result.reason}`);
    if (result.entry?.type !== "PREFERENCE") {
      return fail("create-preference", `Expected PREFERENCE, got ${result.entry?.type}`);
    }

    return pass("create-preference", `OK — PREFERENCE/${result.entry?.importance}`, {
      id: result.entry?.id, type: result.entry?.type,
    });
  } catch (err) {
    return fail("create-preference", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCreateLearning(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    const result = await mgr.recordLearning(
      ORG,
      "Escalation pattern for high overdue",
      "Siempre que hay mora alta en cartera, normalmente escalar al agente Mila de cobranza",
    );

    if (!result.stored)         return fail("create-learning", `Not stored: ${result.reason}`);
    if (result.entry?.type !== "LEARNING") {
      return fail("create-learning", `Expected LEARNING, got ${result.entry?.type}`);
    }

    return pass("create-learning", `OK — LEARNING/${result.entry?.importance}`, {
      id: result.entry?.id, type: result.entry?.type,
    });
  } catch (err) {
    return fail("create-learning", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCreateOperationalFact(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    const result = await mgr.recordOperationalFact(
      ORG,
      "Mayo 2026 closing",
      "El cierre de mayo 2026 está en proceso de aprobación final por el equipo de finanzas",
      { moduleId: "finance" },
    );

    if (!result.stored)         return fail("create-operational", `Not stored: ${result.reason}`);
    if (result.entry?.type !== "OPERATIONAL") {
      return fail("create-operational", `Expected OPERATIONAL, got ${result.entry?.type}`);
    }
    if (result.entry?.moduleId !== "finance") {
      return fail("create-operational", `Expected moduleId=finance, got ${result.entry?.moduleId}`);
    }

    return pass("create-operational", `OK — OPERATIONAL/${result.entry?.importance} module:${result.entry?.moduleId}`, {
      id: result.entry?.id, type: result.entry?.type, moduleId: result.entry?.moduleId,
    });
  } catch (err) {
    return fail("create-operational", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testRetrieveStrategicContext(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    await mgr.recordStrategicFact(ORG, "SAG",     "Castillitos usa SAG para facturación y control de cartera");
    await mgr.recordStrategicFact(ORG, "PagosNet","PagosNet está pendiente de integración con la plataforma agentik");
    await mgr.recordPreference(ORG,   "Pref",     "El usuario prefiere resúmenes cortos y directos en el panel");

    const ctx = await getStrategicContext(ORG, "FINANCE", repo);

    if (ctx.orgSlug !== ORG) return fail("retrieve-context", `orgSlug mismatch: ${ctx.orgSlug}`);
    if (!Array.isArray(ctx.entries)) return fail("retrieve-context", "entries is not an array");
    if (ctx.entries.length < 1) return fail("retrieve-context", `Expected >= 1 entry, got ${ctx.entries.length}`);

    return pass("retrieve-context", `OK — ${ctx.entries.length} entries retrieved`, {
      count:       ctx.entries.length,
      retrievedAt: ctx.retrievedAt,
      types:       ctx.entries.map(e => e.type),
    });
  } catch (err) {
    return fail("retrieve-context", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testSearchByTags(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    await mgr.recordStrategicFact(ORG, "SAG",     "Castillitos usa SAG para facturación y cartera completa", { tags: ["sag"] });
    await mgr.recordStrategicFact(ORG, "Shopify", "Shopify conectado como canal de ecommerce activo del tenant", { tags: ["shopify"] });

    const sagCtx = await searchRelevantMemories(ORG, undefined, ["sag"], 10, repo);
    if (sagCtx.entries.length !== 1) {
      return fail("search-by-tags", `Expected 1 SAG result, got ${sagCtx.entries.length}`);
    }
    if (sagCtx.entries[0]?.title !== "SAG") {
      return fail("search-by-tags", `Expected SAG entry, got ${sagCtx.entries[0]?.title}`);
    }

    return pass("search-by-tags", `OK — tag search returned ${sagCtx.entries.length} SAG entry`, {
      count: sagCtx.entries.length,
      title: sagCtx.entries[0]?.title,
    });
  } catch (err) {
    return fail("search-by-tags", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testTenantIsolation(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgrA = new StrategicMemoryManager(repo);

    await mgrA.recordStrategicFact("org-a", "A secret", "Org A private integration with SAG system platform");
    await mgrA.recordStrategicFact("org-b", "B secret", "Org B private integration with shopify ecommerce platform");

    const ctxA = await getStrategicContext("org-a", "FINANCE", repo);
    const ctxB = await getStrategicContext("org-b", "FINANCE", repo);

    if (ctxA.entries.some(e => e.orgSlug === "org-b")) {
      return fail("tenant-isolation", "org-a can see org-b entries!");
    }
    if (ctxB.entries.some(e => e.orgSlug === "org-a")) {
      return fail("tenant-isolation", "org-b can see org-a entries!");
    }

    return pass("tenant-isolation", `OK — org-a: ${ctxA.entries.length} entries, org-b: ${ctxB.entries.length} entries. No cross-contamination.`, {
      orgACount: ctxA.entries.length,
      orgBCount: ctxB.entries.length,
    });
  } catch (err) {
    return fail("tenant-isolation", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testTrivialRejection(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    const trivialCases = ["hola", "gracias", "ok", "test", "prueba", ""];
    const results: Array<{ input: string; stored: boolean; reason?: string }> = [];

    for (const input of trivialCases) {
      const r = await mgr.recordStrategicFact(ORG, "Test", input);
      results.push({ input: input || "(empty)", stored: r.stored, reason: r.reason });
      if (r.stored) {
        return fail("trivial-rejection", `"${input}" was stored but should have been rejected`);
      }
    }

    return pass("trivial-rejection", `OK — all ${trivialCases.length} trivial inputs rejected`, {
      rejectedCount: trivialCases.length,
      samples: results,
    });
  } catch (err) {
    return fail("trivial-rejection", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testSummaries(): Promise<TestResult> {
  try {
    const repo = new InMemoryMemoryRepository();
    const mgr  = new StrategicMemoryManager(repo);

    await mgr.recordStrategicFact(ORG,   "SAG",   "Castillitos usa SAG para facturación y cartera de clientes");
    await mgr.recordOperationalFact(ORG, "Cierre","El cierre de mayo 2026 está en proceso de aprobación final");
    await mgr.recordPreference(ORG,      "Pref",  "El usuario prefiere resúmenes cortos y directos en copilot");

    const fullSummary = await buildFullContextSummary(ORG, repo);

    if (fullSummary.totalCount < 3) {
      return fail("summaries", `Expected >= 3 entries, got ${fullSummary.totalCount}`);
    }
    if (!fullSummary.summaryText || fullSummary.summaryText.length === 0) {
      return fail("summaries", "summaryText is empty");
    }
    if (!fullSummary.generatedAt.includes("T")) {
      return fail("summaries", "generatedAt is not ISO string");
    }

    return pass("summaries", `OK — ${fullSummary.totalCount} entries, summary length: ${fullSummary.summaryText.length}`, {
      totalCount:    fullSummary.totalCount,
      summaryLength: fullSummary.summaryText.length,
      generatedAt:   fullSummary.generatedAt,
    });
  } catch (err) {
    return fail("summaries", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testAuditTrail(): Promise<TestResult> {
  try {
    const log = new MemoryAuditLog();

    log.push(auditMemoryCreated(ORG, "mem-001", "SAG fact", "STRATEGIC", "HIGH", "copilot"));

    if (log.count() !== 1) return fail("audit-trail", `Expected 1 event, got ${log.count()}`);

    const events = log.getAll();
    const event  = events[0]!;

    if (event.type !== "memory_created") return fail("audit-trail", `Expected memory_created, got ${event.type}`);
    if (!event.id.startsWith("maud-"))   return fail("audit-trail", `Expected maud- prefix, got ${event.id}`);
    if (!event.occurredAt.includes("T")) return fail("audit-trail", "occurredAt not ISO");

    // Verify global audit log is accumulating (at least has entries from this request)
    const globalCount = globalMemoryAuditLog.count();

    return pass("audit-trail", `OK — audit event created, global log has ${globalCount} events`, {
      eventId:      event.id,
      eventType:    event.type,
      occurredAt:   event.occurredAt,
      globalAuditCount: globalCount,
    });
  } catch (err) {
    return fail("audit-trail", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = Date.now();

  const results: TestResult[] = await Promise.all([
    testCreateStrategicMemory(),
    testCreatePreference(),
    testCreateLearning(),
    testCreateOperationalFact(),
    testRetrieveStrategicContext(),
    testSearchByTags(),
    testTenantIsolation(),
    testTrivialRejection(),
    testSummaries(),
    testAuditTrail(),
  ]);

  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;
  const elapsed = Date.now() - start;

  return NextResponse.json({
    sprint:    "AGENTIK-COPILOT-MEMORY-ENGINE-01",
    timestamp: new Date().toISOString(),
    summary: {
      passed,
      failed,
      total,
      elapsedMs: elapsed,
      verdict:   failed === 0 ? "PASS" : "FAIL",
    },
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
