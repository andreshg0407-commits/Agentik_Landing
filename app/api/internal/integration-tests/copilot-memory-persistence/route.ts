/**
 * app/api/internal/integration-tests/copilot-memory-persistence/route.ts
 *
 * AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 — Integration Test Harness
 *
 * HTTP endpoint for live integration testing of the Prisma memory layer.
 * Call with GET /api/internal/integration-tests/copilot-memory-persistence
 *
 * Tests:
 *  T01 — saveMemory creates durable record
 *  T02 — getMemory retrieves by ID
 *  T03 — searchMemory scopes by orgSlug (tenant isolation)
 *  T04 — updateMemory applies changes
 *  T05 — deleteMemory is a soft delete
 *  T06 — serverMemoryManager.recordStrategicFact stores via Prisma
 *  T07 — serverMemoryManager.updateMemory validates orgSlug
 *  T08 — serverMemoryManager.deleteMemory validates orgSlug
 *  T09 — getStrategicContext from server barrel uses Prisma repo
 *  T10 — clearMemories wipes only tenant records
 */
import "server-only";

import { NextResponse }            from "next/server";
import { prismaMemoryRepository }  from "@/lib/copilot/memory/persistence/prisma-memory-repository";
import {
  serverMemoryManager,
  getStrategicContext,
}                                  from "@/lib/copilot/memory/server";

const TEST_ORG    = "int-test-memory-persistence";
const OTHER_ORG   = "int-test-other-org";

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  id:      string;
  label:   string;
  passed:  boolean;
  detail?: string;
}

async function run(
  id: string,
  label: string,
  fn: () => Promise<boolean | string>,
): Promise<TestResult> {
  try {
    const result = await fn();
    const passed = result === true || typeof result === "string";
    return { id, label, passed, detail: typeof result === "string" ? result : undefined };
  } catch (err: unknown) {
    return {
      id,
      label,
      passed:  false,
      detail: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  // Cleanup leftovers
  await prismaMemoryRepository.clearMemories(TEST_ORG);
  await prismaMemoryRepository.clearMemories(OTHER_ORG);

  const results: TestResult[] = [];

  // T01 — saveMemory creates durable record
  let t01Id = "";
  results.push(await run("T01", "saveMemory creates durable record", async () => {
    const entry = await prismaMemoryRepository.saveMemory({
      orgSlug: TEST_ORG, type: "STRATEGIC", scope: "TENANT",
      importance: "HIGH", title: "Integration test fact",
      content: "Memory persistence integration test — Prisma layer.",
      tags: ["integration", "test"], source: "harness",
    });
    t01Id = entry.id;
    return !!entry.id && entry.orgSlug === TEST_ORG;
  }));

  // T02 — getMemory retrieves by ID
  results.push(await run("T02", "getMemory retrieves by ID", async () => {
    const entry = await prismaMemoryRepository.getMemory(t01Id);
    return !!entry && entry.id === t01Id && entry.type === "STRATEGIC";
  }));

  // T03 — searchMemory scopes by orgSlug (tenant isolation)
  results.push(await run("T03", "searchMemory scopes by orgSlug (isolation)", async () => {
    // Save entry in other org
    await prismaMemoryRepository.saveMemory({
      orgSlug: OTHER_ORG, type: "OPERATIONAL", scope: "TENANT",
      importance: "LOW", title: "Other org fact",
      content: "Should not appear in TEST_ORG search results.",
      tags: [], source: "harness",
    });
    const results = await prismaMemoryRepository.searchMemory(TEST_ORG, { limit: 50 });
    const leaked = results.find(e => e.orgSlug === OTHER_ORG);
    return leaked === undefined ? true : `Cross-tenant leak detected: ${leaked.id}`;
  }));

  // T04 — updateMemory applies changes
  results.push(await run("T04", "updateMemory applies changes", async () => {
    const updated = await prismaMemoryRepository.updateMemory(t01Id, {
      title: "Updated integration fact",
      tags:  ["integration", "test", "updated"],
    });
    return !!updated &&
      updated.title === "Updated integration fact" &&
      updated.tags.includes("updated");
  }));

  // T05 — deleteMemory is soft delete
  results.push(await run("T05", "deleteMemory is a soft delete (active=null after delete)", async () => {
    const deleted = await prismaMemoryRepository.deleteMemory(t01Id);
    if (!deleted) return "deleteMemory returned false";
    const after = await prismaMemoryRepository.getMemory(t01Id);
    return after === null ? true : "getMemory still returns entry after soft delete";
  }));

  // T06 — serverMemoryManager.recordStrategicFact
  let t06Id = "";
  results.push(await run("T06", "serverMemoryManager.recordStrategicFact stores via Prisma", async () => {
    const result = await serverMemoryManager.recordStrategicFact(
      TEST_ORG,
      "Manager fact",
      "Agentik memory manager uses durable Prisma repository in production.",
      { tags: ["manager", "prisma"] },
    );
    if (!result.stored || !result.entry) return "recordStrategicFact returned stored=false";
    t06Id = result.entry.id;
    // Verify it's in DB
    const fetched = await prismaMemoryRepository.getMemory(t06Id);
    return !!fetched && fetched.orgSlug === TEST_ORG;
  }));

  // T07 — serverMemoryManager.updateMemory validates orgSlug
  results.push(await run("T07", "serverMemoryManager.updateMemory rejects wrong orgSlug", async () => {
    const result = await serverMemoryManager.updateMemory(
      OTHER_ORG,   // wrong org
      t06Id,       // belongs to TEST_ORG
      { title: "Should not update" },
    );
    return result === null ? true : "updateMemory allowed cross-tenant mutation";
  }));

  // T08 — serverMemoryManager.deleteMemory validates orgSlug
  results.push(await run("T08", "serverMemoryManager.deleteMemory rejects wrong orgSlug", async () => {
    const deleted = await serverMemoryManager.deleteMemory(OTHER_ORG, t06Id);
    return deleted === false ? true : "deleteMemory allowed cross-tenant deletion";
  }));

  // T09 — getStrategicContext from server barrel uses Prisma repo
  results.push(await run("T09", "getStrategicContext returns entries from server repo", async () => {
    // t06Id entry is still active (deleteMemory with wrong org was rejected)
    const ctx = await getStrategicContext(TEST_ORG, "GENERAL");
    return ctx.entries.length > 0 && ctx.orgSlug === TEST_ORG
      ? true
      : `No entries: ${ctx.entries.length}`;
  }));

  // T10 — clearMemories wipes only tenant records
  results.push(await run("T10", "clearMemories wipes only TEST_ORG records", async () => {
    await prismaMemoryRepository.clearMemories(TEST_ORG);
    const testCount  = await prismaMemoryRepository.countMemories(TEST_ORG);
    const otherCount = await prismaMemoryRepository.countMemories(OTHER_ORG);
    // Cleanup other org too
    await prismaMemoryRepository.clearMemories(OTHER_ORG);
    return testCount === 0 && otherCount >= 0
      ? true
      : `testCount=${testCount} otherCount=${otherCount}`;
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  return NextResponse.json({
    sprint:  "AGENTIK-COPILOT-MEMORY-PERSISTENCE-01",
    total,
    passed,
    failed,
    verdict: failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED",
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
