/**
 * scripts/verify-idempotency-db.ts
 *
 * AGENTIK-IDEMPOTENCY-VERIFY-01 — DB schema verification
 *
 * Queries information_schema and pg_indexes to confirm:
 *   1. Task.idempotencyKey column exists
 *   2. Approval.idempotencyKey column exists
 *   3. Partial unique index on Task exists
 *   4. Partial unique index on Approval exists
 *
 * READ-ONLY. Does not modify any data.
 *
 * Run:
 *   npx dotenv-cli -e .env -- npx tsx scripts/verify-idempotency-db.ts
 */

import { prisma } from "../lib/prisma";

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  ✓ ${label}${detail ? `  → ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`);
}

async function main() {
  console.log("═".repeat(60));
  console.log("AGENTIK-IDEMPOTENCY-VERIFY-01 — DB Schema Verification");
  console.log("═".repeat(60));

  // ── 1. Column verification ─────────────────────────────────────────────────

  console.log("\n── Columns (information_schema.columns) ──");

  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('Task', 'Approval')
      AND column_name = 'idempotencyKey'
    ORDER BY table_name
  `;

  const taskCol     = columns.find(c => c.table_name === "Task");
  const approvalCol = columns.find(c => c.table_name === "Approval");

  if (taskCol) {
    pass("Task.idempotencyKey exists", `type=${taskCol.data_type}`);
  } else {
    fail("Task.idempotencyKey MISSING");
  }

  if (approvalCol) {
    pass("Approval.idempotencyKey exists", `type=${approvalCol.data_type}`);
  } else {
    fail("Approval.idempotencyKey MISSING");
  }

  // ── 2. Index verification ──────────────────────────────────────────────────

  console.log("\n── Indexes (pg_indexes) ──");

  const indexes = await prisma.$queryRaw<{
    tablename: string;
    indexname: string;
    indexdef:  string;
  }[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('Task', 'Approval')
      AND indexname IN ('Task_idempotencyKey_key', 'Approval_idempotencyKey_key')
    ORDER BY tablename
  `;

  const taskIdx     = indexes.find(i => i.indexname === "Task_idempotencyKey_key");
  const approvalIdx = indexes.find(i => i.indexname === "Approval_idempotencyKey_key");

  if (taskIdx) {
    const isPartial = taskIdx.indexdef.includes("WHERE") && taskIdx.indexdef.includes("IS NOT NULL");
    const isUnique  = taskIdx.indexdef.includes("UNIQUE");
    pass("Task_idempotencyKey_key exists",
      `unique=${isUnique} partial=${isPartial}`);
    if (!isPartial) fail("Task index is NOT a partial index (WHERE IS NOT NULL missing)");
    if (!isUnique)  fail("Task index is NOT unique");
    console.log(`     def: ${taskIdx.indexdef}`);
  } else {
    fail("Task_idempotencyKey_key MISSING");
  }

  if (approvalIdx) {
    const isPartial = approvalIdx.indexdef.includes("WHERE") && approvalIdx.indexdef.includes("IS NOT NULL");
    const isUnique  = approvalIdx.indexdef.includes("UNIQUE");
    pass("Approval_idempotencyKey_key exists",
      `unique=${isUnique} partial=${isPartial}`);
    if (!isPartial) fail("Approval index is NOT a partial index (WHERE IS NOT NULL missing)");
    if (!isUnique)  fail("Approval index is NOT unique");
    console.log(`     def: ${approvalIdx.indexdef}`);
  } else {
    fail("Approval_idempotencyKey_key MISSING");
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

  if (failed > 0) {
    console.error("\nMIGRATION NOT APPLIED — BLOCKER");
    process.exit(1);
  }

  console.log("\nIDEMPOTENCY DATABASE VERIFIED");
  process.exit(0);
}

main()
  .catch(err => {
    console.error("\nUnexpected error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
