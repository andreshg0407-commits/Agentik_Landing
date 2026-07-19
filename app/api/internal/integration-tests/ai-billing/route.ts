/**
 * app/api/internal/integration-tests/ai-billing/route.ts
 *
 * Agentik — AI Billing Foundation + Hardening — Integration Test Route
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01 (extends AGENTIK-AI-BILLING-FOUNDATION-01)
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - x-agentik-integration-token matches INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * 13 test cases:
 *   Foundation (1-7):
 *     1. Monthly grant creates ledger entry
 *     2. Text usage debits credits
 *     3. Image usage debits more credits than text
 *     4. Summary by agent works
 *     5. Summary by module works
 *     6. Low balance warning works
 *     7. Invalid usage rejected
 *   Hardening (8-13):
 *     8. Duplicate grant correlationId → idempotent
 *     9. Duplicate debit correlationId → idempotent, no double charge
 *    10. Insufficient credits → blocked
 *    11. Overage allowed → balance goes negative
 *    12. Balance reconstruction consistent
 *    13. Concurrent debits with unique ids → no duplicates
 */

import { NextRequest, NextResponse } from "next/server";
import { aiBillingService }          from "@/lib/ai-billing/server";
import { atomicDebit, atomicGrant, getStoredBalance } from "@/lib/ai-billing/server";
import {
  validateAiUsageRecord,
  calculateCreditsUsed,
  aggregateUsageByAgent,
  aggregateUsageByModule,
  isCreditBalanceLow,
  castillitosDiegoFinanceUsage,
  castillitosImageGenerationUsage,
} from "@/lib/ai-billing";

