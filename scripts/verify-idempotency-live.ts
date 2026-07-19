/**
 * scripts/verify-idempotency-live.ts
 *
 * AGENTIK-IDEMPOTENCY-VERIFY-01 — Live idempotency tests (Phases 7-9)
 *
 * Runs against a real PostgreSQL database.
 * Tests:
 *   Phase 7 — Task idempotency: createTaskIdempotent called twice → same id, alreadyProcessed=true
 *   Phase 8 — Approval idempotency: createApprovalIdempotent called twice → same id, alreadyProcessed=true
 *   Phase 9 — Constraint: direct duplicate insert must throw P2002
 *
 * Cleans up all created records after each test.
 * READ-WRITE. Creates and cancels real Task and Approval records.
 *
 * Run:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx dotenv-cli -e .env -- npx tsx scripts/verify-idempotency-live.ts
 */

import { randomUUID } from "crypto";
import { prisma }     from "../lib/prisma";
import { taskService }     from "../lib/tasks/task-service";
import { approvalService } from "../lib/approvals/approval-service";
import { buildTaskIdempotencyKey, buildApprovalIdempotencyKey } from "../lib/idempotency/idempotency-key";

import type { TaskDraft }       from "../lib/tasks/task-types";
import type { ApprovalRequest } from "../lib/approvals/approval-types";

// ── Counters ──────────────────────────────────────────────────────────────────

let passed  = 0;
let failed  = 0;
const cleanup: string[] = [];

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  ✓ ${label}${detail ? `  [${detail}]` : ""}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `  [${detail}]` : ""}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_SLUG   = "castillitos";
const TEST_RUN   = `VERIFY-LIVE-${randomUUID().slice(0, 8)}`;
const AGENT_ID   = "diego";
const RUN_ID     = `verify-run-${randomUUID().slice(0, 8)}`;
const ACTION_ID  = `pa-${randomUUID().slice(0, 8)}`;

function makeTaskDraft(): TaskDraft {
  const now = new Date().toISOString();
  return {
    id:          randomUUID(),
    title:       `[VERIFY] Idempotency test task — ${TEST_RUN}`,
    description: "Created by verify-idempotency-live.ts. Will be cancelled.",
    priority:    "medium",
    status:      "open",
    source:      "system",
    category:    "general",
    owner: {
      id:   AGENT_ID,
      type: "agent",
      name: "Diego",
    },
    relationships: [],
    businessContext: {
      orgSlug:        ORG_SLUG,
      module:         "verify-idempotency",
      sourceAgentId:  AGENT_ID,
      impactSummary:  "Integration test — no business impact.",
      metadata: {
        integrationTest: true,
        createdBy:       "AGENTIK-IDEMPOTENCY-VERIFY-01",
        testRunId:       TEST_RUN,
      },
    },
    visibility:  "organization",
    dueDateMode: "none",
    createdAt:   now,
    createdBy: {
      id:   AGENT_ID,
      type: "agent",
      name: "Diego",
    },
    metadata: {
      integrationTest: true,
      testRunId:       TEST_RUN,
    },
  };
}

function makeApprovalRequest(): ApprovalRequest {
  const now = new Date().toISOString();
  return {
    id:          randomUUID(),
    title:       `[VERIFY] Idempotency test approval — ${TEST_RUN}`,
    description: "Created by verify-idempotency-live.ts. Will be cancelled.",
    status:      "PENDING",
    priority:    "MEDIUM",
    source:      "AGENT",
    category:    "OPERATIONS",
    requestor: {
      id:   AGENT_ID,
      type: "AGENT",
      name: "Diego",
    },
    approver: {
      id:   "system",
      type: "SYSTEM",
      name: "System",
    },
    context: {
      orgSlug:       ORG_SLUG,
      module:        "verify-idempotency",
      sourceAgentId: AGENT_ID,
      impactSummary: "Integration test — no business impact.",
      metadata: {
        integrationTest: true,
        createdBy:       "AGENTIK-IDEMPOTENCY-VERIFY-01",
        testRunId:       TEST_RUN,
      },
    },
    relationships: [],
    auditTrail:    [],
    createdAt:     now,
    updatedAt:     now,
    metadata: {
      integrationTest: true,
      testRunId:       TEST_RUN,
    },
  };
}

