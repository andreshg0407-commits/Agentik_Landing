/**
 * scripts/validate-ai-billing.ts
 *
 * Agentik — AI Billing Foundation — Pure Validation Suite
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Runs 80+ checks against the pure domain layer.
 * No Prisma. No server-only. No I/O.
 *
 * Usage:
 *   npx tsx scripts/validate-ai-billing.ts
 */
export type { };

import {
  calculateTokenTotals,
  calculateEstimatedCostUsd,
  calculateCreditsUsed,
  calculateGrossMargin,
  normalizeUsageKind,
  aggregateUsageByTenant,
  aggregateUsageByModule,
  aggregateUsageByAgent,
  aggregateUsageByFeature,
  summarizeUsage,
  createCreditLedgerEntry,
  applyCreditDebit,
  applyCreditGrant,
  calculateCreditBalance,
  isCreditBalanceLow,
  validateAiUsageRecord,
  validateCreditLedgerEntry,
  auditAiBillingDomain,
  createAiBillingAuditEvent,
  successBillingResult,
  failedBillingResult,
  DEFAULT_CREDIT_RATES,
  castillitosDiegoFinanceUsage,
  castillitosLucaMarketingUsage,
  castillitosCopilotUsage,
  castillitosImageGenerationUsage,
  arketopsDocumentAnalysisUsage,
  castillitosVideoGenerationUsage,
  castillitosAutonomousOperationUsage,
  lowBalanceLedgerFixture,
  monthlyGrantFixture,
  usageDebitFixture,
} from "../lib/ai-billing";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    process.stdout.write(`  ✓ ${label}\n`);
  } else {
    failed++;
    failures.push(label);
    process.stdout.write(`  ✗ ${label}\n`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ── §1 calculateTokenTotals ───────────────────────────────────────────────────
section("§1 calculateTokenTotals");

const t1 = calculateTokenTotals(1000, 500);
assert(t1.inputTokens  === 1000,  "inputTokens passes through");
assert(t1.outputTokens === 500,   "outputTokens passes through");
assert(t1.totalTokens  === 1500,  "totalTokens = input + output");

const t2 = calculateTokenTotals(-100, -50);
assert(t2.inputTokens  === 0, "negative inputTokens clamped to 0");
assert(t2.outputTokens === 0, "negative outputTokens clamped to 0");
assert(t2.totalTokens  === 0, "clamped total is 0");

const t3 = calculateTokenTotals(1.7, 2.9);
assert(t3.inputTokens  === 1, "fractional inputTokens floored");
assert(t3.outputTokens === 2, "fractional outputTokens floored");

// ── §2 calculateEstimatedCostUsd ─────────────────────────────────────────────
section("§2 calculateEstimatedCostUsd");

const cost1 = calculateEstimatedCostUsd({ usageKind: "TEXT_GENERATION", inputTokens: 1000, outputTokens: 500 });
assert(cost1 > 0,           "cost > 0 for text tokens");
assert(typeof cost1 === "number", "cost is a number");

const costImage = calculateEstimatedCostUsd({ usageKind: "IMAGE_GENERATION", inputTokens: 0, outputTokens: 0, imageUnits: 2 });
assert(costImage > 0,       "cost > 0 for 2 image units");
assert(costImage >= 0.04 * 2, "image cost at least 2 × base rate");

const costVideo = calculateEstimatedCostUsd({ usageKind: "VIDEO_GENERATION", inputTokens: 0, outputTokens: 0, videoSeconds: 30 });
assert(costVideo > 0,       "cost > 0 for 30s video");
assert(costVideo >= 0.25 * 30, "video cost at least 30 × base rate");

const costZero = calculateEstimatedCostUsd({ usageKind: "EMBEDDING", inputTokens: 0, outputTokens: 0 });
assert(costZero === 0,      "zero tokens → zero cost");

// ── §3 calculateCreditsUsed — minimum floors ──────────────────────────────────
section("§3 calculateCreditsUsed — minimum credit floors");

const credText   = calculateCreditsUsed({ usageKind: "TEXT_GENERATION",   inputTokens: 0, outputTokens: 0 });
assert(credText  >= 1,   "TEXT_GENERATION minimum ≥ 1 credit");

const credJson   = calculateCreditsUsed({ usageKind: "JSON_REASONING",    inputTokens: 0, outputTokens: 0 });
assert(credJson  >= 2,   "JSON_REASONING minimum ≥ 2 credits");

const credDoc    = calculateCreditsUsed({ usageKind: "DOCUMENT_ANALYSIS", inputTokens: 0, outputTokens: 0 });
assert(credDoc   >= 5,   "DOCUMENT_ANALYSIS minimum ≥ 5 credits");

const credImg    = calculateCreditsUsed({ usageKind: "IMAGE_GENERATION",  inputTokens: 0, outputTokens: 0, imageUnits: 0 });
assert(credImg   >= 100, "IMAGE_GENERATION minimum ≥ 100 credits");

const credVid    = calculateCreditsUsed({ usageKind: "VIDEO_GENERATION",  inputTokens: 0, outputTokens: 0 });
assert(credVid   >= 500, "VIDEO_GENERATION minimum ≥ 500 credits");

const credEmbed  = calculateCreditsUsed({ usageKind: "EMBEDDING",         inputTokens: 0, outputTokens: 0 });
assert(credEmbed >= 1,   "EMBEDDING minimum ≥ 1 credit");

const credVision = calculateCreditsUsed({ usageKind: "VISION_ANALYSIS",   inputTokens: 0, outputTokens: 0 });
assert(credVision >= 10, "VISION_ANALYSIS minimum ≥ 10 credits");

const credTool   = calculateCreditsUsed({ usageKind: "TOOL_CALL",         inputTokens: 0, outputTokens: 0 });
assert(credTool  >= 1,   "TOOL_CALL minimum ≥ 1 credit");

const credClass  = calculateCreditsUsed({ usageKind: "CLASSIFICATION",    inputTokens: 0, outputTokens: 0 });
assert(credClass >= 1,   "CLASSIFICATION minimum ≥ 1 credit");

const credTranscript = calculateCreditsUsed({ usageKind: "TRANSCRIPTION", inputTokens: 0, outputTokens: 0 });
assert(credTranscript >= 1, "TRANSCRIPTION minimum ≥ 1 credit");

// Credits scale with tokens
const credScaled = calculateCreditsUsed({ usageKind: "TEXT_GENERATION", inputTokens: 100000, outputTokens: 50000 });
assert(credScaled > 10, "large token counts produce more than minimum credits");

// ── §4 calculateGrossMargin ───────────────────────────────────────────────────
section("§4 calculateGrossMargin");

const margin1 = calculateGrossMargin({ creditsUsed: 100, creditPriceUsd: 0.01, providerCostUsd: 0.05 });
assert(margin1.revenueUsd    === 1.0,  "revenue = credits × price");
assert(margin1.grossMarginUsd === 0.95, "margin = revenue - cost");
assert(margin1.marginPct     === 95,   "margin % = 95%");

const marginZeroRevenue = calculateGrossMargin({ creditsUsed: 0, creditPriceUsd: 0.01, providerCostUsd: 0.05 });
assert(marginZeroRevenue.marginPct === 0, "zero revenue → 0% margin (no div-by-zero)");

// ── §5 normalizeUsageKind ─────────────────────────────────────────────────────
section("§5 normalizeUsageKind");

assert(normalizeUsageKind("TEXT_GENERATION")  === "TEXT_GENERATION",  "uppercase passthrough");
assert(normalizeUsageKind("text")             === "TEXT_GENERATION",  "alias 'text' resolves");
assert(normalizeUsageKind("image")            === "IMAGE_GENERATION", "alias 'image' resolves");
assert(normalizeUsageKind("reasoning")        === "JSON_REASONING",   "alias 'reasoning' resolves");
assert(normalizeUsageKind("document")         === "DOCUMENT_ANALYSIS","alias 'document' resolves");
assert(normalizeUsageKind("UNKNOWN_KIND")     === null,               "unknown kind returns null");

// ── §6 aggregateUsageByTenant ─────────────────────────────────────────────────
section("§6 aggregateUsageByTenant");

const allRecords = [
  castillitosDiegoFinanceUsage,
  castillitosLucaMarketingUsage,
  castillitosCopilotUsage,
  castillitosImageGenerationUsage,
  castillitosVideoGenerationUsage,
  castillitosAutonomousOperationUsage,
  arketopsDocumentAnalysisUsage,
];

const byTenant = aggregateUsageByTenant(allRecords);
assert(byTenant.length === 2, "two tenant buckets: castillitos + arketops");

const castBucket = byTenant.find(b => b.key === "castillitos");
assert(!!castBucket,                        "castillitos bucket exists");
assert(castBucket!.recordCount === 6,       "castillitos has 6 records");
assert(castBucket!.totalCreditsUsed > 0,   "castillitos credits > 0");

const arketopsBucket = byTenant.find(b => b.key === "arketops");
assert(!!arketopsBucket,                    "arketops bucket exists");
assert(arketopsBucket!.recordCount === 1,  "arketops has 1 record");

// ── §7 aggregateUsageByModule ─────────────────────────────────────────────────
section("§7 aggregateUsageByModule");

const byModule = aggregateUsageByModule(allRecords);
assert(byModule.length >= 3, "at least 3 module buckets");

const finModule = byModule.find(b => b.key === "finanzas");
assert(!!finModule,           "finanzas module bucket exists");
assert(finModule!.recordCount >= 1, "finanzas has at least 1 record");

const msModule = byModule.find(b => b.key === "marketing-studio");
assert(!!msModule,            "marketing-studio module bucket exists");
assert(msModule!.recordCount >= 2, "marketing-studio has at least 2 records");

// ── §8 aggregateUsageByAgent ──────────────────────────────────────────────────
section("§8 aggregateUsageByAgent");

const byAgent = aggregateUsageByAgent(allRecords);
const diegoBucket = byAgent.find(b => b.key === "diego");
assert(!!diegoBucket,          "diego agent bucket exists");
assert(diegoBucket!.recordCount >= 2, "diego has multiple records");

const lucaBucket = byAgent.find(b => b.key === "luca");
assert(!!lucaBucket,           "luca agent bucket exists");

// ── §9 aggregateUsageByFeature ────────────────────────────────────────────────
section("§9 aggregateUsageByFeature");

const byFeature = aggregateUsageByFeature(allRecords);
assert(byFeature.length === allRecords.length, "one bucket per unique featureKey (all unique)");

// ── §10 summarizeUsage ────────────────────────────────────────────────────────
section("§10 summarizeUsage");

const summary = summarizeUsage(allRecords, { orgSlug: "castillitos" });
assert(summary.orgSlug           === "castillitos", "summary orgSlug set");
assert(summary.totalCreditsUsed  > 0,              "total credits > 0");
assert(summary.totalCostUsd      > 0,              "total cost > 0");
assert(summary.totalRequests     === allRecords.length, "total requests = record count");
assert(summary.recordCount       === allRecords.length, "record count matches");

const summaryWithMargin = summarizeUsage(allRecords, { orgSlug: "all", creditPriceUsd: 0.01 });
assert(summaryWithMargin.estimatedRevenueUsd !== undefined, "estimatedRevenueUsd present when creditPriceUsd given");
assert(summaryWithMargin.grossMarginUsd !== undefined,      "grossMarginUsd present when creditPriceUsd given");

// ── §11 ledger grant ──────────────────────────────────────────────────────────
section("§11 Credit Ledger — grant");

const grantResult = applyCreditGrant(5000, 10000);
assert(grantResult.creditsGranted === 10000, "granted credits match input");
assert(grantResult.balanceAfter   === 15000, "balance = previous + granted");

const grantZero = applyCreditGrant(1000, 0);
assert(grantZero.balanceAfter === 1000, "zero grant leaves balance unchanged");

const grantNeg = applyCreditGrant(1000, -100);
assert(grantNeg.balanceAfter === 1000, "negative grant ignored");

// ── §12 ledger debit ──────────────────────────────────────────────────────────
section("§12 Credit Ledger — debit");

const debit1 = applyCreditDebit(10000, 500);
assert(debit1.success,              "debit succeeds with sufficient balance");
assert(debit1.creditsDebited === 500, "credits debited as requested");
assert(debit1.balanceAfter   === 9500, "balance decreases correctly");

const debitInsufficient = applyCreditDebit(100, 500);
assert(!debitInsufficient.success,  "debit fails when balance < requested");
assert(debitInsufficient.error !== undefined, "error message provided");

const debitOverage = applyCreditDebit(100, 500, { allowOverage: true });
assert(debitOverage.success,         "debit succeeds with allowOverage=true");
assert(debitOverage.balanceAfter < 0, "balance goes negative with overage");
assert(debitOverage.warning !== undefined, "overage warning emitted");

const debitNeg = applyCreditDebit(1000, -50);
assert(!debitNeg.success, "negative debit amount rejected");

// ── §13 low balance warning ───────────────────────────────────────────────────
section("§13 Low balance warning");

assert(isCreditBalanceLow(50,    10000), "50 credits → low (below abs threshold 100)");
assert(isCreditBalanceLow(99,    10000), "99 credits → low (below abs threshold 100)");
assert(isCreditBalanceLow(100,   10000), "100 credits → low (fraction: 100/10000 = 1% < 10%)");
assert(!isCreditBalanceLow(2000, 10000), "2000/10000 = 20% → not low");
assert(!isCreditBalanceLow(5000, 10000), "5000/10000 = 50% → not low");

// ── §14 calculateCreditBalance ────────────────────────────────────────────────
section("§14 calculateCreditBalance");

const entries = [...lowBalanceLedgerFixture];
const balance = calculateCreditBalance("castillitos", entries);
assert(balance.availableCredits === 50,    "replayed balance is 50");
assert(balance.totalGranted     === 10000, "total granted = 10000");
assert(balance.totalDebited     === 9950,  "total debited = 9950");
assert(balance.isLow === true,             "balance flagged as low");

const emptyBalance = calculateCreditBalance("neworg", []);
assert(emptyBalance.availableCredits === 0, "empty ledger → zero balance");

// ── §15 createCreditLedgerEntry ───────────────────────────────────────────────
section("§15 createCreditLedgerEntry");

const newEntry = createCreditLedgerEntry({
  orgSlug: "castillitos",
  type:    "MONTHLY_GRANT",
  credits: 10000,
  reason:  "June 2026 grant",
});
assert(!!newEntry.id,                  "entry has an id");
assert(newEntry.orgSlug === "castillitos", "orgSlug preserved");
assert(newEntry.type    === "MONTHLY_GRANT", "type preserved");
assert(newEntry.credits === 10000,     "credits preserved");
assert(!!newEntry.createdAt,           "createdAt set");

// ── §16 validateAiUsageRecord ─────────────────────────────────────────────────
section("§16 validateAiUsageRecord");

const validResult = validateAiUsageRecord(castillitosDiegoFinanceUsage);
assert(validResult.valid,              "valid fixture passes validation");

const invalidResult = validateAiUsageRecord({});
assert(!invalidResult.valid,           "empty object fails validation");
assert(invalidResult.errors.length > 0, "errors populated for empty object");

const nullResult = validateAiUsageRecord(null);
assert(!nullResult.valid, "null input fails validation gracefully");

const badTokens = validateAiUsageRecord({ ...castillitosDiegoFinanceUsage, inputTokens: -1 });
assert(!badTokens.valid,  "negative inputTokens fails validation");

// ── §17 validateCreditLedgerEntry ─────────────────────────────────────────────
section("§17 validateCreditLedgerEntry");

const validLedger = validateCreditLedgerEntry(monthlyGrantFixture);
assert(validLedger.valid, "valid grant fixture passes validation");

const invalidLedger = validateCreditLedgerEntry({ orgSlug: "x" });
assert(!invalidLedger.valid, "incomplete ledger entry fails");
assert(invalidLedger.errors.some(e => e.includes("id")), "missing id error present");

// ── §18 auditAiBillingDomain ──────────────────────────────────────────────────
section("§18 auditAiBillingDomain");

const domainAudit = auditAiBillingDomain(
  [castillitosDiegoFinanceUsage, castillitosLucaMarketingUsage],
  [monthlyGrantFixture, usageDebitFixture],
);
assert(domainAudit.valid,   "domain audit passes with valid fixtures");
assert(domainAudit.checks === 4, "4 checks run (2 usage + 2 ledger)");
assert(domainAudit.failed === 0, "zero failures");

// ── §19 createAiBillingAuditEvent ─────────────────────────────────────────────
section("§19 createAiBillingAuditEvent");

const auditEvent = createAiBillingAuditEvent("usage_recorded", "castillitos", "Test event", { key: "val" });
assert(!!auditEvent.id,                       "event has id");
assert(auditEvent.type    === "usage_recorded", "type preserved");
assert(auditEvent.orgSlug === "castillitos",   "orgSlug preserved");
assert(auditEvent.message === "Test event",    "message preserved");
assert(!!auditEvent.occurredAt,               "occurredAt set");
assert(auditEvent.metadata?.key === "val",    "metadata preserved");

// ── §20 AiBillingResult factories ────────────────────────────────────────────
section("§20 AiBillingResult factories");

const successResult = successBillingResult("All good", { creditsUsed: 5 });
assert(successResult.success,           "success result has success=true");
assert(successResult.creditsUsed === 5, "creditsUsed passed through");
assert(successResult.errors.length === 0, "no errors in success");

const failResult = failedBillingResult("Validation failed", ["error A", "error B"]);
assert(!failResult.success,             "fail result has success=false");
assert(failResult.errors.length === 2, "errors preserved");

// ── §21 fixtures integrity ────────────────────────────────────────────────────
section("§21 Fixtures integrity");

assert(castillitosDiegoFinanceUsage.orgSlug     === "castillitos", "diego fixture orgSlug correct");
assert(castillitosDiegoFinanceUsage.usageKind   === "TEXT_GENERATION", "diego fixture usageKind correct");
assert(castillitosDiegoFinanceUsage.creditsUsed  > 0,              "diego fixture credits > 0");

assert(castillitosImageGenerationUsage.usageKind === "IMAGE_GENERATION", "image fixture usageKind correct");
assert(castillitosImageGenerationUsage.creditsUsed >= 100,              "image credits ≥ 100");

assert(castillitosVideoGenerationUsage.usageKind === "VIDEO_GENERATION", "video fixture usageKind correct");
assert(castillitosVideoGenerationUsage.creditsUsed >= 500,              "video credits ≥ 500");

assert(arketopsDocumentAnalysisUsage.usageKind   === "DOCUMENT_ANALYSIS", "doc fixture usageKind correct");
assert(arketopsDocumentAnalysisUsage.creditsUsed >= 5,                  "doc credits ≥ 5");

assert(castillitosAutonomousOperationUsage.autonomousOperationId !== undefined, "autonomous fixture has operationId");

assert(monthlyGrantFixture.type === "MONTHLY_GRANT",  "grant fixture type correct");
assert(monthlyGrantFixture.credits > 0,               "grant fixture credits positive");
assert(usageDebitFixture.type    === "USAGE_DEBIT",   "debit fixture type correct");
assert(usageDebitFixture.credits < 0,                 "debit fixture credits negative");

// ── §22 DEFAULT_CREDIT_RATES ──────────────────────────────────────────────────
section("§22 DEFAULT_CREDIT_RATES");

assert(DEFAULT_CREDIT_RATES["IMAGE_GENERATION"].minimumCredits  === 100, "IMAGE_GENERATION minimum = 100");
assert(DEFAULT_CREDIT_RATES["VIDEO_GENERATION"].minimumCredits  === 500, "VIDEO_GENERATION minimum = 500");
assert(DEFAULT_CREDIT_RATES["DOCUMENT_ANALYSIS"].minimumCredits === 5,   "DOCUMENT_ANALYSIS minimum = 5");
assert(DEFAULT_CREDIT_RATES["JSON_REASONING"].minimumCredits    === 2,   "JSON_REASONING minimum = 2");
assert(DEFAULT_CREDIT_RATES["TEXT_GENERATION"].minimumCredits   === 1,   "TEXT_GENERATION minimum = 1");

// ── Final report ──────────────────────────────────────────────────────────────

console.log("\n=================================================================");
console.log(`  AGENTIK-AI-BILLING-FOUNDATION-01 — Validation Suite`);
console.log("=================================================================");
console.log(`  Total:  ${passed + failed}`);
console.log(`  Pass:   ${passed}`);
console.log(`  Fail:   ${failed}`);
console.log(`  Verdict: ${failed === 0 ? "PASS ✓" : "FAIL ✗"}`);
if (failures.length > 0) {
  console.log("\n  Failed checks:");
  for (const f of failures) console.log(`    ✗ ${f}`);
}
console.log("=================================================================\n");

process.exit(failed === 0 ? 0 : 1);