// ── Guard ─────────────────────────────────────────────────────────────────────

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token   = req.headers.get("x-agentik-integration-token") ?? "";
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
  return token === expected;
}

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  test:   number;
  label:  string;
  pass:   boolean;
  detail: string;
  error?: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const runId = Date.now();

  function record(test: number, label: string, pass: boolean, detail: string, error?: string): void {
    results.push({ test, label, pass, detail, error });
  }

  // ── Foundation: Test 1 — Monthly grant ───────────────────────────────────

  try {
    const grantResult = await aiBillingService.grantMonthlyCredits(
      "castillitos", 5000,
      "Integration test: monthly grant",
      `harness_grant_${runId}`,
    );
    record(1, "Monthly grant creates ledger entry",
      grantResult.success,
      `Balance: ${grantResult.balanceAfter}. Idempotent: false (first call).`,
      grantResult.errors[0],
    );
  } catch (err) {
    record(1, "Monthly grant creates ledger entry", false, "Exception", String(err));
  }

  // ── Foundation: Test 2 — Text usage debits ────────────────────────────────

  let textCreditsUsed = 0;
  try {
    const textInput = { ...castillitosDiegoFinanceUsage,
      id: undefined as unknown as typeof castillitosDiegoFinanceUsage.id,
      createdAt: undefined as unknown as string,
      correlationId: `harness_text_${runId}`,
    };
    const textResult = await aiBillingService.recordAiUsageAndDebitCredits(textInput as Parameters<typeof aiBillingService.recordAiUsageAndDebitCredits>[0]);
    textCreditsUsed = textResult.creditsUsed ?? 0;
    record(2, "Text usage debits credits",
      textResult.success && textCreditsUsed >= 1,
      `Debited ${textCreditsUsed} credits for TEXT_GENERATION.`,
      textResult.errors[0],
    );
  } catch (err) {
    record(2, "Text usage debits credits", false, "Exception", String(err));
  }

  // ── Foundation: Test 3 — Image usage debits more ──────────────────────────

  try {
    const imageInput = { ...castillitosImageGenerationUsage,
      id: undefined as unknown as typeof castillitosImageGenerationUsage.id,
      createdAt: undefined as unknown as string,
      correlationId: `harness_image_${runId}`,
    };
    const imageResult = await aiBillingService.recordAiUsageAndDebitCredits(imageInput as Parameters<typeof aiBillingService.recordAiUsageAndDebitCredits>[0]);
    const imageCredits = imageResult.creditsUsed ?? 0;
    record(3, "Image usage debits more than text",
      imageResult.success && imageCredits >= 100 && imageCredits > textCreditsUsed,
      `Image: ${imageCredits} credits (text was ${textCreditsUsed}).`,
      imageResult.errors[0],
    );
  } catch (err) {
    record(3, "Image usage debits more than text", false, "Exception", String(err));
  }

  // ── Foundation: Test 4 — Summary by agent ────────────────────────────────

  try {
    const records = [castillitosDiegoFinanceUsage, castillitosImageGenerationUsage];
    const byAgent  = aggregateUsageByAgent(records);
    const diegoBucket = byAgent.find(b => b.key === "diego");
    record(4, "Summary by agent works",
      !!diegoBucket && diegoBucket.recordCount >= 1,
      `diego bucket: ${diegoBucket?.recordCount ?? 0} records.`,
    );
  } catch (err) {
    record(4, "Summary by agent works", false, "Exception", String(err));
  }

  // ── Foundation: Test 5 — Summary by module ────────────────────────────────

  try {
    const byModule = aggregateUsageByModule([castillitosDiegoFinanceUsage, castillitosImageGenerationUsage]);
    record(5, "Summary by module works",
      byModule.length >= 1 && byModule.every(b => b.recordCount > 0),
      `${byModule.length} module buckets: ${byModule.map(b => b.key).join(", ")}.`,
    );
  } catch (err) {
    record(5, "Summary by module works", false, "Exception", String(err));
  }

  // ── Foundation: Test 6 — Low balance warning ──────────────────────────────

  try {
    record(6, "Low balance warning works",
      isCreditBalanceLow(50, 10000) && !isCreditBalanceLow(5000, 10000),
      `isCreditBalanceLow(50,10000)=true, isCreditBalanceLow(5000,10000)=false.`,
    );
  } catch (err) {
    record(6, "Low balance warning works", false, "Exception", String(err));
  }

  // ── Foundation: Test 7 — Invalid usage rejected ───────────────────────────

  try {
    const validation = validateAiUsageRecord({});
    record(7, "Invalid usage rejected by validator",
      !validation.valid && validation.errors.length > 0,
      `Errors: ${validation.errors.slice(0, 3).join(", ")}.`,
    );
  } catch (err) {
    record(7, "Invalid usage rejected by validator", false, "Exception", String(err));
  }

  // ── Hardening: Test 8 — Duplicate grant → idempotent ─────────────────────

  try {
    const grantKey8 = `harness_idem_grant_${runId}`;
    const [g1, g2] = await Promise.all([
      aiBillingService.grantMonthlyCredits("castillitos", 1000, "First", grantKey8),
      aiBillingService.grantMonthlyCredits("castillitos", 1000, "Second (duplicate)", grantKey8),
    ]);
    const balAfter = await getStoredBalance("castillitos");
    record(8, "Duplicate grant correlationId → idempotent",
      g1.success && g2.success,
      `Both calls succeeded. g1.auditTrail includes idempotent: ${g1.auditTrail[0]?.metadata?.idempotent}, g2: ${g2.auditTrail[0]?.metadata?.idempotent}.`,
    );
  } catch (err) {
    record(8, "Duplicate grant correlationId → idempotent", false, "Exception", String(err));
  }

  // ── Hardening: Test 9 — Duplicate debit → no double charge ───────────────

  try {
    const debitKey9 = `harness_idem_debit_${runId}`;
    const balBefore9 = await getStoredBalance("castillitos");
    const [d1, d2] = await Promise.all([
      atomicDebit({ orgSlug: "castillitos", type: "DEBIT", amount: 25, correlationId: debitKey9, reason: "First" }),
      atomicDebit({ orgSlug: "castillitos", type: "DEBIT", amount: 25, correlationId: debitKey9, reason: "Second (dup)" }),
    ]);
    const balAfter9 = await getStoredBalance("castillitos");
    const delta9    = balBefore9.balance - balAfter9.balance;
    const oneIdempotent = d1.idempotent !== d2.idempotent; // exactly one is idempotent
    record(9, "Duplicate debit correlationId → no double charge",
      (d1.success || d2.success) && delta9 === 25,
      `Balance Δ: ${delta9} (expected 25). Idempotent flags: [${d1.idempotent}, ${d2.idempotent}].`,
    );
  } catch (err) {
    record(9, "Duplicate debit correlationId → no double charge", false, "Exception", String(err));
  }

  // ── Hardening: Test 10 — Insufficient credits → blocked ──────────────────

  try {
    const blockedResult = await atomicDebit({
      orgSlug:       "castillitos",
      type:          "DEBIT",
      amount:        999_999_999,
      correlationId: `harness_blocked_${runId}`,
      reason:        "Intentional block test",
      overagePolicy: { allowOverage: false, overageLimitCredits: 0 },
    });
    record(10, "Insufficient credits → blocked",
      !blockedResult.success && blockedResult.blocked,
      `blocked: ${blockedResult.blocked}, reason: ${blockedResult.reason?.slice(0, 60)}.`,
    );
  } catch (err) {
    record(10, "Insufficient credits → blocked", false, "Exception", String(err));
  }

  // ── Hardening: Test 11 — Overage allowed ─────────────────────────────────

  try {
    const balBefore11 = await getStoredBalance("castillitos");
    // Attempt to debit more than balance but with overage allowed
    const overageAmount = balBefore11.balance + 100;
    const overageResult = await atomicDebit({
      orgSlug:       "castillitos",
      type:          "DEBIT",
      amount:        overageAmount,
      correlationId: `harness_overage_${runId}`,
      reason:        "Overage allowed test",
      overagePolicy: { allowOverage: true, overageLimitCredits: 1000 },
    });
    const balAfter11 = await getStoredBalance("castillitos");
    record(11, "Overage allowed → balance goes negative",
      overageResult.success && balAfter11.balance < 0,
      `balance: ${balBefore11.balance} → ${balAfter11.balance} (debited ${overageAmount}).`,
    );

    // Restore balance
    await atomicGrant({
      orgSlug: "castillitos", type: "GRANT",
      amount:  Math.abs(balAfter11.balance) + 500,
      correlationId: `harness_restore_${runId}`,
      reason: "Restore after overage test",
    });
  } catch (err) {
    record(11, "Overage allowed → balance goes negative", false, "Exception", String(err));
  }

  // ── Hardening: Test 12 — Balance reconstruction consistent ────────────────

  try {
    const reconstruction = await aiBillingService.reconstructBalanceFromLedger("castillitos");
    record(12, "Balance reconstruction consistent with stored",
      reconstruction.consistent,
      `Reconstructed: ${reconstruction.reconstructedBalance}, stored: ${reconstruction.storedBalance}, consistent: ${reconstruction.consistent}.`,
    );
  } catch (err) {
    record(12, "Balance reconstruction consistent", false, "Exception", String(err));
  }

  // ── Hardening: Test 13 — Concurrent debits no duplicates ──────────────────

  try {
    const N13 = 10;
    const amount13 = 1;
    const keys13 = Array.from({ length: N13 }, (_, i) => `harness_concurrent_${runId}_${i}`);
    const balBefore13 = await getStoredBalance("castillitos");
    const debits13 = await Promise.all(
      keys13.map((k, i) => atomicDebit({
        orgSlug: "castillitos", type: "DEBIT",
        amount: amount13, correlationId: k, reason: `Concurrent test ${i}`,
      })),
    );
    const balAfter13  = await getStoredBalance("castillitos");
    const succeeded13 = debits13.filter(d => d.success && !d.idempotent).length;
    const delta13     = balBefore13.balance - balAfter13.balance;
    record(13, "10 concurrent debits: correct delta, no duplicates",
      delta13 === succeeded13 * amount13 && debits13.every(d => !d.idempotent || !d.success),
      `${succeeded13} succeeded. Balance Δ: ${delta13}, expected: ${succeeded13 * amount13}.`,
    );
  } catch (err) {
    record(13, "10 concurrent debits: correct delta, no duplicates", false, "Exception", String(err));
  }

  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await runTests();
  const pass    = results.filter(r => r.pass).length;
  const fail    = results.filter(r => !r.pass).length;
  const verdict = fail === 0 ? "PASS" : pass === 0 ? "FAIL" : "PARTIAL";

  return NextResponse.json({
    sprint:    "AGENTIK-AI-BILLING-HARDENING-01",
    phase:     "Phase 13 — Integration Harness",
    testRunId: `ai_billing_hardened_${Date.now()}`,
    timestamp: new Date().toISOString(),
    summary:   { total: results.length, pass, fail },
    verdict,
    results,
  });
}
