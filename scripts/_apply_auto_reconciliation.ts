/**
 * _apply_auto_reconciliation.ts
 *
 * Sprint S3 Phase 1 — Safe apply mode for auto-reconciliation.
 *
 * MUTATES THE DATABASE. Run dry-run first.
 *
 * Calls applyReconciliationPlan() which:
 *   - Processes each (cobro → receivable) pair in its own transaction
 *   - Creates an immutable CollectionAllocation audit record per pair
 *   - Updates CustomerReceivable.paidAmount / balanceDue / status
 *   - Updates CollectionRecord.appliedStatus = APPLIED
 *   - Skips already-applied pairs (idempotent via @@unique constraint)
 *   - Skips PAID/WRITTEN_OFF receivables (re-validated inside each tx)
 *   - Never throws on individual pair failure — errors collected, not propagated
 *
 * Safety gates:
 *   1. Must set CONFIRM=yes to proceed past the confirmation prompt
 *   2. Builds dry-run plan first and prints summary before applying
 *   3. LIMIT env var caps cobros processed (for staged rollouts)
 *   4. Resume-safe: already-applied pairs are detected and skipped
 *
 * Usage:
 *   CONFIRM=yes ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_apply_auto_reconciliation.ts
 *
 * Optional:
 *   LIMIT=100       — cap number of cobros in plan (staged rollout)
 *   BATCH_LOG=true  — print one line per applied pair (verbose)
 */

import { prisma } from "@/lib/prisma";
import { buildReconciliationPlan, applyReconciliationPlan } from "@/lib/reconciliation/reconciliation-engine";
import { getReconciliationSummary } from "@/lib/reconciliation/reconciliation-audit";

