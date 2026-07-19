/**
 * scripts/verify-ai-billing-db.ts
 *
 * Agentik — AI Billing Foundation — DB Structure Verification
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Verifies:
 *   - AiUsage table exists with correct columns
 *   - AiCreditLedger table exists with correct columns
 *   - Indexes exist
 *   - Prisma Client recognizes both models
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/verify-ai-billing-db.ts
 */
export type { };

import { prisma } from "../lib/prisma";

interface CheckResult {
  check:  string;
  pass:   boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(label: string, pass: boolean, detail: string): void {
  results.push({ check: label, pass, detail });
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${label}`);
  if (!pass) console.log(`     ${detail}`);
}

async function verifyColumn(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    tableName, columnName,
  );
  return rows.length > 0;
}

async function verifyIndex(indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
    indexName,
  );
  return rows.length > 0;
}

async function verifyTable(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    tableName,
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-BILLING-FOUNDATION-01 — DB Verification");
  console.log("=================================================================\n");

  // ── AiUsage table ──────────────────────────────────────────────────────────

  console.log("── AiUsage Table ─────────────────────────────────────────────");

  check("AiUsage table exists",
    await verifyTable("AiUsage"),
    "Run: npx dotenv-cli -e .env -- npx prisma migrate deploy");

  const usageCols = [
    "id", "organizationId", "orgSlug", "moduleSlug", "agentId",
    "agentDisplayName", "featureKey", "workflowRunId", "workExecutionId",
    "autonomousOperationId", "copilotSessionId", "provider", "model",
    "usageKind", "inputTokens", "outputTokens", "totalTokens",
    "imageUnits", "videoSeconds", "audioSeconds", "requestCount",
    "costUsd", "costMode", "creditsUsed", "status", "metadataJson", "createdAt",
  ];

  for (const col of usageCols) {
    check(`  AiUsage.${col} exists`,
      await verifyColumn("AiUsage", col),
      `Column ${col} missing from AiUsage`);
  }

  // ── AiUsage indexes ────────────────────────────────────────────────────────

  console.log("\n── AiUsage Indexes ────────────────────────────────────────────");

  const usageIndexes = [
    "AiUsage_organizationId_idx",
    "AiUsage_orgSlug_idx",
    "AiUsage_moduleSlug_idx",
    "AiUsage_agentId_idx",
    "AiUsage_featureKey_idx",
    "AiUsage_usageKind_idx",
    "AiUsage_createdAt_idx",
  ];

  for (const idx of usageIndexes) {
    check(`  Index ${idx} exists`,
      await verifyIndex(idx),
      `Index ${idx} missing from AiUsage`);
  }

  // ── AiCreditLedger table ───────────────────────────────────────────────────

  console.log("\n── AiCreditLedger Table ───────────────────────────────────────");

  check("AiCreditLedger table exists",
    await verifyTable("AiCreditLedger"),
    "Run: npx dotenv-cli -e .env -- npx prisma migrate deploy");

  const ledgerCols = [
    "id", "organizationId", "orgSlug", "type", "credits",
    "balanceAfter", "relatedUsageId", "relatedInvoiceId",
    "reason", "createdBy", "metadataJson", "createdAt",
  ];

  for (const col of ledgerCols) {
    check(`  AiCreditLedger.${col} exists`,
      await verifyColumn("AiCreditLedger", col),
      `Column ${col} missing from AiCreditLedger`);
  }

  // ── AiCreditLedger indexes ─────────────────────────────────────────────────

  console.log("\n── AiCreditLedger Indexes ─────────────────────────────────────");

  const ledgerIndexes = [
    "AiCreditLedger_organizationId_idx",
    "AiCreditLedger_orgSlug_idx",
    "AiCreditLedger_type_idx",
    "AiCreditLedger_createdAt_idx",
  ];

  for (const idx of ledgerIndexes) {
    check(`  Index ${idx} exists`,
      await verifyIndex(idx),
      `Index ${idx} missing from AiCreditLedger`);
  }

  // ── Prisma Client recognition ──────────────────────────────────────────────

  console.log("\n── Prisma Client Recognition ──────────────────────────────────");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAiUsage = typeof (prisma as any).aiUsage?.findFirst === "function";
  check("prisma.aiUsage recognized", hasAiUsage, "Prisma client missing aiUsage — run: npx prisma generate");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAiCreditLedger = typeof (prisma as any).aiCreditLedger?.findFirst === "function";
  check("prisma.aiCreditLedger recognized", hasAiCreditLedger, "Prisma client missing aiCreditLedger — run: npx prisma generate");

  // ── Summary ────────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log("\n=================================================================");
  console.log(`  Total:   ${results.length}`);
  console.log(`  Pass:    ${passed}`);
  console.log(`  Fail:    ${failed}`);
  console.log(`  Verdict: ${failed === 0 ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=================================================================\n");

  if (failed > 0) {
    const failedChecks = results.filter(r => !r.pass);
    console.log("Failed checks:");
    for (const f of failedChecks) console.log(`  ✗ ${f.check}: ${f.detail}`);
    process.exit(1);
  }
}

main()
  .catch(err => {
    console.error("Verification crashed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
