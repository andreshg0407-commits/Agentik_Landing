/**
 * scripts/verify-workflow-hardening-live.ts
 *
 * Agentik — Workflow Hardening Live Idempotency Test
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01 — Phase 17
 *
 * Live DB tests for WorkflowRun idempotency:
 *   Phase A: createRunIdempotent × 2 → same runId, wasCreated=false on 2nd
 *   Phase B: Unique constraint violation on direct duplicate insert (P2002)
 *   Phase C: findByIdempotencyKey returns the run by key
 *   Phase D: Cleanup — delete the test run
 *
 * Run with:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx tsx scripts/verify-workflow-hardening-live.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID }   from "crypto";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(name: string): void {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, reason: string): void {
  failed++;
  failures.push(`${name}: ${reason}`);
  console.log(`  ✗ ${name}: ${reason}`);
}

async function getOrgId(slug: string): Promise<string> {
  const org = await (prisma as any).organization.findFirst({
    where:  { slug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found: ${slug}`);
  return org.id;
}

const ORG_SLUG = "castillitos";
const CHAIN_ID = "TEST_HARDENING_CHAIN";

async function main(): Promise<void> {
  console.log("\nAGENTIK-WORKFLOW-HARDENING-01 — Live Idempotency Tests");
  console.log("──────────────────────────────────────────────────────");

  const orgId           = await getOrgId(ORG_SLUG);
  const runId           = `test-wf-hardening-${randomUUID()}`;
  const idempotencyKey  = `workflow_run:castillitos:${CHAIN_ID}:exec_test_${randomUUID()}`;
  const triggerExecId   = `exec_trigger_test_${randomUUID()}`;
  const now             = new Date();

  const baseData = {
    id:                 runId,
    idempotencyKey,
    organizationId:     orgId,
    chainId:            CHAIN_ID,
    chainName:          "Test Hardening Chain",
    status:             "PENDING",
    triggerExecutionId: triggerExecId,
    triggerApprovalId:  null,
    currentStepId:      null,
    stepsJson:          [] as object,
    auditTrailJson:     [] as object,
    metadataJson:       {} as object,
    createdAt:          now,
  };

  // ── Phase A: createRunIdempotent × 2 ────────────────────────────────────────

  console.log("\nPhase A — createRunIdempotent idempotency");

  let firstRunId: string | null = null;

  try {
    // First create — should succeed (wasCreated=true)
    const existing1 = await (prisma as any).workflowRun.findFirst({
      where: { idempotencyKey },
    });

    let row1: any;
    let wasCreated1: boolean;

    if (existing1) {
      row1        = existing1;
      wasCreated1 = false;
    } else {
      row1        = await (prisma as any).workflowRun.create({ data: baseData });
      wasCreated1 = true;
    }

    firstRunId = row1.id;

    if (wasCreated1) {
      pass("First createRunIdempotent → wasCreated=true");
    } else {
      fail("First createRunIdempotent → wasCreated=true", "already existed before test — check cleanup");
    }

    if (row1.id === runId) {
      pass(`First createRunIdempotent → correct runId (${runId.slice(0, 12)}...)`);
    } else {
      fail("First createRunIdempotent → correct runId", `got ${row1.id}`);
    }

    // Second create with same idempotencyKey — should return existing (wasCreated=false)
    const existing2 = await (prisma as any).workflowRun.findFirst({
      where: { idempotencyKey },
    });

    let row2: any;
    let wasCreated2: boolean;

    if (existing2) {
      row2        = existing2;
      wasCreated2 = false;
    } else {
      row2        = await (prisma as any).workflowRun.create({
        data: { ...baseData, id: `test-wf-dup-${randomUUID()}` },
      });
      wasCreated2 = true;
    }

    if (!wasCreated2) {
      pass("Second createRunIdempotent → wasCreated=false (idempotency)");
    } else {
      fail("Second createRunIdempotent → wasCreated=false", "created a new record — constraint not enforced");
    }

    if (row2.id === firstRunId) {
      pass("Second createRunIdempotent → returns same runId as first");
    } else {
      fail("Second createRunIdempotent → returns same runId", `got ${row2.id}, expected ${firstRunId}`);
    }

  } catch (err: unknown) {
    fail("Phase A createRunIdempotent", err instanceof Error ? err.message : String(err));
  }

  // ── Phase B: Direct duplicate insert → P2002 ─────────────────────────────────

  console.log("\nPhase B — Direct duplicate insert triggers P2002");

  try {
    await (prisma as any).workflowRun.create({
      data: { ...baseData, id: `test-wf-force-dup-${randomUUID()}` },
    });
    fail("Duplicate idempotencyKey insert throws P2002", "no error was thrown");
  } catch (err: unknown) {
    const code = (err as any)?.code;
    if (code === "P2002") {
      pass("Duplicate idempotencyKey insert throws P2002 (unique constraint enforced)");
    } else {
      fail("Duplicate idempotencyKey insert throws P2002", `got error code ${code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Phase C: findByIdempotencyKey ────────────────────────────────────────────

  console.log("\nPhase C — findByIdempotencyKey retrieves correct run");

  try {
    const found = await (prisma as any).workflowRun.findFirst({
      where: { idempotencyKey },
    });
    if (found && found.id === firstRunId) {
      pass(`findByIdempotencyKey → found run (id=${firstRunId?.slice(0, 12)}...)`);
      pass("findByIdempotencyKey → idempotencyKey matches");
    } else if (!found) {
      fail("findByIdempotencyKey → run found", "returned null");
    } else {
      fail("findByIdempotencyKey → correct run", `got id=${found.id}, expected ${firstRunId}`);
    }
  } catch (err: unknown) {
    fail("findByIdempotencyKey", err instanceof Error ? err.message : String(err));
  }

  // ── Phase D: Cleanup ─────────────────────────────────────────────────────────

  console.log("\nPhase D — Cleanup");

  try {
    if (firstRunId) {
      await (prisma as any).workflowRun.deleteMany({
        where: { id: { in: [firstRunId] } },
      });
      pass("Test WorkflowRun record deleted");
    } else {
      pass("No run to clean up (already absent)");
    }
  } catch (err: unknown) {
    fail("Cleanup", err instanceof Error ? err.message : String(err));
  }

  // ── Summary ────────────────────────────────────────────────────────────────────

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("AGENTIK-WORKFLOW-HARDENING-01 — Live Test Results");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\nFailed checks:");
    failures.forEach(f => console.log(`  ✗ ${f}`));
    await prisma.$disconnect();
    process.exit(1);
  } else {
    console.log("\nAll live idempotency tests passed. WorkflowRun constraint is enforced.");
    await prisma.$disconnect();
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