// ── Phase 7: Task idempotency ─────────────────────────────────────────────────

async function testTaskIdempotency(): Promise<void> {
  console.log("\n── Phase 7: Task Idempotency ──");

  const idemKey = buildTaskIdempotencyKey(
    ORG_SLUG,
    AGENT_ID,
    RUN_ID,
    ACTION_ID,
    "create_task_verify",
    "operations",
    "verify-idempotency",
  );
  console.log(`  key: ${idemKey}`);

  const draft = makeTaskDraft();

  // First call
  const r1 = await taskService.createTaskIdempotent(draft, ORG_SLUG, idemKey);

  if (!r1.success || !r1.task) {
    fail("Task: first call failed", r1.message + (r1.errors ? ` | ${r1.errors.join(", ")}` : ""));
    return;
  }
  pass("Task: first call succeeded", `id=${r1.task.id.slice(0, 8)}`);

  if (r1.alreadyProcessed === false) {
    pass("Task: first call alreadyProcessed=false");
  } else {
    fail("Task: expected alreadyProcessed=false on first call", `got=${r1.alreadyProcessed}`);
  }

  cleanup.push(`task:${r1.task.id}`);

  // Second call with SAME key but new draft id
  const r2 = await taskService.createTaskIdempotent(
    { ...draft, id: randomUUID() },
    ORG_SLUG,
    idemKey,
  );

  if (!r2.success || !r2.task) {
    fail("Task: second call failed", r2.message);
    return;
  }

  if (r2.task.id === r1.task.id) {
    pass("Task: second call returned same task id");
  } else {
    fail("Task: second call returned DIFFERENT task id", `r1=${r1.task.id.slice(0,8)} r2=${r2.task.id.slice(0,8)}`);
  }

  if (r2.alreadyProcessed === true) {
    pass("Task: second call alreadyProcessed=true");
  } else {
    fail("Task: expected alreadyProcessed=true on second call", `got=${r2.alreadyProcessed}`);
  }

  // Cleanup
  const cancel = await taskService.cancelTask(r1.task.id, ORG_SLUG);
  if (cancel.success) {
    pass("Task: cleanup cancelled");
    cleanup.push(`cancelled:task:${r1.task.id}`);
  } else {
    fail("Task: cleanup failed", cancel.message);
  }
}

// ── Phase 8: Approval idempotency ─────────────────────────────────────────────

async function testApprovalIdempotency(): Promise<void> {
  console.log("\n── Phase 8: Approval Idempotency ──");

  const idemKey = buildApprovalIdempotencyKey(
    ORG_SLUG,
    AGENT_ID,
    RUN_ID,
    ACTION_ID,
    "create_approval_verify",
    "operations",
    "verify-idempotency",
  );
  console.log(`  key: ${idemKey}`);

  const request = makeApprovalRequest();

  // First call
  const r1 = await approvalService.createApprovalIdempotent(request, idemKey);

  if (!r1.approval) {
    fail("Approval: first call returned no approval", r1.message);
    return;
  }
  pass("Approval: first call succeeded", `id=${r1.approval.id.slice(0, 8)}`);

  if (r1.alreadyProcessed === false) {
    pass("Approval: first call alreadyProcessed=false");
  } else {
    fail("Approval: expected alreadyProcessed=false on first call", `got=${r1.alreadyProcessed}`);
  }

  cleanup.push(`approval:${r1.approval.id}`);

  // Second call with SAME key but new request id
  const r2 = await approvalService.createApprovalIdempotent(
    { ...request, id: randomUUID() },
    idemKey,
  );

  if (!r2.approval) {
    fail("Approval: second call returned no approval", r2.message);
    return;
  }

  if (r2.approval.id === r1.approval.id) {
    pass("Approval: second call returned same approval id");
  } else {
    fail("Approval: second call returned DIFFERENT approval id", `r1=${r1.approval.id.slice(0,8)} r2=${r2.approval.id.slice(0,8)}`);
  }

  if (r2.alreadyProcessed === true) {
    pass("Approval: second call alreadyProcessed=true");
  } else {
    fail("Approval: expected alreadyProcessed=true on second call", `got=${r2.alreadyProcessed}`);
  }

  // Cleanup
  const cancel = await approvalService.cancelApproval(
    r1.approval.id,
    { id: "system", type: "SYSTEM", name: "System" },
    "Integration test cleanup",
  );
  if (cancel.success) {
    pass("Approval: cleanup cancelled");
    cleanup.push(`cancelled:approval:${r1.approval.id}`);
  } else {
    fail("Approval: cleanup failed", cancel.message);
  }
}

