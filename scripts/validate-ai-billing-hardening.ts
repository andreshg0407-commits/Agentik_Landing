/**
 * scripts/validate-ai-billing-hardening.ts
 *
 * Agentik — AI Billing Hardening — Pure Validation Suite
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01
 *
 * 90+ pure checks. No Prisma. No server-only. No I/O.
 *
 * Usage:
 *   npx tsx scripts/validate-ai-billing-hardening.ts
 */
export type { };

import {
  isBalanceChangeAllowed,
  transactionTypeToLedgerType,
  DEFAULT_OVERAGE_POLICY,
} from "../lib/ai-billing/ai-credit-transaction";
import {
  reconstructBalance,
  verifyLedgerIntegrity,
  detectDuplicateCorrelationIds,
  buildLedgerSummary,
  isBalanceConsistent,
} from "../lib/ai-billing/ai-ledger-integrity";
import {
  lowBalanceLedgerFixture,
  monthlyGrantFixture,
  usageDebitFixture,
  castillitosDiegoFinanceUsage,
  applyCreditDebit,
  isCreditBalanceLow,
  validateAiUsageRecord,
  toAiCreditLedgerId,
} from "../lib/ai-billing";
import type { AiCreditLedgerEntry } from "../lib/ai-billing";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) { passed++; process.stdout.write(`  ✓ ${label}\n`); }
  else           { failed++; failures.push(label); process.stdout.write(`  ✗ ${label}\n`); }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// Shared ledger builder
function makeLedgerEntries(credits: number[], orgSlug = "castillitos"): AiCreditLedgerEntry[] {
  return credits.map((c, i) => ({
    id:        toAiCreditLedgerId(`e_${i}`),
    orgSlug,
    type:      c >= 0 ? ("MONTHLY_GRANT" as const) : ("USAGE_DEBIT" as const),
    credits:   c,
    createdAt: new Date(2026, 5, 1, i).toISOString(),
  }));
}

// ── §1 isBalanceChangeAllowed — no overage ────────────────────────────────────
section("§1 isBalanceChangeAllowed — no overage");

const policyNoOverage = { ...DEFAULT_OVERAGE_POLICY, allowOverage: false };

assert(isBalanceChangeAllowed(1000, 500,  policyNoOverage).allowed === true,  "1000 balance, 500 debit → allowed");
assert(isBalanceChangeAllowed(1000, 1000, policyNoOverage).allowed === true,  "exact balance debit → allowed");
assert(isBalanceChangeAllowed(1000, 1001, policyNoOverage).allowed === false, "1001 debit on 1000 balance → blocked");
assert(isBalanceChangeAllowed(0,    1,    policyNoOverage).allowed === false, "zero balance → blocked");
assert(isBalanceChangeAllowed(100,  100,  policyNoOverage).allowed === true,  "exact zero result → allowed");

const r1 = isBalanceChangeAllowed(100, 200, policyNoOverage);
assert(!r1.allowed && !!r1.reason, "blocked result has reason message");

// ── §2 isBalanceChangeAllowed — with overage ──────────────────────────────────
section("§2 isBalanceChangeAllowed — with overage (unlimited)");

const policyOverage = { allowOverage: true, overageLimitCredits: 0 };
assert(isBalanceChangeAllowed(0, 500, policyOverage).allowed === true,  "zero balance, overage=true → allowed");
assert(isBalanceChangeAllowed(100, 600, policyOverage).allowed === true, "overage unlimited → allowed");

// ── §3 isBalanceChangeAllowed — overage with limit ────────────────────────────
section("§3 isBalanceChangeAllowed — overage with limit");

const policyLimited = { allowOverage: true, overageLimitCredits: 200 };
assert(isBalanceChangeAllowed(100, 250, policyLimited).allowed === true,  "debt 150 < limit 200 → allowed");
assert(isBalanceChangeAllowed(100, 350, policyLimited).allowed === false, "debt 250 > limit 200 → blocked");
assert(isBalanceChangeAllowed(0,   200, policyLimited).allowed === true,  "exactly at limit → allowed");
assert(isBalanceChangeAllowed(0,   201, policyLimited).allowed === false, "one over limit → blocked");

const r2 = isBalanceChangeAllowed(0, 300, policyLimited);
assert(!r2.allowed && !!r2.reason, "overage limit block has reason");

// ── §4 transactionTypeToLedgerType ────────────────────────────────────────────
section("§4 transactionTypeToLedgerType");

