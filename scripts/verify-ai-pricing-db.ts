/**
 * scripts/verify-ai-pricing-db.ts
 *
 * Agentik — AI Pricing Engine — DB Schema Verification
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Verifies: AiProvider + AiModelRate tables exist, columns present,
 * indexes exist, foreign key works, Prisma client recognizes models.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx --conditions=react-server \
 *     scripts/verify-ai-pricing-db.ts
 */
export type { };

import { prisma }           from "../lib/prisma";
import { aiPricingService } from "../lib/ai-pricing/server/ai-pricing-service";

interface TestResult { test: number; label: string; pass: boolean; detail: string; error?: string; }
const results: TestResult[] = [];

function record(test: number, label: string, pass: boolean, detail: string, error?: string): void {
  results.push({ test, label, pass, detail, error });
  console.log(`  ${pass ? "✓" : "✗"} [${String(test).padStart(2, "0")}] ${label}`);
  if (!pass || detail) console.log(`       ${detail}${error ? ` | ERROR: ${error}` : ""}`);
}

const db = prisma as unknown as { $queryRaw: Function; aiProvider: { findMany: Function; count: Function }; aiModelRate: { findMany: Function; count: Function } };

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-PRICING-ENGINE-01 — DB Schema Verification");
  console.log("=================================================================\n");

  // ── Test 1: AiProvider table exists ─────────────────────────────────────────

  try {
    const rows: unknown[] = await db.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'AiProvider'
      ORDER BY ordinal_position
    `;
    const cols = (rows as { column_name: string }[]).map(r => r.column_name);
    record(1, "AiProvider table exists", rows.length > 0, `${rows.length} columns found`);
    record(2, "AiProvider.id column", cols.includes("id"), `columns: ${cols.join(", ")}`);
    record(3, "AiProvider.kind column", cols.includes("kind"), "");
    record(4, "AiProvider.status column", cols.includes("status"), "");
    record(5, "AiProvider.supportsTokenBilling column", cols.includes("supportsTokenBilling"), "");
    record(6, "AiProvider.supportsUnitBilling column", cols.includes("supportsUnitBilling"), "");
  } catch (err) {
    record(1, "AiProvider table exists", false, "Table query failed", String(err));
    record(2, "AiProvider.id column", false, "Skipped", "");
    record(3, "AiProvider.kind column", false, "Skipped", "");
    record(4, "AiProvider.status column", false, "Skipped", "");
    record(5, "AiProvider.supportsTokenBilling column", false, "Skipped", "");
    record(6, "AiProvider.supportsUnitBilling column", false, "Skipped", "");
  }

  // ── Test 2: AiModelRate table exists ────────────────────────────────────────

  try {
    const rows: unknown[] = await db.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'AiModelRate'
      ORDER BY ordinal_position
    `;
    const cols = (rows as { column_name: string }[]).map(r => r.column_name);
    record(7,  "AiModelRate table exists", rows.length > 0, `${rows.length} columns found`);
    record(8,  "AiModelRate.id column", cols.includes("id"), "");
    record(9,  "AiModelRate.providerId column", cols.includes("providerId"), "");
    record(10, "AiModelRate.modelId column", cols.includes("modelId"), "");
    record(11, "AiModelRate.usageKind column", cols.includes("usageKind"), "");
    record(12, "AiModelRate.inputTokenCostPer1M column", cols.includes("inputTokenCostPer1M"), "");
    record(13, "AiModelRate.outputTokenCostPer1M column", cols.includes("outputTokenCostPer1M"), "");
    record(14, "AiModelRate.imageUnitCost column", cols.includes("imageUnitCost"), "");
    record(15, "AiModelRate.videoSecondCost column", cols.includes("videoSecondCost"), "");
    record(16, "AiModelRate.audioSecondCost column", cols.includes("audioSecondCost"), "");
    record(17, "AiModelRate.minimumCredits column", cols.includes("minimumCredits"), "");
    record(18, "AiModelRate.creditMarkupMultiplier column", cols.includes("creditMarkupMultiplier"), "");
    record(19, "AiModelRate.effectiveFrom column", cols.includes("effectiveFrom"), "");
    record(20, "AiModelRate.effectiveTo column", cols.includes("effectiveTo"), "");
    record(21, "AiModelRate.status column", cols.includes("status"), "");
  } catch (err) {
    for (let i = 7; i <= 21; i++) {
      record(i, `AiModelRate check ${i}`, false, "Skipped", String(err));
    }
  }

  // ── Test 3: Indexes ──────────────────────────────────────────────────────────

  try {
    const indexes: unknown[] = await db.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('AiProvider', 'AiModelRate')
    `;
    const idxNames = (indexes as { indexname: string }[]).map(i => i.indexname);
    record(22, "AiProvider_kind_idx exists",          idxNames.some(n => n.includes("kind")),          `indexes: ${idxNames.join(", ")}`);
    record(23, "AiProvider_status_idx exists",        idxNames.some(n => n.includes("AiProvider") && n.includes("status")), "");
    record(24, "AiModelRate_providerId_idx exists",   idxNames.some(n => n.includes("providerId")),    "");
    record(25, "AiModelRate_usageKind_idx exists",    idxNames.some(n => n.includes("usageKind")),     "");
    record(26, "AiModelRate_effectiveFrom_idx exists",idxNames.some(n => n.includes("effectiveFrom")), "");
  } catch (err) {
    for (let i = 22; i <= 26; i++) {
      record(i, `Index check ${i}`, false, "Skipped", String(err));
    }
  }

  // ── Test 4: Foreign key constraint ──────────────────────────────────────────

  try {
    const fks: unknown[] = await db.$queryRaw`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'AiModelRate'
        AND constraint_type = 'FOREIGN KEY'
    `;
    record(27, "AiModelRate has FK to AiProvider", (fks as unknown[]).length > 0,
      `FK constraints: ${(fks as { constraint_name: string }[]).map(f => f.constraint_name).join(", ")}`);
  } catch (err) {
    record(27, "AiModelRate FK constraint", false, "Skipped", String(err));
  }

  // ── Test 5: Global provider seeded by migration ──────────────────────────────

  try {
    const globalProv: unknown[] = await db.$queryRaw`
      SELECT id FROM "AiProvider" WHERE id = 'global'
    `;
    record(28, "Global fallback provider seeded by migration", (globalProv as unknown[]).length === 1,
      `${(globalProv as unknown[]).length} row(s) found for 'global'`);
  } catch (err) {
    record(28, "Global provider seeded", false, "Query failed", String(err));
  }

  // ── Test 6: Prisma client recognizes AiProvider ──────────────────────────────

  try {
    const count = await db.aiProvider.count();
    record(29, "Prisma recognizes aiProvider model", typeof count === "number",
      `Prisma aiProvider.count() = ${count}`);
  } catch (err) {
    record(29, "Prisma recognizes aiProvider model", false, "Prisma query failed", String(err));
  }

  // ── Test 7: Prisma client recognizes AiModelRate ─────────────────────────────

  try {
    const count = await db.aiModelRate.count();
    record(30, "Prisma recognizes aiModelRate model", typeof count === "number",
      `Prisma aiModelRate.count() = ${count}`);
  } catch (err) {
    record(30, "Prisma recognizes aiModelRate model", false, "Prisma query failed", String(err));
  }

  // ── Test 8: Seed + verify count ──────────────────────────────────────────────

  try {
    const seedResult = await aiPricingService.seedDefaultProvidersAndRates();
    record(31, "seedDefaultProvidersAndRates runs without error",
      seedResult.errors.length === 0,
      `Providers: ${seedResult.providersSeeded}, rates: ${seedResult.ratesSeeded}, errors: ${seedResult.errors.length}`);

    const provCount = await db.aiProvider.count();
    record(32, "AiProvider rows after seed ≥ 5", provCount >= 5, `Provider count: ${provCount}`);

    const rateCount = await db.aiModelRate.count();
    record(33, "AiModelRate rows after seed ≥ 10", rateCount >= 10, `Rate count: ${rateCount}`);
  } catch (err) {
    record(31, "Seed runs", false, "Exception", String(err));
    record(32, "Provider count check", false, "Skipped", "");
    record(33, "Rate count check", false, "Skipped", "");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;

  console.log("\n=================================================================");
  console.log(`  Total: ${results.length} | Pass: ${pass} | Fail: ${fail}`);
  console.log(`  Verdict: ${fail === 0 ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=================================================================\n");

  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch(err => { console.error("DB verify crashed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
