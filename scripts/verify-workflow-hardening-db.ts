/**
 * scripts/verify-workflow-hardening-db.ts
 *
 * Agentik — Workflow Hardening DB Verification
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01 — Phase 16
 *
 * Verifies that all DB-level hardening constraints are in place:
 *   1. WorkflowRun.idempotencyKey column exists
 *   2. Partial unique index on idempotencyKey (WHERE NOT NULL) exists
 *   3. WorkflowRun_triggerExecutionId_idx index exists
 *   4. WorkflowRun table has expected hardening columns
 *
 * READ-ONLY. No mutations. No side effects.
 *
 * Run with:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx tsx scripts/verify-workflow-hardening-db.ts
 */

import { PrismaClient } from "@prisma/client";

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

async function main(): Promise<void> {
  console.log("\nAGENTIK-WORKFLOW-HARDENING-01 — DB Verification");
  console.log("─────────────────────────────────────────────────");

  // ── Check 1: WorkflowRun table exists ────────────────────────────────────────

  console.log("\nSection 1 — WorkflowRun table");

  try {
    const tableCheck = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = 'WorkflowRun'
    `;
    if (tableCheck.length > 0) {
      pass("WorkflowRun table exists in public schema");
    } else {
      fail("WorkflowRun table exists", "table not found in pg_tables");
    }
  } catch (err: unknown) {
    fail("WorkflowRun table exists", err instanceof Error ? err.message : String(err));
  }

  // ── Check 2: idempotencyKey column ────────────────────────────────────────────

  console.log("\nSection 2 — idempotencyKey column");

  try {
    const col = await prisma.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'WorkflowRun'
        AND column_name  = 'idempotencyKey'
    `;
    if (col.length > 0) {
      pass("idempotencyKey column exists on WorkflowRun");
      if (col[0].is_nullable === "YES") {
        pass("idempotencyKey is nullable (required for partial unique index)");
      } else {
        fail("idempotencyKey is nullable", `is_nullable=${col[0].is_nullable} — expected YES`);
      }
      if (col[0].data_type === "text") {
        pass("idempotencyKey data_type is text");
      } else {
        fail("idempotencyKey data_type is text", `got ${col[0].data_type}`);
      }
    } else {
      fail("idempotencyKey column exists", "column not found in information_schema.columns");
    }
  } catch (err: unknown) {
    fail("idempotencyKey column check", err instanceof Error ? err.message : String(err));
  }

  // ── Check 3: Partial unique index on idempotencyKey ───────────────────────────

  console.log("\nSection 3 — Partial unique index on idempotencyKey");

  try {
    const idx = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'WorkflowRun'
        AND indexname LIKE '%idempotencyKey%'
    `;
    if (idx.length > 0) {
      pass(`idempotencyKey index found: ${idx[0].indexname}`);
      const def = idx[0].indexdef.toLowerCase();
      if (def.includes("unique")) {
        pass("idempotencyKey index is UNIQUE");
      } else {
        fail("idempotencyKey index is UNIQUE", `indexdef: ${idx[0].indexdef}`);
      }
      if (def.includes("where") && def.includes("is not null")) {
        pass("idempotencyKey index is PARTIAL (WHERE IS NOT NULL)");
      } else {
        fail("idempotencyKey index is PARTIAL", `indexdef: ${idx[0].indexdef}`);
      }
    } else {
      fail("idempotencyKey index found", "no index found matching %idempotencyKey%");
    }
  } catch (err: unknown) {
    fail("idempotencyKey index check", err instanceof Error ? err.message : String(err));
  }

  // ── Check 4: triggerExecutionId index ─────────────────────────────────────────

  console.log("\nSection 4 — triggerExecutionId index");

  try {
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'WorkflowRun'
        AND indexname  = 'WorkflowRun_triggerExecutionId_idx'
    `;
    if (idx.length > 0) {
      pass("WorkflowRun_triggerExecutionId_idx exists");
    } else {
      fail("WorkflowRun_triggerExecutionId_idx exists", "index not found");
    }
  } catch (err: unknown) {
    fail("triggerExecutionId index check", err instanceof Error ? err.message : String(err));
  }

  // ── Check 5: Required hardening columns present ────────────────────────────────

  console.log("\nSection 5 — Required WorkflowRun columns");

  const requiredCols = [
    "id", "organizationId", "chainId", "chainName", "status",
    "triggerExecutionId", "triggerApprovalId", "idempotencyKey",
    "currentStepId", "stepsJson", "auditTrailJson", "metadataJson",
    "createdAt", "updatedAt", "completedAt", "failedAt",
  ];

  try {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'WorkflowRun'
    `;
    const colSet = new Set(cols.map(c => c.column_name));
    for (const col of requiredCols) {
      if (colSet.has(col)) {
        pass(`column '${col}' present`);
      } else {
        fail(`column '${col}' present`, "missing from WorkflowRun");
      }
    }
  } catch (err: unknown) {
    fail("WorkflowRun columns check", err instanceof Error ? err.message : String(err));
  }

  // ── Summary ────────────────────────────────────────────────────────────────────

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("AGENTIK-WORKFLOW-HARDENING-01 — DB Verification Results");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\nFailed checks:");
    failures.forEach(f => console.log(`  ✗ ${f}`));
    await prisma.$disconnect();
    process.exit(1);
  } else {
    console.log("\nAll DB hardening constraints verified. Schema is production-ready.");
    await prisma.$disconnect();
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