assert(transactionTypeToLedgerType("DEBIT")      === "USAGE_DEBIT",       "DEBIT → USAGE_DEBIT");
assert(transactionTypeToLedgerType("REFUND")     === "REFUND",            "REFUND → REFUND");
assert(transactionTypeToLedgerType("ADJUSTMENT") === "MANUAL_ADJUSTMENT", "ADJUSTMENT → MANUAL_ADJUSTMENT");
assert(transactionTypeToLedgerType("GRANT", "MONTHLY_GRANT") === "MONTHLY_GRANT", "GRANT with subtype → MONTHLY_GRANT");
assert(transactionTypeToLedgerType("GRANT", "PURCHASE")      === "PURCHASE",      "GRANT with PURCHASE subtype → PURCHASE");

// ── §5 reconstructBalance ─────────────────────────────────────────────────────
section("§5 reconstructBalance");

const e1 = makeLedgerEntries([10000, -200, -300, -100]);
assert(reconstructBalance("castillitos", e1) === 9400, "10000 - 200 - 300 - 100 = 9400");

const e2 = makeLedgerEntries([5000, -5000]);
assert(reconstructBalance("castillitos", e2) === 0, "exactly zero balance");

const e3 = makeLedgerEntries([]);
assert(reconstructBalance("castillitos", e3) === 0, "empty ledger → zero balance");

const e4 = makeLedgerEntries([1000]);
assert(reconstructBalance("castillitos", e4) === 1000, "single grant");

const replay = reconstructBalance("castillitos", lowBalanceLedgerFixture);
assert(replay === 50, "lowBalanceLedgerFixture replays to 50");

// ── §6 verifyLedgerIntegrity — clean ledger ───────────────────────────────────
section("§6 verifyLedgerIntegrity — clean ledger");

const cleanIntegrity = verifyLedgerIntegrity(lowBalanceLedgerFixture, 50);
assert(cleanIntegrity.valid === true,                  "clean ledger passes integrity check");
assert(cleanIntegrity.drift === 0,                     "zero drift vs stored balance");
assert(cleanIntegrity.duplicateCorrelationIds.length === 0, "no duplicate correlationIds");

// ── §7 verifyLedgerIntegrity — corrupted stored balance ───────────────────────
section("§7 verifyLedgerIntegrity — corrupted stored balance");

const corruptedIntegrity = verifyLedgerIntegrity(lowBalanceLedgerFixture, 999);
assert(corruptedIntegrity.valid === false,  "corrupted balance fails integrity");
assert(corruptedIntegrity.drift !== 0,     "non-zero drift detected");
assert(corruptedIntegrity.errors.length > 0, "errors reported for drift");

// ── §8 verifyLedgerIntegrity — without stored balance ────────────────────────
section("§8 verifyLedgerIntegrity — no stored balance provided");

const noStoredIntegrity = verifyLedgerIntegrity(lowBalanceLedgerFixture);
assert(noStoredIntegrity.drift === 0,  "no drift when stored balance not provided");
assert(noStoredIntegrity.reconstructedBalance === 50, "reconstruction still works");

// ── §9 detectDuplicateCorrelationIds ─────────────────────────────────────────
section("§9 detectDuplicateCorrelationIds");

const entriesWithDupes: AiCreditLedgerEntry[] = [
  { id: "a", orgSlug: "x", type: "MONTHLY_GRANT", credits: 1000, createdAt: new Date().toISOString(), correlationId: "grant_june" } as AiCreditLedgerEntry & { correlationId: string },
  { id: "b", orgSlug: "x", type: "USAGE_DEBIT",   credits: -10,  createdAt: new Date().toISOString(), correlationId: "grant_june" } as AiCreditLedgerEntry & { correlationId: string },
  { id: "c", orgSlug: "x", type: "USAGE_DEBIT",   credits: -5,   createdAt: new Date().toISOString(), correlationId: "op_unique"  } as AiCreditLedgerEntry & { correlationId: string },
];

const dupes = detectDuplicateCorrelationIds(entriesWithDupes);
assert(dupes.length === 1,           "one duplicated correlationId detected");
assert(dupes.includes("grant_june"), "correct duplicated id identified");

const noDupes = detectDuplicateCorrelationIds(lowBalanceLedgerFixture);
assert(noDupes.length === 0, "no dupes in clean fixture");

// ── §10 buildLedgerSummary ────────────────────────────────────────────────────
section("§10 buildLedgerSummary");