const ORG_SLUG  = process.env.ORG_SLUG ?? "castillitos";
const CONFIRM   = process.env.CONFIRM === "yes";
const LIMIT     = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
const BATCH_LOG = process.env.BATCH_LOG === "true";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  SPRINT S3 PHASE 1 — AUTO RECONCILIATION APPLY ENGINE         "));
  console.log(B("  WRITES TO DATABASE — READ CAREFULLY BEFORE PROCEEDING        "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  // ── Safety gate ───────────────────────────────────────────────────────────
  if (!CONFIRM) {
    console.log(R("ABORTED: CONFIRM env var not set to 'yes'."));
    console.log(Y("\n  This script MUTATES the database. To proceed:"));
    console.log(C(`\n    CONFIRM=yes ORG_SLUG=${ORG_SLUG} npx dotenv-cli -e .env -- npx tsx scripts/_apply_auto_reconciliation.ts`));
    console.log(Y("\n  Run dry-run first if you haven't:"));
    console.log(C(`    ORG_SLUG=${ORG_SLUG} npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts\n`));
    process.exit(0);
  }

  // ── Resolve org ───────────────────────────────────────────────────────────
  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org  : ${B(org.name)} (${orgId})`);
  if (LIMIT) console.log(`Limit: ${LIMIT} cobros (set via LIMIT env var)`);
  console.log();

  // ── Build plan (read-only) ─────────────────────────────────────────────────
  const tPlan = Date.now();
  console.log(C("Building reconciliation plan (read-only)..."));
  const plan = await buildReconciliationPlan(orgId, { limit: LIMIT });
  console.log(G(`Plan built in ${Date.now() - tPlan}ms\n`));

  // ── Pre-apply summary ─────────────────────────────────────────────────────
  console.log(B("── PRE-APPLY SUMMARY ───────────────────────────────────────────"));
  console.log(`\n  Cobros analyzed   : ${plan.totalCobros.toLocaleString()}`);
  console.log(`  Pairs to apply    : ${G(plan.qualifiedPairs.length.toLocaleString())}`);
  console.log(`  Amount to apply   : ${G(fmtCOP(plan.totalAmountApplied))}`);
  console.log(`  Invoices → PAID   : ${G(String(plan.projectedPaidCount))}`);
  console.log(`  Invoices → PARTIAL: ${Y(String(plan.projectedPartialCount))}`);
  console.log(`  Skipped           : ${Y(plan.skippedCobros.length.toLocaleString())}`);
  console.log(`  Unmatched         : ${R(plan.unmatchedCobros.length.toLocaleString())}\n`);

  if (plan.qualifiedPairs.length === 0) {
    console.log(Y("No qualified pairs. Nothing to apply."));
    console.log(Y("(All eligible cobros may already be applied, or no receivables match.)\n"));
    await printPostApplySummary(orgId);
    return;
  }

  // ── Confirm proceed ───────────────────────────────────────────────────────
  console.log(B("── APPLYING NOW ────────────────────────────────────────────────"));
  console.log(Y(`\n  Applying ${plan.qualifiedPairs.length} pairs. This cannot be undone via this script.`));
  console.log(Y("  (Each pair is idempotent — safe to re-run if interrupted.)\n"));

  // ── Execute apply engine ───────────────────────────────────────────────────
  const tApply = Date.now();
  let lastProgressAt = Date.now();
  let progressCount = 0;

  // Instrument plan pairs with progress logging if BATCH_LOG
  // The engine processes pairs sequentially; we hook via wrapper
  const wrappedPlan = BATCH_LOG
    ? {
        ...plan,
        // We'll log after via result.applied iteration — not before (engine doesn't callback)
      }
    : plan;

  const result = await applyReconciliationPlan(wrappedPlan);
  const elapsed = Date.now() - tApply;

  // ── Per-pair log (if BATCH_LOG) ────────────────────────────────────────────
  if (BATCH_LOG && result.applied.length > 0) {
    console.log(B("\n── APPLIED PAIRS (BATCH_LOG=true) ──────────────────────────────"));
    console.log(`\n  ${"cobroId".padEnd(28)} ${"erpId".padEnd(14)} ${"Applied".padStart(14)} ${"RemBal".padStart(14)} ${"Status→".padStart(9)} ${"Rule".padEnd(18)} ${"Conf"}`);
    console.log(`  ${"-".repeat(105)}`);
    for (const p of result.applied) {
      const statusColor = p.statusAfter === "PAID" ? G : p.statusAfter === "PARTIAL" ? Y : (s: string) => s;
      const ts = new Date().toISOString();
      console.log(
        `  ${p.cobroId.padEnd(28)} ${p.erpId.padEnd(14)} ${fmtCOP(p.amountApplied).padStart(14)} ${fmtCOP(p.balanceAfter).padStart(14)} ${statusColor(p.statusAfter.padStart(9))} ${p.ruleId.padEnd(18)} ${p.confidence}`
      );
    }
  }

  // ── Error report ──────────────────────────────────────────────────────────
  if (result.errored.length > 0) {
    console.log(B("\n── ERRORS ──────────────────────────────────────────────────────"));
    console.log(R(`\n  ${result.errored.length} pair(s) failed to apply:\n`));
    for (const e of result.errored) {
      console.log(R(`  cobroId=${e.cobroId.slice(0, 8)}... error=${e.error}`));
    }
  }

  // ── Apply result summary ───────────────────────────────────────────────────
  const totalApplied    = result.applied.reduce((s, p) => s + p.amountApplied, 0);
  const paidCount       = result.applied.filter(p => p.statusAfter === "PAID").length;
  const partialCount    = result.applied.filter(p => p.statusAfter === "PARTIAL").length;
  const uniqueRxTouched = new Set(result.applied.map(p => p.receivableId)).size;

  console.log(B("\n── APPLY RESULT ────────────────────────────────────────────────"));
  console.log(`
  Pairs applied         : ${G(String(result.applied.length))} of ${plan.qualifiedPairs.length} planned
  Pairs errored         : ${result.errored.length > 0 ? R(String(result.errored.length)) : G("0")}
  Amount applied (COP)  : ${G(fmtCOP(totalApplied))}
  Receivables touched   : ${G(String(uniqueRxTouched))}
  Invoices → PAID       : ${G(String(paidCount))}
  Invoices → PARTIAL    : ${Y(String(partialCount))}
  Duration              : ${fmtDuration(elapsed)}
  `);

  // ── Live DB summary (post-apply) ───────────────────────────────────────────
  await printPostApplySummary(orgId);

  // ── Final status ──────────────────────────────────────────────────────────
  console.log(B("═══════════════════════════════════════════════════════════════"));
  if (result.errored.length === 0) {
    console.log(G("  APPLY COMPLETE — ALL PAIRS COMMITTED SUCCESSFULLY"));
  } else {
    console.log(Y(`  APPLY COMPLETE WITH ${result.errored.length} ERROR(S) — CHECK ABOVE`));
  }
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  console.log(`  Audit trail: SELECT * FROM "CollectionAllocation" WHERE "organizationId" = '${orgId}' ORDER BY "createdAt" DESC LIMIT 50;`);
  console.log(`\n  Re-run dry-run to verify zero qualified pairs remain:`);
  console.log(C(`    ORG_SLUG=${ORG_SLUG} npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts\n`));
}

async function printPostApplySummary(orgId: string) {
  try {
    const summary = await getReconciliationSummary(orgId);

    console.log(B("\n── LIVE DB STATE (POST-APPLY) ──────────────────────────────────"));
    console.log(`
  CollectionAllocations : ${G(summary.totalAllocations.toLocaleString())} total records
  Amount applied total  : ${G(fmtCOP(summary.totalAmountApplied))}
  Cobros APPLIED        : ${G(summary.cobrosApplied.toLocaleString())}
  Cobros AVAILABLE      : ${Y(summary.cobrosAvailable.toLocaleString())}

  Receivable balance    : ${Y(fmtCOP(summary.rxTotalBalance))} remaining
  Receivables OPEN      : ${summary.rxOpenCount.toLocaleString()}
  Receivables PARTIAL   : ${Y(summary.rxPartialCount.toLocaleString())}
  Receivables PAID      : ${G(summary.rxPaidCount.toLocaleString())}

  Confidence breakdown:`);

    for (const [conf, cnt] of Object.entries(summary.byConfidence)) {
      const color = conf === "HIGH" ? G : conf === "MEDIUM" ? Y : R;
      console.log(`    ${conf.padEnd(8)} : ${color(String(cnt))}`);
    }
    console.log();
  } catch (e) {
    console.log(Y("  (Could not fetch post-apply DB summary — non-fatal)"));
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
