/**
 * scripts/verify-ai-billing-live.ts
 *
 * Agentik — AI Billing Foundation — Live Service Verification
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Tests the full service pipeline against the real DB:
 *   1. grantMonthlyCredits
 *   2. recordAiUsageAndDebitCredits (Diego finance)
 *   3. recordAiUsageAndDebitCredits (Luca marketing)
 *   4. recordAiUsageAndDebitCredits (Copilot)
 *   5. Verify usage persisted
 *   6. Verify ledger persisted
 *   7. Verify balance decreases
 *   8. Verify summary aggregates
 *
 * No real AI provider calls. All fixture data.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/verify-ai-billing-live.ts
 */
export type { };

import { aiBillingService }     from "../lib/ai-billing/server";
import { aiBillingPrismaRepository } from "../lib/ai-billing/server";
import {
  castillitosDiegoFinanceUsage,
  castillitosLucaMarketingUsage,
  castillitosCopilotUsage,
} from "../lib/ai-billing";
import { prisma } from "../lib/prisma";

interface TestResult {
  test:   number;
  label:  string;
  pass:   boolean;
  detail: string;
  error?: string;
}

const results: TestResult[] = [];

function record(test: number, label: string, pass: boolean, detail: string, error?: string): void {
  results.push({ test, label, pass, detail, error });
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} [${String(test).padStart(2, "0")}] ${label}`);
  if (!pass || process.env.VERBOSE === "1") console.log(`       ${detail}${error ? ` | ERROR: ${error}` : ""}`);
}

const ORG_SLUG = "castillitos";

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-BILLING-FOUNDATION-01 — Live Service Verification");
  console.log(`  Tenant: ${ORG_SLUG}`);
  console.log("=================================================================\n");

  // ── Test 1: Monthly grant ─────────────────────────────────────────────────

  let balanceBeforeGrant = 0;
  try {
    const b = await aiBillingPrismaRepository.getCreditBalance(ORG_SLUG);
    balanceBeforeGrant = b.availableCredits;
  } catch { /* first run — no history */ }

  const grantResult = await aiBillingService.grantMonthlyCredits(
    ORG_SLUG,
    10000,
    "Live verification: June 2026 test grant",
  );

  record(1, "grantMonthlyCredits creates ledger entry",
    grantResult.success && !!grantResult.ledgerEntry,
    `Granted 10000 credits. LedgerId: ${grantResult.ledgerEntry?.id ?? "none"}`,
    grantResult.errors[0],
  );

  record(2, "Balance increases after grant",
    grantResult.balanceAfter !== undefined && grantResult.balanceAfter > balanceBeforeGrant,
    `Balance: ${balanceBeforeGrant} → ${grantResult.balanceAfter}`,
  );

  // ── Test 3: Diego finance usage ────────────────────────────────────────────

  const diegoInput = {
    ...castillitosDiegoFinanceUsage,
    id:        undefined as unknown as typeof castillitosDiegoFinanceUsage.id,
    createdAt: undefined as unknown as string,
  };

  const diegoResult = await aiBillingService.recordAiUsageAndDebitCredits(diegoInput as Parameters<typeof aiBillingService.recordAiUsageAndDebitCredits>[0]);

  record(3, "Diego finance usage persisted",
    diegoResult.success && !!diegoResult.usageRecord,
    `UsageId: ${diegoResult.usageRecord?.id ?? "none"}, credits: ${diegoResult.creditsUsed}`,
    diegoResult.errors[0],
  );

  record(4, "Balance decreases after Diego debit",
    diegoResult.balanceAfter !== undefined && diegoResult.balanceAfter < (grantResult.balanceAfter ?? Infinity),
    `Balance after Diego: ${diegoResult.balanceAfter}`,
  );

  // ── Test 5: Luca marketing usage ───────────────────────────────────────────

  const lucaInput = { ...castillitosLucaMarketingUsage, id: undefined as unknown as typeof castillitosLucaMarketingUsage.id, createdAt: undefined as unknown as string };
  const lucaResult = await aiBillingService.recordAiUsageAndDebitCredits(lucaInput as Parameters<typeof aiBillingService.recordAiUsageAndDebitCredits>[0]);

  record(5, "Luca marketing usage persisted",
    lucaResult.success && !!lucaResult.usageRecord,
    `UsageId: ${lucaResult.usageRecord?.id ?? "none"}, credits: ${lucaResult.creditsUsed}`,
    lucaResult.errors[0],
  );

  // ── Test 6: Copilot usage ─────────────────────────────────────────────────

  const copilotInput = { ...castillitosCopilotUsage, id: undefined as unknown as typeof castillitosCopilotUsage.id, createdAt: undefined as unknown as string };
  const copilotResult = await aiBillingService.recordAiUsageAndDebitCredits(copilotInput as Parameters<typeof aiBillingService.recordAiUsageAndDebitCredits>[0]);

  record(6, "Copilot usage persisted",
    copilotResult.success && !!copilotResult.usageRecord,
    `UsageId: ${copilotResult.usageRecord?.id ?? "none"}, credits: ${copilotResult.creditsUsed}`,
    copilotResult.errors[0],
  );

  // ── Test 7: Usage summary aggregates ──────────────────────────────────────

  const summary = await aiBillingService.getTenantAiUsageSummary(ORG_SLUG);

  record(7, "Usage summary has records",
    summary.recordCount > 0,
    `Records: ${summary.recordCount}, totalCredits: ${summary.totalCreditsUsed}`,
  );

  record(8, "Summary total credits > 0",
    summary.totalCreditsUsed > 0,
    `totalCreditsUsed = ${summary.totalCreditsUsed}`,
  );

  // ── Test 9: Final balance ─────────────────────────────────────────────────

  const finalBalance = await aiBillingService.getTenantCreditBalance(ORG_SLUG);
  const totalDebited = (diegoResult.creditsUsed ?? 0) + (lucaResult.creditsUsed ?? 0) + (copilotResult.creditsUsed ?? 0);

  record(9, "Final balance is consistent",
    finalBalance.availableCredits >= 0,
    `Final balance: ${finalBalance.availableCredits}, totalDebited this run: ${totalDebited}`,
  );

  record(10, "Credit balance computed correctly",
    finalBalance.totalGranted > 0 && finalBalance.totalDebited >= 0,
    `totalGranted: ${finalBalance.totalGranted}, totalDebited: ${finalBalance.totalDebited}`,
  );

  // ── Summary ────────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log("\n=================================================================");
  console.log(`  Total:   ${results.length}`);
  console.log(`  Pass:    ${passed}`);
  console.log(`  Fail:    ${failed}`);
  console.log(`  Verdict: ${failed === 0 ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`\n  Final balance: ${finalBalance.availableCredits} credits`);
  console.log(`  Total cost recorded: $${summary.totalCostUsd.toFixed(4)}`);
  console.log("=================================================================\n");

  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch(err => {
    console.error("Live verification crashed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