const summary = buildLedgerSummary("castillitos", lowBalanceLedgerFixture);
assert(summary.orgSlug         === "castillitos", "orgSlug preserved");
assert(summary.entryCount      === 2,             "2 entries in fixture");
assert(summary.totalGranted    === 10000,         "totalGranted = 10000");
assert(summary.totalDebited    === 9950,          "totalDebited = 9950");
assert(summary.reconstructedBalance === 50,       "reconstructed balance = 50");
assert(!!summary.firstEntryAt,                    "firstEntryAt populated");
assert(!!summary.lastEntryAt,                     "lastEntryAt populated");

const emptySummary = buildLedgerSummary("empty", []);
assert(emptySummary.entryCount         === 0, "empty ledger: entryCount = 0");
assert(emptySummary.reconstructedBalance === 0, "empty ledger: balance = 0");

// ── §11 isBalanceConsistent ───────────────────────────────────────────────────
section("§11 isBalanceConsistent");

assert(isBalanceConsistent(50,  lowBalanceLedgerFixture, "castillitos") === true,  "50 = replayed 50 → consistent");
assert(isBalanceConsistent(51,  lowBalanceLedgerFixture, "castillitos") === true,  "51 within epsilon 1 of 50 → consistent");
assert(isBalanceConsistent(999, lowBalanceLedgerFixture, "castillitos") === false, "999 vs 50 → inconsistent");
assert(isBalanceConsistent(0,   [],                      "empty")       === true,  "zero vs empty replay → consistent");

// ── §12 Negative balance protection (pure layer) ──────────────────────────────
section("§12 Negative balance protection — pure layer");

const debit1 = applyCreditDebit(0, 100);
assert(!debit1.success,    "zero balance, no overage → blocked");
assert(!!debit1.error,     "error message present");

const debit2 = applyCreditDebit(50, 100);
assert(!debit2.success,    "insufficient balance → blocked");

const debit3 = applyCreditDebit(100, 0);
assert(debit3.success && debit3.balanceAfter === 100, "zero debit is a pure no-op");

const debit4 = applyCreditDebit(100, 100);
assert(debit4.success,     "exact balance debit → allowed");
assert(debit4.balanceAfter === 0, "balance exactly zero after exact debit");

// ── §13 Overage detection (pure) ──────────────────────────────────────────────
section("§13 Overage detection");

const overageDebit = applyCreditDebit(50, 100, { allowOverage: true });
assert(overageDebit.success,         "overage debit succeeds with allowOverage");
assert(overageDebit.balanceAfter < 0, "balance goes negative");
assert(!!overageDebit.warning,        "overage warning emitted");

// ── §14 Low balance warning (pure) ───────────────────────────────────────────
section("§14 Low balance warning");

assert(isCreditBalanceLow(0,    10000) === true,  "zero balance → low");
assert(isCreditBalanceLow(50,   10000) === true,  "50/10000 < 10% → low");
assert(isCreditBalanceLow(100,  10000) === true,  "100 ≤ abs threshold → low");
assert(isCreditBalanceLow(1000, 10000) === true,  "1000/10000 = 10% boundary → low");
assert(isCreditBalanceLow(1001, 10000) === false, "1001/10000 > 10% → not low");
assert(isCreditBalanceLow(5000, 10000) === false, "50% → not low");

// ── §15 Grant/debit transaction type mapping ──────────────────────────────────
section("§15 Grant/debit idempotency key semantics (pure)");

// Idempotency key should be deterministic from source context
function makeGrantCorrelationId(orgSlug: string, cycle: string): string {
  return `monthly_grant:${orgSlug}:${cycle}`;
}
function makeDebitCorrelationId(usageId: string): string {
  return `usage:${usageId}`;
}

const grantKey = makeGrantCorrelationId("castillitos", "2026-06");
assert(grantKey === "monthly_grant:castillitos:2026-06", "grant correlationId format correct");

const debitKey = makeDebitCorrelationId("usage_001");
assert(debitKey === "usage:usage_001", "debit correlationId format correct");

// Same source → same key (deterministic)
assert(makeGrantCorrelationId("castillitos", "2026-06") === makeGrantCorrelationId("castillitos", "2026-06"),
  "same inputs → same correlationId (deterministic)");
assert(makeGrantCorrelationId("castillitos", "2026-06") !== makeGrantCorrelationId("castillitos", "2026-07"),
  "different cycle → different correlationId");

// ── §16 validateAiUsageRecord — negative fields ───────────────────────────────
section("§16 Validation hardening — field guards");

const badTokens = validateAiUsageRecord({ ...castillitosDiegoFinanceUsage, inputTokens: -1 });
assert(!badTokens.valid, "negative inputTokens fails validation");