// ── Phase 9: Constraint violation ─────────────────────────────────────────────

async function testConstraintViolation(): Promise<void> {
  console.log("\n── Phase 9: Constraint Violation (P2002) ──");

  // Resolve org id for the raw insert
  const org = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    fail("Constraint: could not resolve organizationId for castillitos");
    return;
  }

  const constraintKey = `verify-constraint-${randomUUID()}`;
  let task1Id: string | null = null;

  try {
    // Insert first record directly via raw prisma
    const t1 = await (prisma as any).task.create({
      data: {
        organizationId: org.id,
        title:          `[VERIFY] Constraint test 1 — ${TEST_RUN}`,
        priority:       "medium",
        status:         "open",
        source:         "system",
        category:       "general",
        ownerType:      "system",
        ownerId:        "system",
        ownerLabel:     "System",
        createdBy:      "system",
        idempotencyKey: constraintKey,
      },
    });
    task1Id = t1.id;
    pass("Constraint: first direct insert succeeded", `id=${t1.id.slice(0,8)}`);
    cleanup.push(`task-raw:${t1.id}`);

    // Attempt second insert with SAME idempotencyKey — must throw P2002
    try {
      await (prisma as any).task.create({
        data: {
          organizationId: org.id,
          title:          `[VERIFY] Constraint test 2 — ${TEST_RUN}`,
          priority:       "medium",
          status:         "open",
          source:         "system",
          category:       "general",
          ownerType:      "system",
          ownerId:        "system",
          ownerLabel:     "System",
          createdBy:      "system",
          idempotencyKey: constraintKey,
        },
      });
      fail("Constraint: second insert did NOT throw — partial unique index missing or inactive");
    } catch (err: unknown) {
      const code = (err as any)?.code;
      if (code === "P2002") {
        pass("Constraint: second insert threw P2002 as expected");
      } else {
        fail("Constraint: second insert threw unexpected error", `code=${code} ${String(err).slice(0,80)}`);
      }
    }
  } finally {
    // Cleanup first record
    if (task1Id) {
      try {
        await (prisma as any).task.update({
          where: { id: task1Id },
          data:  { status: "cancelled" },
        });
        cleanup.push(`cancelled:task-raw:${task1Id}`);
      } catch {
        // best-effort
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("AGENTIK-IDEMPOTENCY-VERIFY-01 — Live Idempotency Tests");
  console.log(`testRunId: ${TEST_RUN}`);
  console.log(`orgSlug:   ${ORG_SLUG}`);
  console.log("═".repeat(60));

  await testTaskIdempotency();
  await testApprovalIdempotency();
  await testConstraintViolation();

  if (cleanup.length > 0) {
    console.log("\n── Cleanup ──");
    cleanup.forEach(r => console.log(`  ${r}`));
  }

  console.log("\n" + "═".repeat(60));
  console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

  if (failed > 0) {
    console.error("\nIDEMPOTENCY LIVE TEST FAILED — BLOCKER");
    process.exit(1);
  }

  console.log("\nIDEMPOTENCY LIVE TESTS PASSED");
  process.exit(0);
}

main()
  .catch(err => {
    console.error("\nUnexpected error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