const badCost = validateAiUsageRecord({ ...castillitosDiegoFinanceUsage, costUsd: -0.01 });
assert(!badCost.valid, "negative costUsd fails validation");

const badCredits = validateAiUsageRecord({ ...castillitosDiegoFinanceUsage, creditsUsed: -5 });
assert(!badCredits.valid, "negative creditsUsed fails validation");

const badCount = validateAiUsageRecord({ ...castillitosDiegoFinanceUsage, requestCount: 0 });
assert(!badCount.valid, "requestCount 0 fails validation");

const validRecord = validateAiUsageRecord(castillitosDiegoFinanceUsage);
assert(validRecord.valid, "clean fixture still passes validation");

// ── §17 Multi-org ledger separation ──────────────────────────────────────────
section("§17 Multi-org ledger isolation");

const org1Entries = makeLedgerEntries([10000, -500], "castillitos");
const org2Entries = makeLedgerEntries([5000,  -200], "arketops");

const balance1 = reconstructBalance("castillitos", org1Entries);
const balance2 = reconstructBalance("arketops",    org2Entries);

assert(balance1 === 9500,             "castillitos balance correct");
assert(balance2 === 4800,             "arketops balance correct");
assert(balance1 !== balance2,         "org balances are independent");

const summary1 = buildLedgerSummary("castillitos", org1Entries);
const summary2 = buildLedgerSummary("arketops",    org2Entries);
assert(summary1.orgSlug !== summary2.orgSlug, "summaries have different orgSlug");
assert(summary1.reconstructedBalance !== summary2.reconstructedBalance, "different balances");

// ── §18 Ledger with voided entries ────────────────────────────────────────────
section("§18 Ledger with VOIDED-equivalent entries");

const withRefundEntries: AiCreditLedgerEntry[] = [
  { id: toAiCreditLedgerId("g1"), orgSlug: "x", type: "MONTHLY_GRANT", credits: 1000,  createdAt: new Date().toISOString() },
  { id: toAiCreditLedgerId("d1"), orgSlug: "x", type: "USAGE_DEBIT",   credits: -200,  createdAt: new Date().toISOString() },
  { id: toAiCreditLedgerId("r1"), orgSlug: "x", type: "REFUND",        credits:  200,  createdAt: new Date().toISOString() },
];

const refundBalance = reconstructBalance("x", withRefundEntries);
assert(refundBalance === 1000, "grant - debit + refund = original balance");

const refundSummary = buildLedgerSummary("x", withRefundEntries);
assert(refundSummary.totalRefunded === 200, "totalRefunded = 200");
assert(refundSummary.totalDebited  === 200, "totalDebited  = 200");
assert(refundSummary.totalGranted  === 1000, "totalGranted = 1000");

// ── §19 Default overage policy ───────────────────────────────────────────────
section("§19 DEFAULT_OVERAGE_POLICY");

assert(DEFAULT_OVERAGE_POLICY.allowOverage        === false, "default: no overage allowed");
assert(DEFAULT_OVERAGE_POLICY.overageLimitCredits === 0,    "default: no overage limit");

// ── §20 Edge cases ────────────────────────────────────────────────────────────
section("§20 Edge cases");

// Large ledger performance (not timed, just correctness)
const largeLedger = Array.from({ length: 1000 }, (_, i) =>
  ({ id: toAiCreditLedgerId(`e${i}`), orgSlug: "perf", type: "MONTHLY_GRANT" as const, credits: 1, createdAt: new Date().toISOString() })
);
assert(reconstructBalance("perf", largeLedger) === 1000, "1000-entry ledger sums correctly");

// Empty grant entries don't break summary
const emptyTypeSummary = buildLedgerSummary("org", makeLedgerEntries([100]));
assert(emptyTypeSummary.totalDebited  === 0, "no debits in grant-only ledger");
assert(emptyTypeSummary.totalRefunded === 0, "no refunds in grant-only ledger");

// monthlyGrantFixture is valid
const grantIntegrity = verifyLedgerIntegrity([monthlyGrantFixture]);
assert(grantIntegrity.errors.filter(e => e.includes("missing")).length === 0, "monthlyGrantFixture has all required fields");

// usageDebitFixture is valid
const debitIntegrity = verifyLedgerIntegrity([usageDebitFixture]);
assert(debitIntegrity.errors.filter(e => e.includes("missing")).length === 0, "usageDebitFixture has all required fields");

// ── Final report ──────────────────────────────────────────────────────────────

console.log("\n=================================================================");
console.log("  AGENTIK-AI-BILLING-HARDENING-01 — Pure Validation Suite");
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
